import {createProjectionContext,projectGameForPlayer,type ProjectionContext} from '../../src/game-core/projection';
import {createChallengeBook,publicQuiz} from '../../src/game-core/challenges';
import {availableCards,blindAttack,hatTargets,magicUnavailable} from '../../src/trickRules';
import {shuffle,type Game,type Player,type Action} from '../../src/engine';
import type {DomainEvent} from '../../src/game-core/types';
import type {StoredRoom} from './model';
import type {PublicChallenge} from '../../src/rooms/protocol';

export interface BlindState {references:[Array<[string,string]>,Array<[string,string]>];rounds:[number,number];orders:[string[],string[]];signatures:[string,string]}
export function restoreProjection(room:StoredRoom):ProjectionContext {
 const context=createProjectionContext();
 if(room.blind){context.references=[new Map(room.blind.references[0]),new Map(room.blind.references[1])];context.rounds=[...room.blind.rounds];}
 return context;
}
export function refreshBlind(room:StoredRoom,random:()=>number) {
 const g=room.game;if(!g)return;
 room.blind??={references:[[],[]],rounds:[-1,-1],orders:[[],[]],signatures:['','']};
 const state=room.blind,context=restoreProjection(room);
 for(const p of [0,1] as const) {
  const active=blindAttack(g,p);
  const signature=active?JSON.stringify([g.round,g.effects.filter(e=>e.kind==='monkey_prank'&&e.target===p).map(e=>e.id),g.hands[p].map(c=>c.id).sort(),availableCards(g,p).map(c=>c.id).sort()]):'';
  if(signature!==state.signatures[p]){context.references[p].clear();context.rounds[p]=-1;state.orders[p]=active?shuffle(availableCards(g,p).map(c=>c.id),random):[];state.signatures[p]=signature;}
  projectGameForPlayer(g,p,context);
 }
 state.references=[Array.from(context.references[0]),Array.from(context.references[1])];state.rounds=context.rounds;
}
export function migrateRoom(room:StoredRoom,random:()=>number):boolean {
 if(room.schemaVersion===3)return false;
 room.gameMode??=room.game?'ordinary':'magic';room.challenges??=createChallengeBook();room.recentQuestions??=[[],[]];room.schemaVersion=3;refreshBlind(room,random);return true;
}
export const pendingChallenge=(room:StoredRoom,p:Player)=>{const c=room.challenges?.attempts[p];return c&&['question','target'].includes(c.phase)?c:undefined;};
export function canStartMagic(g:Game,p:Player,spell:string):boolean {return projectGameForPlayer(g,p).actors.includes(p)&&!magicUnavailable(g,p,spell);}
export function publicChallenge(room:StoredRoom,p:Player):PublicChallenge|undefined {
 const c=room.challenges?.attempts[p];if(!c)return;
 const magicKind=c.magicKind??room.game?.hands[p].find(card=>card.id===c.cardId)?.spell;
 const result:PublicChallenge={challengeId:c.id,magicRef:c.cardId,...(magicKind?{magicKind}:{}),phase:c.phase,...(c.outcome?{outcome:c.outcome}:{})};
 if(c.phase==='question')result.quiz=publicQuiz(c);
 if(c.phase==='target'&&room.game){const spell=room.game.hands[p].find(card=>card.id===c.cardId)?.spell;
  if(spell==='fate')result.target={kind:'trump',suits:[0,1,2,3].filter(s=>s!==room.game!.trump)};
  if(spell==='magicians_hat')result.target={kind:'hat',cardRefs:hatTargets(room.game,p).map(c=>c.id)};
 }
 return result;
}
export function extraMagicEvents(before:Game,after:Game,action?:Action):DomainEvent[] {
 if(before===after)return [];
 const events:DomainEvent[]=[];
 if(action?.type==='magic') {
  const c=before.hands[action.player].find(c=>c.id===action.id)!;
  const failed=after.log.at(-1)?.type==='magic_failed';
  const oldCard=action.targetId?before.hands[action.player].find(c=>c.id===action.targetId):undefined;
  const newCard=c.spell==='magicians_hat'?after.hands[action.player].find(c=>!before.hands[action.player].some(old=>old.id===c.id)):undefined;
  events.push({type:failed?'magic_failed':'magic_activated',player:action.player,cards:[c],magicId:c.spell,targetPlayer:c.spell==='magicians_hat'?action.player:(1-action.player) as Player,...(c.spell==='fate'&&!failed?{trump:after.trump}:{}),...(oldCard&&newCard?{exchange:{oldCard,newCard}}:{})});
  if(c.spell!=='magicians_hat'){const deck=new Set(before.deck.map(c=>c.id));for(const p of [0,1] as const){const cards=after.hands[p].filter(c=>deck.has(c.id));if(cards.length)events.push({type:'cards_drawn',player:p,cards});}}
 }
 const pool=new Set(before.magicPool?.map(c=>c.id));
 for(const p of [0,1] as const){const cards=after.hands[p].filter(c=>pool.has(c.id));if(cards.length)events.push({type:'magic_received',player:p,cards});}
 for(const effect of before.effects.filter(e=>!after.effects.some(next=>next.id===e.id))){const p=effect.target??0;const card=after.hands[p].find(c=>c.id===effect.lockedCardId);events.push({type:'magic_expired',player:p,cards:card?[card]:[],magicId:effect.kind});}
 return events;
}
