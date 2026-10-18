import {finished,normalCount,type Card,type Game,type Player} from '../engine';
import {availableCards,blindAttack,isLocked} from '../trickRules';
import type {Duration} from '../effects';
import type {DomainEvent,PlayerEvent,PlayerView} from './types';

export interface ProjectionContext {nextRef:()=>string;references:[Map<string,string>,Map<string,string>];rounds:[number,number]}
export function createProjectionContext(nextRef=()=>crypto.randomUUID()):ProjectionContext{return {nextRef,references:[new Map(),new Map()],rounds:[-1,-1]};}
const checkPlayer=(p:Player)=>{if(p!==0&&p!==1)throw Error('Invalid player');};
// Explicit allowlists prevent future private fields from silently entering JSON.
const card=(c:Card):Card=>({id:c.id,suit:c.suit,rank:c.rank,word:{ko:c.word.ko,ru:c.word.ru},...(c.spell?{spell:c.spell}:{})});
const duration=(d:Duration):Duration=>d.type==='permanent'?{type:d.type}:d.type==='event'?{type:d.type,event:d.event,label:d.label}:{type:d.type,remaining:d.remaining};
export function projectGameForPlayer(g:Game,p:Player,context=createProjectionContext()):PlayerView {
 checkPlayer(p);const opponent=(1-p) as Player,cards=availableCards(g,p),blind=blindAttack(g,p),round=g.round??0;
 if(!blind||context.rounds[p]!==round){context.references[p].clear();context.rounds[p]=round;}
 const refs=context.references[p];
 if(blind)for(const c of cards)if(!refs.has(c.id)){const ref=context.nextRef();if(!ref||[...context.references[0].values(),...context.references[1].values()].includes(ref))throw Error('Reference factory must produce unique opaque values');refs.set(c.id,ref);}
 return {player:p,hand:blind?{blind:true,cards:cards.map(c=>({ref:refs.get(c.id)!,hidden:true}))}:{blind:false,cards:cards.map(card)},
 magic:g.hands[p].filter(c=>c.spell).map(card),blockedCount:g.hands[p].filter(c=>isLocked(g,c)).length,locked:blind?[]:g.hands[p].filter(c=>!c.spell&&isLocked(g,c)).map(card),
 opponent:{ordinaryCount:normalCount(g.hands[opponent]),magicCount:g.hands[opponent].filter(c=>c.spell).length,blockedCount:g.hands[opponent].filter(c=>isLocked(g,c)).length},
 table:g.table.map(pair=>({attack:card(pair.attack),...(pair.defense?{defense:card(pair.defense)}:{})})),deckCount:g.deck.length,trump:g.trump,inverted:g.inverted,round,attacker:g.attacker,
 actors:g.winner?[]:g.taking||!g.table.length||finished(g)?[g.attacker]:[g.attacker,(1-g.attacker) as Player],
 phase:g.winner?'finished':g.taking?'taking':!g.table.length||finished(g)?'attack':'defense',limit:g.limit,
 effects:g.effects.map(e=>({id:e.id,kind:e.kind,duration:duration(e.duration),...(e.target===undefined?{}:{target:e.target}),...(e.status?{status:e.status}:{})})),
 ...(g.winner?{result:{winner:g.winner.winner}}:{})};
}
export function resolveBlindReference(g:Game,p:Player,ref:string,context:ProjectionContext):string|undefined {
 checkPlayer(p);if(!blindAttack(g,p)||context.rounds[p]!== (g.round??0))return;
 return availableCards(g,p).find(c=>context.references[p].get(c.id)===ref)?.id;
}
export function projectEventsForPlayer(events:readonly DomainEvent[],p:Player):PlayerEvent[]{
 checkPlayer(p);
 return events.map(e=>{
  const base:PlayerEvent={type:e.type,player:e.player,count:e.cards.length};
  switch(e.type){
   case 'card_attack':case 'card_throw_in':case 'card_defend':case 'round_defended':case 'cards_taken':return {...base,cards:e.cards.map(card)};
   case 'cards_drawn':case 'magic_received':return e.player===p?{...base,cards:e.cards.map(card)}:base;
   case 'magic_activated':case 'magic_failed':return {...base,magicId:e.magicId,targetPlayer:e.targetPlayer,trump:e.trump,...(e.exchange?{exchange:{oldCard:card(e.exchange.oldCard),...(e.player===p?{newCard:card(e.exchange.newCard)}:{})}}:{})};
   case 'magic_expired':return {...base,magicId:e.magicId,...(e.player===p?{cards:e.cards.map(card)}:{})};
   default:throw Error('Unknown event');
  }
 });
}
