import {sealedCards} from './learning';
import {beats,canAttack,finished,normalCount,reduceGame,type Action,type Card,type Game} from './engine';
import {availableCards,blindAttack} from './trickRules';
import {chooseBotMagic} from './botMagic';
export interface BotMemory {magicUsedRound?:number}
function cost(c:Card,g:Game){return (c.suit===g.trump?15:0)+(g.inverted?8-c.rank:c.rank);}
export function applyLocalAction(g:Game,a:Action,memory:BotMemory){const next=reduceGame(g,a);if(next!==g&&a.type==='magic'&&a.player===1)memory.magicUsedRound=g.round??0;return next;}
export function botAction(g:Game,memory:BotMemory={}):Action|undefined { if(g.winner)return;const sealed=sealedCards(g,1)[0];if(sealed)return {type:'unlock_bot',player:1,ref:sealed.ref}; if(g.attacker===1&&!g.table.length){const available=availableCards(g,1);if(!available.length&&normalCount(g.hands[1]))return {type:'pass',player:1};if(blindAttack(g,1)&&available.length)return {type:'attack',player:1,ids:[available[Math.floor(Math.random()*available.length)].id]};}const magic=chooseBotMagic(g,Math.random,memory.magicUsedRound===(g.round??0));if(magic)return magic;const hand=[...g.hands[1]].sort((a,b)=>cost(a,g)-cost(b,g));if(g.attacker===1){const c=hand.find(c=>canAttack(g,c));if(c)return {type:'attack',player:1,ids:[c.id]};if(g.taking||finished(g))return {type:'end',player:1};}else if(g.table.length&&!g.taking){const i=g.table.findIndex(p=>!p.defense);if(i>=0){const c=hand.find(c=>beats(c,g.table[i].attack,g));return c?{type:'defend',player:1,id:c.id,target:i}:{type:'take',player:1};}} }

