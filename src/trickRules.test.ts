import {botAction} from './bot';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,reduceGame,normalCount,type Card,type Action} from './engine';
import {availableCards,blindAttack,hatTargets,isLocked,magicUnavailable} from './trickRules';
import {animationEvents} from './animationModel';
const c=(id:string,rank=0,suit=0,spell?:string):Card=>({id,rank,suit,spell,word:{ko:'사과',ru:'яблоко'}});
const cast=(id:string,extra:object={}):Action=>({type:'magic',player:0,id,question:0,answer:'яблоко',...extra});
test('finite pool has 11 unique instances; none enter the initial shared deck',()=>{
 const g=createGame(),all=[...g.deck,...g.hands.flat(),...g.magicPool!],magic=all.filter(c=>c.spell);
 assert.equal(magic.length,11);assert.equal(new Set(magic.map(c=>c.id)).size,11);
 for(const spell of ['ghost_thief','trick_gift','monkey_prank','magicians_hat'])assert.equal(magic.filter(c=>c.spell===spell).length,2);
 assert.equal(g.magicPool!.length,11);assert.equal(all.length,47);
});
test('independent ghosts lock different cards through the next full round; empty available hand can pass',()=>{
 let g=createGame();g.attacker=0;g.deck=[];g.hands=[[c('keep'),c('g1',0,0,'ghost_thief'),c('g2',0,0,'ghost_thief')],[c('v1'),c('v2',1)]];
 g.table=[{attack:c('attack'),defense:c('cover',1)}];
 g=reduceGame(g,cast('g1'));g=reduceGame(g,cast('g2'));
 assert.equal(normalCount(g.hands[1]),2);assert.equal(availableCards(g,1).length,0);
 assert.equal(new Set(g.effects.map(e=>e.lockedCardId)).size,2);assert.ok(magicUnavailable(g,0,'ghost_thief'));
 g=reduceGame(g,{type:'end',player:0});assert.equal(g.round,1);assert.equal(g.effects.length,2);
 assert.equal(botAction(g)?.type,'pass');g=reduceGame(g,{type:'pass',player:1});assert.equal(g.effects.length,0);assert.equal(availableCards(g,1).length,2);assert.equal(g.winner,undefined);
});
test('Gift skips magic, Hat uses nominal ranks and conserves cards; unavailable magic is preserved',()=>{
 let g=createGame();g.attacker=0;g.hands=[[c('low'),c('hat',0,0,'magicians_hat'),c('gift',0,0,'trick_gift')],Array.from({length:6},(_,i)=>c('o'+i))];
 g.deck=[c('higher',4,1),c('top-magic',0,0,'mirror')];g.inverted=true;
 assert.equal(hatTargets(g,0)[0].id,'low');const action=cast('hat',{targetId:'low'}),next=reduceGame(g,action);
 assert.ok(next.hands[0].some(c=>c.id==='higher'));assert.ok(next.discard.some(c=>c.id==='low'));assert.equal(next.deck.length,1);assert.equal(reduceGame(next,action),next);
 assert.ok(magicUnavailable(next,0,'trick_gift'));assert.equal(reduceGame(next,cast('gift')),next);
 g=reduceGame(g,cast('gift'));assert.equal(normalCount(g.hands[1]),7);assert.equal(g.deck.length,1);assert.ok(g.deck[0].spell);assert.equal(g.hands[1].at(-1)?.id,'higher');
});
test('Monkey rejects multiple cards and all throw-ins, reveals only at commitment and expires after the round',()=>{
 let g=createGame();g.attacker=0;g.deck=[];g.hands=[[c('keep',3),c('m',0,0,'monkey_prank')],[c('a'),c('b',0,1),c('keep2',3)]];
 g.table=[{attack:c('attack'),defense:c('cover',1)}];g=reduceGame(g,cast('m'));assert.ok(magicUnavailable(g,0,'monkey_prank'));
 g=reduceGame(g,{type:'end',player:0});assert.ok(blindAttack(g,1));
 assert.equal(reduceGame(g,{type:'attack',player:1,ids:['a','b']}),g);
 const action:Action={type:'attack',player:1,ids:['a']};g=reduceGame(g,action);assert.equal(blindAttack(g,1),false);assert.equal(g.effects[0].status,'active');
 assert.equal(reduceGame(g,{type:'attack',player:1,ids:['b']}),g);g=reduceGame(g,{type:'take',player:0});assert.equal(reduceGame(g,{type:'attack',player:1,ids:['b']}),g);
 const before=g;g=reduceGame(g,{type:'end',player:1});assert.equal(g.effects.length,0);assert.ok(animationEvents(before,g,{type:'end',player:1}).some(e=>e.type==='magic_expired'));
});
test('reverse-format success triggers activation animation rather than a burn',()=>{
 const g=createGame();g.attacker=0;g.hands[0]=[c('keep'),c('m',0,0,'monkey_prank')];
 const a:Action={type:'magic',player:0,id:'m',question:0,direction:'ru-ko',answer:'사과'};
 assert.equal(animationEvents(g,reduceGame(g,a),a)[0].type,'magic_activated');
});
