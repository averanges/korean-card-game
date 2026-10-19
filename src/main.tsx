import {MobileHud} from './MobileHud';
import {useCompactViewport} from './useCompactViewport';
import {AppShell} from './AppShell';
import {GameMenu} from './GameMenu';
import {useProfile} from './ProfileContext';
import {resolveDeck} from './decks';
import {createDeckGame} from './gameFactory';
import './academy.css';
import {MagicDialogContent} from './MagicDialogContent';
import {TableCard} from './TableCard';
import {RoomLobby} from './rooms/RoomLobby';
import {botAction,applyLocalAction,type BotMemory} from './bot';
import {winnerText,noticeText} from './gameText';
import {spells} from './spells';
import {availableCards,blindAttack,singleAttack,hatTargets,magicUnavailable,isLocked} from './trickRules';
import {makeMagicQuiz,quizWordKey,type MagicQuiz,type QuizDirection} from './magicQuiz';
import {TurnIndicator} from './TurnIndicator';
import {useTableLayout} from './useTableLayout';
import {TrumpChoice} from './TrumpChoice';
import {legendaryTimings} from './animationModel';
import {MagicStatus} from './MagicStatus';
import {MagicBurn} from './MagicBurn';
import {BoardImpact} from './BoardImpact';
import {AnimationContext,captureBoard,useGameAnimations} from './useGameAnimations';
import {GameAnimationLayer} from './GameAnimationLayer';
import {OrdinaryHand} from './OrdinaryHand';
import {MagicHand} from './MagicHand';
import {splitHand,toggleHandSelection} from './handModel';
import {speakKorean} from './speech';
import {EffectIndicators} from './EffectIndicators';
import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame, beats, canAttack, finished, canUseMagic, gameDictionary, ranks, suits, normalCount, type Card, type Action } from './engine';
import { words } from './words';
import './style.css';
import './hand.css';
import './animations.css';
import './boardImpacts.css';import './legendary.css';import './tableLayout.css';import './tricks.css';import './mobile.css';
type CardStyle = React.CSSProperties & {[key: `--${string}`]: string | number};
function App({active:screenActive=true}:{active?:boolean}){
 const compact=useCompactViewport();
 const {profile}=useProfile(); const translations=profile.settings.translations,simpleAnimations=profile.settings.reducedMotion; const [menuPaused,setMenuPaused]=useState(false);
 const tableRef=useTableLayout(screenActive),botMemory=useRef<BotMemory>({});
 const [g,setG]=useState(()=>createDeckGame(resolveDeck(profile.selectedDeckId,profile.decks))),[selected,setSelected]=useState<string[]>([]),[revealed,setRevealed]=useState<string[]>([]),[spell,setSpell]=useState<string>(),[answer,setAnswer]=useState(''),[quiz,setQuiz]=useState<MagicQuiz>({index:0,direction:'ko-ru',prompt:words[0].ko,correct:words[0].ru,options:[words[0].ru]}),[feedback,setFeedback]=useState(''),[help,setHelp]=useState(false),[tts,setTts]=useState(''),[hasActed,setHasActed]=useState(false),[magicPanel,setMagicPanel]=useState(false),[reducedMotion,setReducedMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [quizResult,setQuizResult]=useState<{card:Card;correct:boolean;simple:boolean;question:number;direction:QuizDirection;answer:string}>();
 const [fateSelection,setFateSelection]=useState<{card:Card;question:number;direction:QuizDirection;answer:string;current:number;selected?:number}>();
 const [hatSelection,setHatSelection]=useState<{card:Card;question:number;direction:QuizDirection;answer:string}>();
 const hatSubmitted=useRef(false);
 const submitted=useRef(false),recentQuestions=useRef<string[]>([]),botDecisions=useRef(new WeakMap<object,Action|undefined>());
 const simple=simpleAnimations||reducedMotion;
 const motion=useGameAnimations(simple);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setReducedMotion(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 useEffect(()=>{motion.start(g);},[]);
 const botCards=availableCards(g,1).slice(0,12);
 const pendingBot=new Set(motion.entries.filter(e=>(e.type==='cards_drawn'||e.type==='magic_received')&&e.player===1).flatMap(e=>e.cards.map(c=>c.id)));
 const botPresented=g.hands[1].filter(c=>!pendingBot.has(c.id));
 const magicFlashes=motion.entries.filter(e=>e.type==='magic_activated');
 const worldClass=(magicFlashes.some(e=>e.magicId==='mirror')?' rank-flash':'')+(magicFlashes.some(e=>e.magicId==='chance')?' flash-deck':'')+(magicFlashes.some(e=>e.magicId==='fate')?' flash-trump':'');

 const hand=splitHand(g.hands[0]),playable=availableCards(g,0),blind=blindAttack(g,0);
 useEffect(()=>{if(!feedback||spell)return;const t=setTimeout(()=>setFeedback(''),4500);return()=>clearTimeout(t);},[feedback,spell]);
 const spellCard=spell?(g.hands[0].find(c=>c.id===spell)||quizResult?.card):undefined; const active=spells.find(s=>s.id===spellCard?.spell); const question=gameDictionary(g)[quiz.index];
 useEffect(()=>{if(!quizResult)return;const timer=setTimeout(()=>{if(quizResult.correct&&quizResult.card.spell==='fate')setFateSelection({card:quizResult.card,question:quizResult.question,direction:quizResult.direction,answer:quizResult.answer,current:g.trump});if(quizResult.correct&&quizResult.card.spell==='magicians_hat'){hatSubmitted.current=false;setHatSelection({card:quizResult.card,question:quizResult.question,direction:quizResult.direction,answer:quizResult.answer});setSelected([]);}setSpell(undefined);setQuizResult(undefined);},quizResult.correct?(quizResult.simple?180:legendaryTimings.answer):(quizResult.simple?950:legendaryTimings.wrongAnswer+legendaryTimings.burn+40));return()=>clearTimeout(timer);},[quizResult]);
 useEffect(()=>{if(fateSelection?.selected===undefined)return;const timer=setTimeout(()=>setFateSelection(undefined),140);return()=>clearTimeout(timer);},[fateSelection?.selected]);
 function openSpell(c:Card){
  const unavailable=magicUnavailable(g,0,c.spell||'');if(unavailable){setFeedback(unavailable);return;}if(hatSelection||!canUseMagic(g,0)||motion.entries.some(e=>e.type==='magic_received'&&e.cards.some(x=>x.id===c.id)))return;
  const dictionary=gameDictionary(g),next=makeMagicQuiz(dictionary,recentQuestions.current);
  if(!next){setFeedback('В словаре партии нет однозначного задания. Магическая карта сохранена.');return;}
  recentQuestions.current=[...recentQuestions.current,quizWordKey(dictionary[next.index])].slice(-6);
  submitted.current=false;setQuizResult(undefined);setQuiz(next);setAnswer('');setFeedback('');setSpell(c.id);
 }
 useEffect(()=>{if(!spell&&!help)return;const before=document.activeElement as HTMLElement;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(spell&&submitted.current)return;setSpell(undefined);setHelp(false);}};window.addEventListener('keydown',close);document.querySelector<HTMLButtonElement>('.overlay button')?.focus();return()=>{window.removeEventListener('keydown',close);before?.focus();};},[spell,help]);
 function dispatch(a:Action){const positions=a.type==='end'?captureBoard():[];const next=applyLocalAction(g,a,botMemory.current);if(next===g)return;motion.transition(g,next,a,positions);setG(next);setHasActed(true);setSelected(ids=>a.type==='end'||a.type==='take'||next.attacker!==g.attacker||next.winner?[]:ids.filter(id=>next.hands[0].some(c=>!c.spell&&!isLocked(next,c)&&c.id===id)));}
 function selectOrdinary(c:Card){if(isLocked(g,c))return;if(hatSelection){if(hatSubmitted.current||!hatTargets(g,0).some(x=>x.id===c.id))return;hatSubmitted.current=true;dispatch({type:'magic',player:0,id:hatSelection.card.id,question:hatSelection.question,direction:hatSelection.direction,answer:hatSelection.answer,targetId:c.id});setHatSelection(undefined);return;}if(blind){dispatch({type:'attack',player:0,ids:[c.id]});return;}const selecting=!selected.includes(c.id);setSelected(ids=>toggleHandSelection(ids,c,hand.ordinary,g.attacker===0));if(selecting)speak(c);}
 useEffect(()=>{if(!screenActive||menuPaused||spell||help||magicPanel||fateSelection||hatSelection)return;if(!botDecisions.current.has(g))botDecisions.current.set(g,botAction(g,botMemory.current));const a=botDecisions.current.get(g);if(a){const timer=setTimeout(()=>dispatch(a),850);return()=>clearTimeout(timer);}},[g,screenActive,menuPaused,spell,help,magicPanel,fateSelection,hatSelection]);
 function speak(c:Card){void speakKorean(c.word.ko,setTts);}

 function card(c:Card){const cue=motion.entries.find(e=>['card_attack','card_throw_in','card_defend'].includes(e.type)&&e.cards[0]?.id===c.id);const reveal=()=>setRevealed(prev=>prev.includes(c.id)?prev.filter(id=>id!==c.id):[...prev,c.id]);return <TableCard card={c} cue={cue} selected={selected.includes(c.id)} translation={translations||revealed.includes(c.id)?c.word.ru:'•••'} onClick={reveal} onReveal={reveal} onSpeak={()=>speak(c)}/>;}
 const chosen=g.hands[0].filter(c=>selected.includes(c.id));const attackValid=!blind&&!hatSelection&&(!singleAttack(g,0)||chosen.length===1)&&chosen.length>0&&chosen.every(c=>canAttack(g,c))&&g.table.length+chosen.length<=g.limit&&(g.table.length>0||chosen.every(c=>c.rank===chosen[0].rank));
 if(!screenActive)return null;
 return <AnimationContext.Provider value={motion.entries}><main ref={tableRef} className={'game-table '+(compact?'compact-layout ':'')+(simple?"simple-motion":"full-motion")+worldClass+(hatSelection?' hat-selecting':'')} style={{'--mirror-delay':((magicFlashes.find(e=>e.magicId==='mirror')?.delay||0)+legendaryTimings.indicatorStart)+'ms'} as React.CSSProperties}><GameMenu deckLabel={g.wordDeck?.name} onPause={setMenuPaused} onNew={()=>{const next=createDeckGame(resolveDeck(profile.selectedDeckId,profile.decks));botMemory.current={};setG(next);motion.start(next);setSpell(undefined);setHelp(false);setFeedback('');setSelected([]);setRevealed([]);setHasActed(false);setQuizResult(undefined);setFateSelection(undefined);setHatSelection(undefined);submitted.current=false;recentQuestions.current=[];}}/>
 {compact?<MobileHud attacking={g.attacker===0} result={winnerText(g.winner)} name="Соперник · бот" ordinary={normalCount(botPresented)} magic={botPresented.filter(c=>c.spell).length} trump={g.trump} deck={g.deck.length} simple={simple} connection="Одиночная игра"/>:<><section className="statusbar"><TurnIndicator attacking={g.attacker===0} winner={winnerText(g.winner)}/><div className="opponent"><span>♟</span><div><strong>{normalCount(botPresented)} карт{botPresented.some(c=>c.spell)?<small className="extra-count"> · ✦ {botPresented.filter(c=>c.spell).length}</small>:null}</strong><small>Соперник · бот</small></div></div><MagicStatus trump={g.trump} count={g.deck.length} simple={simple}/></section>
 <div className="bot-hand" aria-label={`У бота ${normalCount(g.hands[1])} обычных карт`}>{botCards.map((c,i)=>{const arrival=motion.entries.find(e=>e.player===1&&(e.type==='cards_drawn'||e.type==='magic_received')&&e.cards.some(x=>x.id===c.id));return <div className={'back '+(arrival?'bot-card-arrival':'')} style={{"--i":i,"--n":botCards.length,"--delay":`${arrival?.delay||0}ms`} as React.CSSProperties} key={c.id}>✧</div>;})}</div></>}
 <section className="arena"><div className="table-heading"><span>ИГРОВОЙ СТОЛ</span><span>{g.inverted?'◇ Младшие ранги сильнее':'6 → Т · обычная сила рангов'}</span></div><div className="battle">{!g.table.length?(!hasActed||g.winner?<div className="empty"><div>✧</div><h1>{winnerText(g.winner)||'Слова становятся ходами'}</h1><p>{g.attacker===0?'Выберите карту или несколько карт одного ранга.':'Соперник выбирает карты для атаки…'}</p></div>:null):g.table.map((p,i)=><div className="pair" key={p.attack.id}>{card(p.attack)}{p.defense?<div className="cover">{card(p.defense)}</div>:<button className={`target ${chosen.length===1&&beats(chosen[0],p.attack,g)&&!g.taking?'allowed':''}`} disabled={g.attacker===0||g.taking||chosen.length!==1||!beats(chosen[0],p.attack,g)} onClick={()=>dispatch({type:'defend',player:0,id:chosen[0].id,target:i})}><span>✧</span><small>Отбить</small></button>}</div>)}</div>
 <aside className="actions"><small>{g.taking?'Защитник берёт':g.attacker===0?'Вы атакуете':'Вы защищаетесь'}</small>{g.attacker===0?<><button className="action-button attack-button" disabled={!attackValid||!!g.winner} onClick={()=>dispatch({type:'attack',player:0,ids:selected})}><span className="action-label">{g.table.length?'Подкинуть':'Атаковать'}{selected.length?` · ${selected.length}`:''}</span></button><button className="action-button attack-button" disabled={(!finished(g)&&!g.taking)||!!g.winner} onClick={()=>dispatch({type:'end',player:0})}><span className="action-label">{g.taking?'Завершить подкидывание':'Завершить атаку'}</span></button></>:<><button className="action-button take-button" disabled={!g.table.length||g.taking||!!g.winner} onClick={()=>dispatch({type:'take',player:0})}><span className="action-label">Взять карты</span></button></>}<p>Не более {g.limit} карт в атаке</p></aside></section>
 <EffectIndicators effects={g.effects}/><div className="notice sr-only" role="status">{tts||noticeText(g.log.at(-1))} {g.attacker===1&&finished(g)?'Соперник решает, подкинуть ли ещё.':''}</div>
 <OrdinaryHand blind={blind} eligibleIds={hatSelection?hatTargets(g,0).map(c=>c.id):undefined} cards={playable} selected={selected} translations={translations} onSelect={selectOrdinary} onSpeak={speak}/>
 <MagicHand unavailable={c=>magicUnavailable(g,0,c.spell||'')} cards={hand.magic} onOpen={openSpell} onPanelChange={setMagicPanel}/>
 {!spell&&!fateSelection&&!hatSelection&&feedback&&<div className={"magic-toast "+(feedback.startsWith("Верно")?"answer-success":"answer-failure")} role="status">{feedback}</div>}
 {(active||help)&&<div className="overlay magic-overlay" onClick={()=>{if(quizResult)return;setSpell(undefined);setHelp(false);}}><section className={help?'modal':'magic-dialog'} role="dialog" aria-modal="true" aria-label={help?'Правила':active?.name} onClick={e=>e.stopPropagation()}>
 {help?<><button className="close" onClick={()=>setHelp(false)}>Закрыть</button><h2>Правила</h2><p>36 обычных карт. Магия появляется только при доборе после начальной раздачи, по шансу из пула 11 экземпляров семи типов. Легендарные выпадают реже; повторные выпадения временно снижают шанс. До 6 обычных карт в руке, магия — дополнительно. Магия может выпасть дополнительно при обычном доборе после начальной раздачи. Отбивайте старшей картой той же масти либо козырем. Подкидывайте ранги со стола, не больше 6 и числа карт защитника в начале розыгрыша.</p><p>Магия активируется после правильного перевода с корейского на русский или с русского на корейский, в свою атаку или во время защиты, пока не объявлено взятие. Неверный ответ сжигает карту; правильный перевод показывается после проверки. Отмена до проверки не расходует её. Карта расходуется после успеха и не попадает в сброс. До шести добираются только обычные карты, магические приходят дополнительно и хранятся в экстра-руке. Магия не мешает завершению партии, когда обычные карты закончились. Бот тоже использует полученную магию.</p><p>Зеркальный мир действует до конца партии. Переворот судьбы: после правильного перевода игрок выбирает одну из трёх других мастей. После правильного ответа выберите масть, отменить результат уже нельзя. Бот выбирает выгодную масть с учётом своей руки и стола. Пока действует до конца партии — временное правило.</p></>:<>
 <MagicDialogContent spell={active!} failed={!!quizResult&&!quizResult.correct} burnDelay={quizResult?.simple?800:legendaryTimings.wrongAnswer} burnDuration={quizResult?.simple?120:legendaryTimings.burn} extra={active!.id==='chance'?<p>В сбросе: {g.discard.length} карт. Рука и стол сохраняются.</p>:undefined} cancelDisabled={!!quizResult} onCancel={()=>setSpell(undefined)}>
 <div className="parchment quiz-panel"><h2>Задание</h2><div className="quiz-heading"><button aria-label="Озвучить задание" hidden={quiz.direction!=='ko-ru'} onClick={()=>speak({id:'quiz',suit:0,rank:0,word:question})}>♪</button><strong lang={quiz.direction==='ko-ru'?'ko':'ru'}>{quiz.prompt}</strong></div><p>{quiz.direction==='ko-ru'?'Выберите русский перевод':'Выберите корейский перевод'}</p><div className="quiz-options" role="radiogroup" aria-label="Варианты перевода">{quiz.options.map(option=><button role="radio" aria-checked={answer===option} disabled={!!quizResult} className={quizResult?(option===quiz.correct?'result-correct':answer===option?'result-wrong':''):(answer===option?'picked':'')} key={option} onClick={()=>{setAnswer(option);setFeedback('');}} lang={quiz.direction==='ru-ko'?'ko':'ru'}>{option}</button>)}</div>{quiz.direction==='ru-ko'&&<div className="quiz-audio-options" aria-label="Произношение вариантов">{quiz.options.map((option,i)=><button key={option} aria-label={'Озвучить '+option} title={option} onClick={()=>void speakKorean(option,setTts)}>♪ {i+1}</button>)}</div>}<button className="quiz-check" disabled={!!quizResult||!answer||!canUseMagic(g,0)} onClick={()=>{if(submitted.current||!spellCard)return;submitted.current=true;setQuizResult({card:spellCard,correct:answer===quiz.correct,simple,question:quiz.index,direction:quiz.direction,answer});setFeedback(answer===quiz.correct?(spellCard.spell==='fate'?'Верно! Выберите новую козырную масть.':spellCard.spell==='magicians_hat'?'Верно! Выберите карту для обмена.':'Верно! Магия активирована.'):'Неверно. Правильный ответ: '+quiz.correct+'. Магическая карта сгорела.');if(!['fate','magicians_hat'].includes(spellCard.spell||'')||answer!==quiz.correct)dispatch({type:'magic',player:0,id:spell!,question:quiz.index,direction:quiz.direction,answer});}}>Проверить</button><p className="quiz-feedback" role="status">{feedback||(!canUseMagic(g,0)?'Дождитесь своей атаки или защиты.':'Верно — активация. Ошибка — карта сгорит.')}</p></div>
 </MagicDialogContent>
 </>}
 </section></div>}

 {fateSelection&&<TrumpChoice cancellable={false} current={fateSelection.current} onCancel={()=>{}} onChoose={trump=>{dispatch({type:'magic',player:0,id:fateSelection.card.id,question:fateSelection.question,direction:fateSelection.direction,answer:fateSelection.answer,trump});setFateSelection({...fateSelection,selected:trump});setFeedback('Верно! Новый козырь: '+suits[trump]+'.');}}/>}
 {hatSelection&&<div className="hat-selection-message" role="status"><strong>Выберите карту для обмена</strong><span>Подсвечены доступные карты вашей руки. Повторный вопрос не нужен.</span></div>}{blind&&<div className="blind-instruction" role="status">Выберите одну карту вслепую — она сразу попадёт на стол</div>}{g.hands[0].some(c=>isLocked(g,c))&&<div className="ghost-hand-count" role="status">♧ Заблокировано: {g.hands[0].filter(c=>isLocked(g,c)).length}</div>}{g.attacker===0&&!g.table.length&&!playable.length&&normalCount(g.hands[0])>0&&<button className="ghost-pass" onClick={()=>dispatch({type:'pass',player:0})}>Пропустить атаку · карты заблокированы</button>}<GameAnimationLayer entries={motion.entries} simple={simple} suppressFailure={!!spell&&quizResult?.correct===false}/>
 </main></AnimationContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppShell Solo={App}/></React.StrictMode>);
