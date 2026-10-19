import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ranks,suits,type Pair} from '../engine';
import {spells} from '../spells';
import {speakKorean,setSpeechEnabled} from '../speech';
import {useSwipeGuard} from '../useHandScroll';
import {CardFace} from './CardFace';
import {PrototypeSheet} from './PrototypeSheet';
import {PrototypeHand} from './PrototypeHand';
import {PrototypeTable} from './PrototypeTable';
import {demoHand,demoPairs,demoCanAttack,demoCanDefend,type DemoCard,type DemoPhase} from './model';
import './prototype.css';

type Panel='settings'|'hand'|'pair'|'magic'|'quiz';
const title:Record<DemoPhase,string>={attack:'Атака',defense:'Защита',throw:'Подкидывание'};
const demoMagic=spells.filter(s=>['mirror','chance'].includes(s.id));

function Prototype(){
 const [phase,setPhase]=useState<DemoPhase>('defense'),[cards,setCards]=useState(()=>demoHand(6)),[pairs,setPairs]=useState<Pair[]>(()=>demoPairs(1,'defense'));
 const [selected,setSelected]=useState<string>(),[target,setTarget]=useState<number>(),[panel,setPanel]=useState<Panel>(),[inspected,setInspected]=useState(0);
 const [ghost,setGhost]=useState(false),[blind,setBlind]=useState(false),[connected,setConnected]=useState(true),[translations,setTranslations]=useState(true),[sound,setSound]=useState(false),[magicAvailable,setMagicAvailable]=useState(true);
 const [magic,setMagic]=useState<(typeof spells)[number]>(demoMagic[0]),[answer,setAnswer]=useState<number>(),[result,setResult]=useState(''),[status,setStatus]=useState('UX 2.0 · демонстрация, не сетевая партия');
 const swipe=useSwipeGuard(),current=cards.find(c=>c.id===selected),canAttack=connected&&(blind?!!current&&pairs.length<6:demoCanAttack(current,pairs)),allowed=connected&&phase==='defense'&&!blind?pairs.flatMap((p,i)=>demoCanDefend(current,p)?[i]:[]):[];
 function select(card:DemoCard){if(card.locked&&!blind)return;setSelected(old=>old===card.id?undefined:card.id);setTarget(undefined);setPanel(undefined);if(selected!==card.id&&!blind&&sound)void speakKorean(card.word.ko,setStatus);}
 function resetHand(n:number,newGhost=ghost,newBlind=blind){setCards(demoHand(n,newGhost));setGhost(newGhost);setBlind(newBlind);setSelected(undefined);setTarget(undefined);setStatus('Демо-состояние руки обновлено');}
 function resetPhase(next:DemoPhase){setBlind(false);setPhase(next);setPairs(demoPairs(next==='attack'?0:next==='throw'?3:1,next));setSelected(undefined);setTarget(undefined);setStatus('Демо: '+title[next]);}
 function primary(){
  if(!current||!connected)return;
  if(phase==='defense'){
   if(target===undefined||!allowed.includes(target))return;
   setPairs(old=>old.map((pair,i)=>i===target?{...pair,defense:current}:pair));setStatus('Демо: выбранная карта накрыла атаку');
  }else{if(!canAttack)return;setPairs(old=>[...old,{attack:current}]);setStatus(blind?'Демо: закрытая карта раскрылась на столе':'Демо: карта сыграна после подтверждения');}
  setCards(old=>old.filter(c=>c.id!==current.id));setSelected(undefined);setTarget(undefined);
 }
 function secondary(){
  if(!connected)return;
  if(phase==='defense'){setCards(old=>[...old,...pairs.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack]).map((card,i)=>({...card,id:`demo-taken-${old.length}-${i}-${card.id}`}))]);setPairs([]);setPhase('attack');setStatus('Демо: карты со стола добавлены в руку');}
  else {setPairs(demoPairs(1,'defense'));setPhase('defense');setStatus('Демо: завершение атаки, показан следующий сценарий');}
  setSelected(undefined);setTarget(undefined);
 }
 function openPair(index:number){if(allowed.includes(index)){setTarget(old=>old===index?undefined:index);setStatus('Цель выбрана. Подтвердите защиту кнопкой.');}else{setInspected(index);setPanel('pair');}}
 const primaryDisabled=!connected||!current||(phase==='defense'?target===undefined||!allowed.includes(target):!canAttack);
 const secondaryDisabled=!connected||!pairs.length||(phase!=='defense'&&pairs.some(p=>!p.defense));
 return <main className="ux-prototype" data-phase={phase} data-selected={selected||''} data-hand-count={cards.length}>
  <header className="ux-hud"><button className="ux-icon ux-menu" aria-label="Меню прототипа и демо-состояния" onClick={()=>setPanel('settings')}>☰</button><div className="ux-opponent"><strong>Соперник · Мару <span>6 карт · ✦ 2</span></strong><small><i className={connected?'demo-online':'demo-offline'}/>{connected?'Демо · связь имитируется':'Демо · нет связи'}</small><b className={phase==='defense'?'defense':'attack'}>{phase==='defense'?'Ход соперника':'Ваш ход'} · {title[phase]}</b></div><div className="ux-deck" aria-label="Демонстрационный козырь пики, в колоде 24 карты"><span>♠</span><strong>24<small>колода</small></strong></div></header>
  <PrototypeTable pairs={pairs} allowed={allowed} target={target} onPair={openPair}/>
  {current&&<aside className="ux-selection" aria-label={blind?'Предпросмотр закрытой карты':'Предпросмотр выбранной карты'}><div className="ux-selection-art"><CardFace card={current} back={blind} mini/></div><div className="ux-selection-copy"><small>{blind?'Карта выбрана вслепую':`${ranks[current.rank]} ${suits[current.suit]} · Выбрана`}</small><strong lang={blind?'ru':'ko'}>{blind?'Закрытая карта':current.word.ko}</strong>{!blind&&translations&&<p>{current.word.ru}</p>}<span>{phase==='defense'?'Коснитесь подсвеченной атаки на столе.':'Подтвердите ход кнопкой ниже.'}</span></div><div className="ux-selection-tools"><button className="ux-icon" aria-label="Снять выбор карты" onClick={()=>{setSelected(undefined);setTarget(undefined);}}>×</button>{!blind&&<button className="ux-icon" aria-label="Озвучить выбранное слово" onClick={()=>{if(sound)void speakKorean(current.word.ko,setStatus);else setStatus('Озвучка выключена. Включите её в меню прототипа.');}}>♪</button>}</div></aside>}
  <section className="ux-actions" aria-label="Контекстные действия"><button className="ux-action ux-action-primary" disabled={primaryDisabled} onClick={primary}>{phase==='defense'?'Побить выбранной':blind?'Атаковать вслепую':pairs.length||phase==='throw'?'Подкинуть':'Атаковать'}</button><button className="ux-action" disabled={secondaryDisabled} onClick={secondary}>{phase==='defense'?'Взять карты':phase==='throw'?'Завершить подкидывание':'Завершить атаку'}</button><button className={'ux-magic-trigger '+(!magicAvailable?'magic-unavailable':'')} aria-label="Магия: 2 карты" onClick={()=>setPanel('magic')}>✦ <b>2</b></button></section>
  <PrototypeHand cards={cards} selected={selected} blind={blind} onSelect={select} onOverview={()=>setPanel('hand')}/>
  <div className="ux-status" role="status" title={status}>{!connected?'Демо: соединение отключено. Действия недоступны.':status}</div>

  {panel==='settings'&&<PrototypeSheet title="Демо-состояния · UX 2.0" onClose={()=>setPanel(undefined)} footer={<button className="ux-wide" onClick={()=>setPanel(undefined)}>Вернуться к столу</button>}><p className="ux-demo-note">Это интерактивный макет. Сервер, WebSocket и настоящая партия не используются.</p><fieldset><legend>Фаза</legend><div className="ux-switch-row">{(['attack','defense','throw'] as const).map(item=><button key={item} aria-pressed={phase===item} onClick={()=>resetPhase(item)}>{title[item]}</button>)}</div></fieldset><fieldset><legend>Пар на столе</legend><div className="ux-switch-row">{[0,1,3,6].map(n=><button key={n} aria-pressed={pairs.length===n} onClick={()=>{setPairs(demoPairs(n,phase));setTarget(undefined);}}>{n}</button>)}</div></fieldset><fieldset><legend>Карт в руке</legend><div className="ux-switch-row">{[6,12,20].map(n=><button key={n} aria-pressed={cards.length===n} onClick={()=>resetHand(n)}>{n}</button>)}</div></fieldset><div className="ux-preferences"><label>Призрачный вор · блокировка<input type="checkbox" checked={ghost} onChange={e=>resetHand(cards.length,e.target.checked,false)}/></label><label>Обезьянья проделка · вслепую<input type="checkbox" checked={blind} onChange={e=>{if(e.target.checked)resetPhase('attack');resetHand(cards.length,false,e.target.checked);}}/></label><label>Переводы<input type="checkbox" checked={translations} onChange={e=>setTranslations(e.target.checked)}/></label><label>Озвучка при выборе<input type="checkbox" checked={sound} onChange={e=>{setSound(e.target.checked);setSpeechEnabled(e.target.checked);}}/></label><label>Магия доступна<input type="checkbox" checked={magicAvailable} onChange={e=>setMagicAvailable(e.target.checked)}/></label><label>Демонстрация подключения<input type="checkbox" checked={connected} onChange={e=>setConnected(e.target.checked)}/></label></div><div className="ux-shortcuts"><button onClick={()=>setPanel('magic')}>Открыть магию</button><button onClick={()=>{setMagic(demoMagic[0]);setAnswer(undefined);setResult('');setPanel('quiz');}}>Показать учебный вопрос</button></div></PrototypeSheet>}

  {panel==='hand'&&<PrototypeSheet title={`Обзор руки · ${cards.length} карт`} onClose={()=>setPanel(undefined)}><p className="ux-demo-note">{blind?'Закрытые карты. Номиналы и слова скрыты.':'Выберите карту крупным касанием. Ход потребует отдельного подтверждения.'}</p><div className="ux-hand-gallery" {...swipe}>{cards.map((card,i)=><button className={selected===card.id?'is-picked':''} key={card.id} disabled={card.locked&&!blind} aria-label={blind?`Закрытая карта ${i+1}`:`${ranks[card.rank]} ${suits[card.suit]} · ${card.word.ko}${card.locked?' · Заблокирована':''}`} aria-pressed={selected===card.id} onClick={()=>select(card)}><CardFace card={card} back={blind} translation={translations}/>{card.locked&&!blind&&<span className="ux-gallery-lock">♧ Заблокирована</span>}</button>)}</div></PrototypeSheet>}

  {panel==='pair'&&pairs[inspected]&&<PrototypeSheet title="Карты на столе" onClose={()=>setPanel(undefined)} footer={demoCanDefend(current,pairs[inspected])&&phase==='defense'&&<button className="ux-wide" onClick={()=>{setTarget(inspected);setPanel(undefined);}}>Выбрать эту атаку</button>}><div className="ux-pair-detail"><figure><CardFace card={pairs[inspected].attack} translation={translations}/><figcaption>Атака</figcaption></figure>{pairs[inspected].defense&&<figure><CardFace card={pairs[inspected].defense!} translation={translations}/><figcaption>Защита</figcaption></figure>}</div><p className="ux-demo-note">{pairs[inspected].defense?'Эта пара уже отбита.':'Для защиты сначала выберите свою карту. После выбора цели подтвердите действие.'}</p></PrototypeSheet>}

  {panel==='magic'&&<PrototypeSheet title="Магические карты · 2" onClose={()=>setPanel(undefined)}><p className="ux-demo-note">Выбор карты открывает только демонстрационный вопрос.</p><div className="ux-magic-gallery" {...swipe}>{demoMagic.map(spell=><article key={spell.id}><button className={'ux-spell-art spell-'+spell.id} disabled={!magicAvailable||!connected} aria-label={'Выбрать магию: '+spell.name} onClick={()=>{setMagic(spell);setAnswer(undefined);setResult('');setPanel('quiz');}}/><h3>{spell.name}</h3><small>{!connected?'Нет связи · демо':!magicAvailable?'Недоступно в показанном состоянии':'Можно посмотреть задание'}</small></article>)}</div></PrototypeSheet>}

  {panel==='quiz'&&<PrototypeSheet title="Учебное задание · демо" onClose={()=>setPanel(undefined)} footer={result?<button className="ux-wide" onClick={()=>setPanel(undefined)}>Вернуться к столу</button>:<><button className="ux-wide ux-answer-check" disabled={answer===undefined} onClick={()=>setResult(answer===0?'Верно! Так будет выглядеть подтверждение активации.':'Неверно. В настоящей партии карта сгорает. Здесь показан только макет результата.')}>Проверить</button><button className="ux-quiet" onClick={()=>setPanel(undefined)}>Отмена</button></>}><div className="ux-quiz"><div className="ux-question"><span>Выберите русский перевод</span><strong lang="ko">학교</strong></div><div className="ux-answers" role="radiogroup" aria-label="Варианты ответа">{['школа','дом','друг','еда'].map((text,i)=><button role="radio" key={text} aria-checked={answer===i} disabled={!!result} className={answer===i?'is-picked':''} onClick={()=>setAnswer(i)}>{text}</button>)}</div>{result&&<p className="ux-quiz-result" role="status">{result}</p>}<div className="ux-quiz-magic"><div className={'ux-spell-art spell-'+magic.id} aria-hidden="true"/><div><h3>{magic.name}</h3><p>{magic.effect}</p></div></div><p className="ux-demo-note">Один подготовленный вопрос. Настоящие карты и эффекты не изменяются.</p></div></PrototypeSheet>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Prototype/>);
