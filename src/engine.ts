import {createLearningState,sealDraw,reduceLearning,isStudyLocked,type LearningState,type LearningAction} from './learning';
import {distributeWords,type DeckInfo} from './decks';
import {newSpellIds} from './spells';
import {isLocked,availableCards,blindAttack,singleAttack,hatTargets,magicUnavailable,applyTrick,advanceTricks} from './trickRules';
import {quizAnswer,type QuizDirection} from './magicQuiz';
import { makeEffect, tickEffects, type ActiveEffect, type SpellKind } from './effects';
import { words, type Word } from './words';
export type Player = 0 | 1;
export const suits = ['♠','♥','♦','♣'];
export const ranks = ['6','7','8','9','10','В','Д','К','Т'];
export interface Card { id: string; suit: number; rank: number; word: Word; spell?: string }
export interface GameResult {winner:Player|null}
export type GameNotice={type:'started'|'defended'|'taken'|'taking'|'passed'|'magic_failed'}|{type:'magic_applied';player:Player;spell:string;trump?:number};
export interface Pair { attack: Card; defense?: Card }
export interface Game { learning?:LearningState; wordDeck?:DeckInfo; dictionary?:Word[]; magicPool?:Card[]; magicDropHistory?:[number[],number[]]; round?:number; deck: Card[]; hands: [Card[],Card[]]; table: Pair[]; discard: Card[]; trump: number; baseTrump:number; effects:ActiveEffect[]; attacker: Player; limit: number; taking: boolean; inverted: boolean; winner?: GameResult; log: GameNotice[]; magic: string[] }
export type Action = LearningAction | {type:'pass';player:Player} | { type:'attack'; player:Player; ids:string[] } | { type:'defend'; player:Player; id:string; target:number } | { type:'take'; player:Player } | { type:'end'; player:Player } | { type:'magic'; player:Player; id:string; question:number; answer:string; direction?:QuizDirection; trump?:number; targetId?:string };
export function shuffle<T>(cards:T[], random= Math.random):T[] { const a=[...cards]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
export function createGame(random=Math.random,source?:readonly Word[]):Game { const allocation=source?distributeWords(source,random):undefined; const deck:Card[]=shuffle(suits.flatMap((_,suit)=>ranks.map((_,rank)=>({id:`${suit}-${rank}`,suit,rank,word:allocation?.assigned[suit*9+rank]??words[suit*9+rank]}))),random); const trump=deck[0].suit; const bottom=deck.shift()!; const pool:Card[]=shuffle(['mirror','chance','fate',...newSpellIds.flatMap(s=>[s,s])].map((spell,i)=>({id:'magic-'+spell+'-'+i,suit:-1,rank:-1,word:words[i%words.length],spell})),random);deck.unshift(bottom); const hands:[Card[],Card[]]=[[],[]]; for(let i=0;i<6;i++)for(const h of hands){while(normalCount(h)<=i&&deck.length)h.push(deck.pop()!);} const low=hands.map(h=>Math.min(...h.filter(c=>c.suit===trump).map(c=>c.rank))); const attacker:Player=low[0]<=low[1]?0:1; return {learning:createLearningState(),magicPool:pool,magicDropHistory:[[],[]],dictionary:allocation?.dictionary??words.map(w=>({...w})),round:0,deck,hands,trump,baseTrump:trump,effects:[],attacker,limit:6,table:[],discard:[],taking:false,inverted:false,log:[{type:'started'}],magic:[]}; }
export function beats(a:Card,b:Card,g:Game){return !a.spell && !b.spell && !isLocked(g,a) && (a.suit===b.suit ? (g.inverted?a.rank<b.rank:a.rank>b.rank) : a.suit===g.trump && b.suit!==g.trump); }
export function canAttack(g:Game,c:Card){return !c.spell && !isLocked(g,c) && (!singleAttack(g,g.attacker)||!g.table.length) && g.table.length<g.limit && (!g.table.length || g.table.some(p=>p.attack.rank===c.rank || p.defense?.rank===c.rank));}
export function finished(g:Game){return g.table.length>0 && g.table.every(p=>p.defense);}
function settle(g:Game,take:boolean,random:()=>number){ const roundAttacker=g.attacker,defender=(1-g.attacker) as Player; const cards=g.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack]); if(take)g.hands[defender].push(...cards);else g.discard.push(...cards); for(const p of [g.attacker,defender])drawToSix(g,p,random); if(!take)g.attacker=defender; g.effects=g.effects.filter(e=>!(e.kind==='monkey_prank'&&e.status==='active'&&e.target===roundAttacker));advanceTricks(g);g.table=[];g.taking=false;g.limit=Math.min(6,normalCount(g.hands[1-g.attacker]));g.effects=tickEffects(tickEffects(g.effects,'rounds'),'turns');expireEffectsEvent(g,take?'cards-taken':'defense-complete');expireEffectsEvent(g,'round-end');g.log.push({type:take?'taken':'defended'}); checkWinner(g); }
export function reduceGame(state:Game,a:Action,random=Math.random):Game { if(a?.type.startsWith('unlock_'))return reduceLearning(state,a as LearningAction,random); if(state.winner||!a||![0,1].includes(a.player)||!['attack','defend','take','end','pass','magic'].includes(a.type))return state; const g:Game=structuredClone(state); if(a.type==='magic'){
 const c=g.hands[a.player].find(c=>c.id===a.id); if(!c?.spell||!canUseMagic(g,a.player)||magicUnavailable(g,a.player,c.spell))return state;
 const expected=quizAnswer(gameDictionary(g),a.question,a.direction);if(expected===undefined)return state;
 const correct=expected===a.answer;
 // A player's successful Fate must name a different suit before consuming the card.
 if(correct&&c.spell==='fate'&&(!Number.isInteger(a.trump)||!suits[a.trump!]||a.trump===g.trump))return state;
 if(correct&&c.spell==='magicians_hat'&&!hatTargets(g,a.player).some(c=>c.id===a.targetId))return state;
 g.hands[a.player]=g.hands[a.player].filter(x=>x.id!==c.id);g.magic.push(c.id);
 if(!correct){g.log.push({type:'magic_failed'});checkWinner(g);return g;}
 if(c.spell==='mirror')g.inverted=true;
 else if(c.spell==='chance'){g.deck=shuffle([...g.deck,...g.discard],random);g.discard=[];}
 else if(c.spell==='fate'){g.trump=a.trump!;}
 applyTrick(g,a.player,c,a.targetId,random);const effect=makeEffect(c.spell as SpellKind,c.id,g.trump);if(effect){g.effects=g.effects.filter(e=>e.kind!==effect.kind);g.effects.push(effect);refreshEffects(g);}
 g.log.push({type:'magic_applied',player:a.player,spell:c.spell,trump:c.spell==='fate'?g.trump:undefined});

 checkWinner(g);return g;}

 if(a.type==='pass'){if(g.hands[a.player].some(c=>isStudyLocked(g,c)))return state;if(a.player!==g.attacker||g.table.length||availableCards(g,a.player).length||!normalCount(g.hands[a.player]))return state;advanceTricks(g);g.attacker=(1-g.attacker) as Player;g.limit=Math.min(6,normalCount(g.hands[1-g.attacker]));g.log.push({type:'passed'});checkWinner(g);return g;}
 if(a.type==='attack'){if(a.player!==g.attacker||!a.ids.length||new Set(a.ids).size!==a.ids.length)return state;const cards=a.ids.map(id=>g.hands[a.player].find(c=>c.id===id));if(cards.some(c=>!c))return state;const cs=cards as Card[];if(g.table.length+cs.length>g.limit||singleAttack(g,a.player)&&(g.table.length>0||cs.length!==1))return state;if(!g.table.length&&cs.some(c=>c.rank!==cs[0].rank))return state;if(cs.some(c=>!canAttack(g,c)))return state;g.hands[a.player]=g.hands[a.player].filter(c=>!a.ids.includes(c.id));if(blindAttack(g,a.player))g.effects=g.effects.map(e=>e.kind==='monkey_prank'&&e.target===a.player&&e.status==='pending'?{...e,status:'active',duration:{type:'event',event:'monkey-resolved',label:'Одна карта: подкидывание запрещено до конца раунда'}}:e);g.table.push(...cs.map(attack=>({attack})));}
 if(a.type==='defend'){if(a.player===g.attacker||g.taking)return state; const c=g.hands[a.player].find(c=>c.id===a.id),p=g.table[a.target];if(!c||!p||p.defense||!beats(c,p.attack,g))return state;p.defense=c;g.hands[a.player]=g.hands[a.player].filter(x=>x.id!==c.id);}
 if(a.type==='take'){if(a.player===g.attacker||!g.table.length||g.taking)return state;g.taking=true;g.log.push({type:'taking'});}
 if(a.type==='end'){if(a.player!==g.attacker||(!g.taking&&!finished(g)))return state;settle(g,g.taking,random);}
 return g; }
export function canUseMagic(g:Game,p:Player){return !g.winner&&!g.taking&&(g.attacker===p||g.table.length>0);}
function checkWinner(g:Game){if(!g.deck.length&&!g.table.length){const e=g.hands.map(h=>normalCount(h)===0);if(e[0]||e[1]){g.winner={winner:e[0]&&e[1]?null:e[0]?0:1};g.effects=g.effects.filter(e=>e.duration.type==='permanent');}}}
export function normalCount(hand:Card[]){return hand.filter(c=>!c.spell).length;}
export function drawToSix(g:Game,p:Player,random=Math.random){while(normalCount(g.hands[p])<6&&g.deck.length){const card=g.deck.pop()!;g.hands[p].push(card);if(!card.spell)sealDraw(g,card,random);}}
export function refreshEffects(g:Game){g.inverted=g.effects.some(e=>e.modifier.inverted);g.trump=[...g.effects].reverse().find(e=>e.modifier.trump!==undefined)?.modifier.trump??g.baseTrump;}

export function expireEffectsEvent(g:Game,event:string){g.effects=tickEffects(g.effects,{event});refreshEffects(g);}

export function gameDictionary(g:Game):Word[]{return g.dictionary??[...new Map([...g.deck,...g.hands.flat(),...g.discard,...g.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack])].filter(c=>!c.spell).map(c=>[c.word.ko+'|'+c.word.ru,c.word])).values()].sort((a,b)=>a.ko.localeCompare(b.ko)||a.ru.localeCompare(b.ru));}
