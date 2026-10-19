import {beats,canAttack,createGame,type Card,type Game,type Pair} from '../engine';
import {words} from '../words';

export type DemoCard=Card&{locked?:boolean};
export type DemoPhase='attack'|'defense'|'throw';
// Prepared UX data only. Never imported by the game, server or room protocol.
const context=createGame(()=>.4);
export function demoHand(count:number,ghost=false):DemoCard[]{return Array.from({length:count},(_,i)=>({id:'demo-hand-'+i,rank:i%9,suit:i%4,word:words[i%words.length],locked:ghost&&i===1}));}
export function demoPairs(count:number,phase:DemoPhase):Pair[]{return Array.from({length:count},(_,i)=>({attack:{id:'demo-attack-'+i,rank:i%5,suit:(i+1)%4,word:words[(20+i)%words.length]},...(i<count-1||phase==='throw'?{defense:{id:'demo-defense-'+i,rank:i%5+2,suit:(i+1)%4,word:words[(26+i)%words.length]}}:{})}));}
const rules=(table:Pair[]):Game=>({...context,trump:0,inverted:false,effects:[],limit:6,table});
// Reuse existing checks for plausible highlights; this is not another game engine.
export const demoCanAttack=(card:DemoCard|undefined,table:Pair[])=>!!card&&!card.locked&&canAttack(rules(table),card);
export const demoCanDefend=(card:DemoCard|undefined,pair:Pair)=>!!card&&!card.locked&&!pair.defense&&beats(card,pair.attack,rules([]));

export {fanGeometry} from '../mobileHandLayout';
