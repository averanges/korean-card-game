import {createGame,reduceGame,beats,canAttack,finished,type Game,type Action,type Player} from '../engine';
import {projectGameForPlayer} from './projection';
import type {DomainEvent} from './types';

// Server chooses the random source. The ordinary deal and all rules remain in engine.ts.
export function createOrdinaryGame(random:()=>number):Game {const g=createGame(random);g.magicPool=[];delete g.learning;return g;}
export function ordinaryView(g:Game,p:Player,revision:number) {
 const hand=g.hands[p],live=!g.winner;
 return {revision,view:projectGameForPlayer(g,p),allowed:{
  attack:live&&g.attacker===p?hand.filter(c=>canAttack(g,c)).map(c=>c.id):[],
  defend:live&&g.attacker!==p&&!g.taking?g.table.flatMap((pair,target)=>pair.defense?[]:[{target,cardRefs:hand.filter(c=>beats(c,pair.attack,g)).map(c=>c.id)}]):[],
  take:live&&g.attacker!==p&&g.table.length>0&&!g.taking,
  end:live&&g.attacker===p&&(g.taking||finished(g))}};
}
export function ordinaryTransition(before:Game,action:Action,random:()=>number) {
 const game=reduceGame(before,action,random),events:DomainEvent[]=[];
 if(game===before)return {game,events};
 if(action.type==='attack')for(const id of action.ids){const card=game.table.find(p=>p.attack.id===id)!.attack;events.push({type:before.table.length?'card_throw_in':'card_attack',player:action.player,cards:[card]});}
 if(action.type==='defend')events.push({type:'card_defend',player:action.player,cards:[game.table[action.target].defense!]});
 if(action.type==='end')events.push({type:before.taking?'cards_taken':'round_defended',player:(1-before.attacker) as Player,cards:before.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack])});
 const deck=new Set(before.deck.map(c=>c.id));
 for(const player of [0,1] as const){const cards=game.hands[player].filter(c=>deck.has(c.id));if(cards.length)events.push({type:'cards_drawn',player,cards});}
 return {game,events};
}
