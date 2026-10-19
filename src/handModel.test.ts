import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handLayout,sortOrdinaryCards,splitHand,toggleHandSelection} from './handModel';
import type {Card} from './engine';
const c=(id:string,rank:number,suit=0):Card=>({id,rank,suit,word:{ko:'물',ru:'вода'}});
test('rank-first sorting is immutable, stable and excludes magic',()=>{const input=[c('ace',8),c('6club',0,3),{...c('magic',-1),spell:'mirror'},c('6heart',0,1),c('6spade',0),c('6diamond',0,2)];const before=structuredClone(input);assert.deepEqual(sortOrdinaryCards(input).map(c=>c.id),['6spade','6heart','6diamond','6club','ace']);assert.deepEqual(input,before);assert.equal(splitHand(input).magic.length,1);});
test('selection toggles, groups equal ranks, replaces on a different rank; defense is single',()=>{const cards=[c('a',0),c('b',0,1),c('q',6)];let ids=toggleHandSelection([],cards[0],cards,true);ids=toggleHandSelection(ids,cards[1],cards,true);assert.deepEqual(ids,['a','b']);assert.deepEqual(toggleHandSelection(ids,cards[2],cards,true),['q']);assert.deepEqual(toggleHandSelection(ids,cards[0],cards,true),['b']);assert.deepEqual(toggleHandSelection(ids,cards[1],cards,false),['a']);assert.deepEqual(toggleHandSelection(['a'],cards[1],cards,false),['b']);});
test('all required hand sizes have symmetric, evenly spaced positions and bounded angles',()=>{for(const n of [1,3,6,8,10,15,20])for(const width of [360,600,900]){const g=handLayout(n,width,112,167);for(let i=0;i<n;i++){const a=g.positions[i],b=g.positions[n-1-i];assert.ok(Math.abs(a.angle)<=8);assert.ok(Math.abs(a.angle+b.angle)<1e-8);assert.ok(Math.abs(a.y-b.y)<1e-8);assert.ok(Math.abs(a.x+b.x+112-g.width)<1e-8);assert.ok(a.y>=42);assert.ok(a.y+167<=g.height);if(i>1)assert.ok(Math.abs((a.x-g.positions[i-1].x)-(g.positions[1].x-g.positions[0].x))<1e-8);}if(n>=11){assert.equal(g.mode,'scroll');assert.equal(g.scroll,true);assert.equal(g.cardWidth,112);}if(n===1)assert.equal(g.positions[0].x,(width-112)/2);}});
test('large hands stay full size and preserve readable step rather than shrinking indefinitely',()=>{const a=handLayout(15,360,96,143),b=handLayout(20,360,96,143);assert.equal(a.cardWidth,b.cardWidth);assert.ok(a.positions[1].x-a.positions[0].x>=70);assert.ok(b.width>a.width);});
test('touch layout exposes every card without overlap and reserves selection clearance',()=>{
 for(const count of [6,10,15,20])for(const width of [304,344,374,414]){
  const layout=handLayout(count,width,100,149,true);
  assert.equal(layout.scroll,true);assert.equal(layout.cardWidth,100);
  for(let i=0;i<count;i++){const p=layout.positions[i];assert.equal(p.angle,0);assert.ok(p.y>=22);assert.ok(p.y+149<=layout.height);assert.ok(p.x>=0&&p.x+100<=layout.width);if(i)assert.ok(p.x>=layout.positions[i-1].x+110);}
 }
});
