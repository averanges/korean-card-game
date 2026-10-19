import {magicAnimations,intensityDuration,legendaryTimings,type GameAnimationEvent,type CardPosition} from '../animationModel';
import type {PlayerEvent} from '../game-core/types';
import type {GameSnapshot} from './protocol';
import {spells} from '../spells';
import type {ActiveEffect,SpellKind} from '../effects';
export function networkEffects(snapshot:GameSnapshot):ActiveEffect[]{return snapshot.view.effects.map(e=>({id:e.id,kind:e.kind,duration:e.duration,status:e.status,target:e.target===undefined?undefined:e.target===snapshot.view.player?0:1,name:spells.find(s=>s.id===e.kind)?.name||'Магический эффект',description:spells.find(s=>s.id===e.kind)?.effect||'',modifier:{}}));}
/** Only safe projected data enters the existing visual queue; public artwork needs no fabricated card. */
export function networkAnimations(before:GameSnapshot|undefined,after:GameSnapshot,events:readonly PlayerEvent[],positions:CardPosition[]=[]):GameAnimationEvent[]{
 const self=after.view.player,ending=events.some(e=>e.type==='round_defended'||e.type==='cards_taken');
 return events.flatMap((e,index)=>{
  const player=e.player===self?0:1,targetPlayer=e.targetPlayer===undefined?undefined:e.targetPlayer===self?0:1;
  const cards=e.cards?[...e.cards]:[];
  const unlockEvent=e.sourceRef?events.find(event=>event.type==='card_unlocked'&&event.sourceRef===e.sourceRef):undefined;const origin=e.sourceRef?(positions.find(position=>position.sourceRef===e.sourceRef)||positions.find(position=>position.card.id===unlockEvent?.cards?.[0]?.id)):undefined;
  const base={sourceRef:e.sourceRef,source:origin?{x:origin.x,y:origin.y,width:origin.width,height:origin.height}:undefined,sealed:e.sealed,type:e.type,player:player as 0|1,cards,count:e.count,targetPlayer:targetPlayer as 0|1|undefined,magicId:e.magicId,delay:0,duration:320};
  if(e.type==='magic_activated'||e.type==='magic_failed'){
   const ownCard=before?.view.magic.find(c=>c.spell===e.magicId);
   const effect=after.view.effects.find(effect=>effect.kind===e.magicId&&!before?.view.effects.some(old=>old.id===effect.id));
   return [{...base,cards:ownCard&&player===0?[ownCard]:[],effectId:effect?.id,exchange:e.exchange?{oldCard:e.exchange.oldCard,...(player===0&&e.exchange.newCard?{newCard:e.exchange.newCard}:{})}:undefined,trump:e.trump??after.view.trump,previousTrump:before?.view.trump,previousDeck:before?.view.deckCount,nextDeck:after.view.deckCount,delay:e.type==='magic_failed'?legendaryTimings.wrongAnswer:player===0?legendaryTimings.answer:0,duration:e.type==='magic_failed'?legendaryTimings.burn:intensityDuration[magicAnimations[e.magicId||'']?.intensity||'minor']}];
  }
  if(e.type==='card_unlocked')return player===0?[{...base,delay:650,duration:1000}]:[];
  if(e.type==='magic_expired')return [{...base,duration:650}];
  if(e.type==='cards_drawn'||e.type==='magic_received'){
   if(e.sealed?.length)return [...e.sealed.map(sealed=>({...base,cards:[],sealed:[sealed],delay:ending?350:0,duration:450})),...cards.map(card=>({...base,cards:[card],sealed:undefined,delay:ending?350:0,duration:320}))];
   if(!cards.length)return e.count?[{...base,delay:ending?350:0,duration:320}]:[];
   return cards.map((card,i)=>({...base,cards:[card],delay:(ending?350:0)+Math.min(i*75,350),duration:e.type==='magic_received'?(e.sourceRef?(magicAnimations[card.spell||'']?.intensity==='legendary'?2800:1800):(magicAnimations[card.spell||'']?.intensity==='legendary'?legendaryTimings.receive:700)):320,...(e.sourceRef?{delay:1550}:{})}));
  }
  if(!cards.length)return [];
  if(e.type==='round_defended'||e.type==='cards_taken')return [{...base,duration:e.type==='cards_taken'?350:280,positions:positions.filter(p=>!p.sourceRef)}];
  return cards.map(card=>({...base,cards:[card],delay:e.type==='card_defend'?0:Math.min(index*100,350),duration:e.type==='card_defend'?780:e.type==='card_attack'?520:210}));
 });
}
export function magicNotices(events:readonly PlayerEvent[],self:0|1,opponent:string):string[] {
 return events.flatMap(e=>{
  if(e.type==='magic_activated'){
   const who=e.player===self?'Вы':opponent;
   const name=spells.find(s=>s.id===e.magicId)?.name||'магию';
   const messages=[`${who} ${e.player===self?'применили':'применил'} ${name}.`];
   if(e.magicId==='fate')messages.push('Козырь изменён.');
   if(e.magicId==='ghost_thief'&&e.targetPlayer===self)messages.push('Одна из ваших карт заблокирована.');
   if(e.magicId==='monkey_prank'&&e.targetPlayer===self)messages.push('Следующая атака будет слепой.');
   if(e.magicId==='trick_gift')messages.push(e.targetPlayer===self?'Вы получили дополнительную карту.':'Соперник получил дополнительную карту.');
   return messages;
  }
  if(e.type==='magic_failed')return [e.player===self?'Неверный ответ. Магическая карта сгорела.':'Магическая карта соперника сгорела.'];
  if(e.type==='magic_expired')return [`Действие карты «${spells.find(s=>s.id===e.magicId)?.name||'Магия'}» завершено.`];
  return [];
 });
}
export const challengeStage=(snapshot:GameSnapshot)=>snapshot.challenge?.phase==='question'?'question':snapshot.challenge?.phase==='target'?snapshot.challenge.target?.kind:snapshot.challenge?.phase==='resolved'?'result':undefined;
export function visibleNetworkAnimations<T extends GameAnimationEvent>(entries:readonly T[],snapshot:GameSnapshot):T[]{
 const view=snapshot.view,ids=new Set([...(!view.hand.blind?view.hand.cards:[]),...(view.locked||[]),...view.magic].map(c=>c.id));
 return entries.flatMap(entry=>{
  if(entry.player!==0)return [entry];
  let next=entry;
  if(entry.type==='cards_drawn'||entry.type==='magic_received'){
   if(view.hand.blind&&entry.type==='cards_drawn')next={...entry,cards:[],sealed:undefined};
   else if(entry.cards.length){const cards=entry.cards.filter(c=>ids.has(c.id));if(!cards.length)return [];next={...entry,cards};}
  }
  if(next.exchange?.newCard&&(view.hand.blind||!ids.has(next.exchange.newCard.id)))next={...next,exchange:{oldCard:next.exchange.oldCard}};
  return [next];
 });
}
