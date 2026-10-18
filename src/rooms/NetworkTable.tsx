import {GameMenu} from '../GameMenu';
import {useProfile} from '../ProfileContext';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {OrdinaryHand} from '../OrdinaryHand';
import {TurnIndicator} from '../TurnIndicator';
import {MagicStatus} from '../MagicStatus';
import {TableCard} from '../TableCard';
import {AnimationContext,useGameAnimations} from '../useGameAnimations';
import type {CardPosition} from '../animationModel';
import {GameAnimationLayer} from '../GameAnimationLayer';
import {useTableLayout} from '../useTableLayout';
import {speakKorean} from '../speech';
import {toggleHandSelection} from '../handModel';
import type {Card} from '../engine';
import type {GameSnapshot,NetworkCommand,PublicRoom} from './protocol';
import type {PlayerEvent} from '../game-core/types';
import {MagicHand} from '../MagicHand';
import {EffectIndicators} from '../EffectIndicators';
import {TrumpChoice} from '../TrumpChoice';
import {BlindHand} from './BlindHand';
import {NetworkMagicDialog} from './NetworkMagicDialog';
import {networkAnimations,networkEffects,magicNotices,visibleNetworkAnimations} from './networkPresentation';
export type Intent=NetworkCommand extends infer C?C extends NetworkCommand?Omit<C,'requestId'|'expectedRevision'>:never:never;
export function NetworkTable({snapshot,events,positions,room,connected,busy,error,onCommand,onReconnect,onRecovery}:{snapshot:GameSnapshot;events:PlayerEvent[];positions:CardPosition[];room:PublicRoom;connected:boolean;busy:boolean;error:string;onCommand:(intent:Intent)=>void;onReconnect:()=>void;onRecovery?:()=>void}) {
 const {profile}=useProfile(); const translations=profile.settings.translations;
 const tableRef=useTableLayout(),view=snapshot.view,self=view.player,opponent=(1-self) as 0|1;
 const [selected,setSelected]=useState<string[]>([]),[revealed,setRevealed]=useState<string[]>([]),[systemReduced,setSystemReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[tts,setTts]=useState('');
 const simple=profile.settings.reducedMotion||systemReduced;
 useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setSystemReduced(q.matches);q.addEventListener('change',change);return()=>q.removeEventListener('change',change);},[]);
 const motion=useGameAnimations(simple),seen=useRef(snapshot.revision-1),previous=useRef<GameSnapshot>();
 const cards=view.hand.blind?[]:[...view.hand.cards,...(view.locked||[])];
 const challenge=snapshot.challenge,hat=challenge?.phase==='target'&&challenge.target?.kind==='hat'?challenge.target:undefined;
 const [notices,setNotices]=useState<string[]>([]),[opening,setOpening]=useState<string>();
 useEffect(()=>{
  if(snapshot.revision<=seen.current)return;
  if(!previous.current||snapshot.revision===previous.current.revision+1){
   motion.enqueue(networkAnimations(previous.current,snapshot,events,positions),`network-${room.roomId}-${snapshot.revision}`);
   const text=magicNotices(events,self,room.players[opponent]?.name||'Соперник');if(text.length)setNotices(text);
  }
  previous.current=snapshot;seen.current=snapshot.revision;setSelected([]);setOpening(undefined);
 },[snapshot.revision]);
 useEffect(()=>{if(!notices.length)return;const timer=setTimeout(()=>setNotices([]),6000);return()=>clearTimeout(timer);},[notices]);
 useEffect(()=>{if(error)setSelected([]);},[error]);
 const attacking=view.attacker===self,chosen=cards.filter(c=>selected.includes(c.id));
 const canAttack=chosen.length>0&&chosen.every(c=>snapshot.allowed.attack.includes(c.id))&&view.table.length+chosen.length<=view.limit&&(view.table.length>0||chosen.every(c=>c.rank===chosen[0].rank));
 const disabled=busy||!connected||!!view.result||room.status==='expired';
 const result=view.result?(view.result.winner===null?'Ничья':view.result.winner===self?'Вы победили':'Победа соперника'):undefined;
 const speak=(c:Card)=>void speakKorean(c.word.ko,setTts);
 const face=(card:Card)=><TableCard card={card} cue={motion.entries.find(e=>['card_attack','card_defend','card_throw_in'].includes(e.type)&&e.cards[0]?.id===card.id)} translation={translations||revealed.includes(card.id)?card.word.ru:'•••'} onClick={()=>setRevealed(ids=>ids.includes(card.id)?ids.filter(id=>id!==card.id):[...ids,card.id])} onReveal={()=>setRevealed(ids=>ids.includes(card.id)?ids.filter(id=>id!==card.id):[...ids,card.id])} onSpeak={()=>speak(card)}/>;
 return <AnimationContext.Provider value={motion.entries}><main ref={tableRef} className={'game-table network-table '+(simple?'simple-motion':'full-motion')+(hat?' hat-selecting':'')+(view.inverted&&!simple?' world-inverted':'')}>
  <GameMenu onRecovery={onRecovery} deckLabel={room.deck?`${room.deck.name} · ${room.deck.wordCount} слов в партии`:'Текущая колода'}/>
  <section className="statusbar"><TurnIndicator attacking={attacking} winner={result}/><div className="opponent"><span>♟</span><div><strong>{view.opponent.ordinaryCount} карт{view.opponent.magicCount>0&&<small className="extra-count"> · ✦ {view.opponent.magicCount}</small>}</strong><small>{room.players[opponent]?.name} · {room.players[opponent]?.connected?'в сети':'не в сети'}</small></div></div><MagicStatus trump={view.trump} count={view.deckCount} simple={simple}/></section>
  <div className="bot-hand" aria-label={`У соперника ${view.opponent.ordinaryCount} карт`}>{Array.from({length:Math.min(9,view.opponent.ordinaryCount)},(_,i)=><div className={'back '+(motion.entries.some(e=>e.player===1&&e.type==='cards_drawn')?'bot-card-arrival':'')} key={i} style={{'--i':i,'--n':Math.min(9,view.opponent.ordinaryCount)} as CSSProperties}>✧</div>)}</div>
  <section className="arena"><div className="table-heading"><span>ИГРОВОЙ СТОЛ</span><span>{view.inverted?'◇ Младшие ранги сильнее':'6 → Т · обычная сила рангов'}</span></div><div className="battle">{!view.table.length?<div className="empty"><div>✧</div><h1>{result||'Слова становятся ходами'}</h1><p>{view.result?'Партия завершена':attacking?'Выберите карту или карты одного ранга.':`${room.players[opponent]?.name} выбирает карты для атаки…`}</p></div>:view.table.map((pair,target)=><div className="pair" key={pair.attack.id}>{face(pair.attack)}{pair.defense?<div className="cover">{face(pair.defense)}</div>:<button className={'target '+(chosen.length===1&&snapshot.allowed.defend.some(d=>d.target===target&&d.cardRefs.includes(chosen[0].id))?'allowed':'')} disabled={disabled||chosen.length!==1||!snapshot.allowed.defend.some(d=>d.target===target&&d.cardRefs.includes(chosen[0].id))} onClick={()=>onCommand({type:'defend',target,cardRef:chosen[0].id})}><span>✧</span><small>Отбить</small></button>}</div>)}</div>
  <aside className="actions"><small>{view.phase==='taking'?'Защитник берёт':attacking?'Вы атакуете':'Вы защищаетесь'}</small>{attacking?<><button className="action-button attack-button" disabled={disabled||!canAttack} onClick={()=>onCommand({type:'attack',cardRefs:selected})}><span className="action-label">{view.table.length?'Подкинуть':'Атаковать'}</span></button><button className="action-button attack-button" disabled={disabled||!snapshot.allowed.end} onClick={()=>onCommand({type:'end'})}><span className="action-label">{view.phase==='taking'?'Завершить подкидывание':'Завершить атаку'}</span></button></>:<button className="action-button take-button" disabled={disabled||!snapshot.allowed.take} onClick={()=>onCommand({type:'take'})}><span className="action-label">Взять карты</span></button>}</aside></section>
  <EffectIndicators effects={networkEffects(snapshot)} opponentLabel="Соперник"/>
  {view.hand.blind?<BlindHand cards={view.hand.cards} disabled={disabled||!snapshot.allowed.attack.length} onChoose={ref=>{if(!disabled&&snapshot.allowed.attack.includes(ref))onCommand({type:'attack',cardRefs:[ref]});}}/>:<OrdinaryHand cards={cards} selected={selected} translations={translations} lockedIds={view.locked?.map(c=>c.id)} eligibleIds={hat?.cardRefs} onSelect={card=>{if(disabled||view.locked?.some(c=>c.id===card.id))return;if(hat&&challenge){if(hat.cardRefs.includes(card.id))onCommand({type:'choose_hat_card',challengeId:challenge.challengeId,cardRef:card.id});}else {const selecting=!selected.includes(card.id);setSelected(ids=>toggleHandSelection(ids,card,cards,attacking));if(selecting)speak(card);}}} onSpeak={speak}/>}
  <MagicHand cards={view.magic} selectedId={opening||(challenge&&['question','target'].includes(challenge.phase)?challenge.magicRef:undefined)} unavailable={card=>disabled?'Дождитесь подтверждения или восстановления связи.':!snapshot.allowed.magic?.includes(card.id)?'Дождитесь разрешённой атаки или защиты.':undefined} onOpen={card=>{if(disabled||!snapshot.allowed.magic?.includes(card.id))return;setOpening(card.id);onCommand({type:'begin_magic',magicRef:card.id});}}/>
  {snapshot.allowed.pass&&<button className="ghost-pass" disabled={disabled} onClick={()=>onCommand({type:'pass'})}>Пропустить атаку · карты заблокированы</button>}
  {hat&&<div className="hat-selection-message" role="status"><strong>Верно! Выберите карту для обмена</strong><span>{busy?'Ожидаем подтверждения сервера…':'Подсвечены доступные карты вашей руки. Повторный вопрос не нужен.'}</span></div>}
  {view.hand.blind&&<div className="blind-instruction" role="status">Выберите одну карту вслепую — она сразу попадёт на стол</div>}
  {view.blockedCount>0&&<div className="ghost-hand-count" role="status">♧ Заблокировано: {view.blockedCount}</div>}
  <NetworkMagicDialog challenge={challenge} disabled={disabled} busy={busy} simple={simple} onCommand={onCommand}/>
  {challenge?.phase==='target'&&challenge.target?.kind==='trump'&&<TrumpChoice key={challenge.challengeId} current={view.trump} allowed={challenge.target.suits} pending={disabled} resetKey={snapshot.revision} cancellable={false} onCancel={()=>{}} onChoose={trump=>onCommand({type:'choose_trump',challengeId:challenge.challengeId,trump})}/>}
  {!!notices.length&&<div className="network-magic-notice" role="status">{notices.join(' ')}</div>}
  <div className="network-notice" role="status">{room.status==='expired'?'Время жизни комнаты истекло. Создайте новую комнату.':error||(!connected?'Связь потеряна. Ваше место и партия сохранены.':!room.players[opponent]?.connected?'Соперник отключился. Ожидаем возвращения.':busy?'Ожидаем подтверждения хода…':'')}{!connected&&room.status!=='expired'&&<button onClick={onReconnect}>Подключиться снова</button>}</div><span className="sr-only" role="status">{tts}</span><GameAnimationLayer network entries={visibleNetworkAnimations(motion.entries,snapshot)} simple={simple} suppressFailure={challenge?.phase==='resolved'&&challenge.outcome==='wrong'}/>
 </main></AnimationContext.Provider>;
}
