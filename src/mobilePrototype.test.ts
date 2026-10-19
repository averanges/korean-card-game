import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fanGeometry,demoHand,demoPairs,demoCanAttack,demoCanDefend} from './mobile-prototype/model';
test('six-card prototype fan has disjoint 44px tap lanes on required portrait sizes',()=>{
 for(const [width,height] of [[302,124],[342,146],[372,146],[412,146]]){
  const fan=fanGeometry(6,width,height);assert.equal(fan.dense,false);
  fan.positions.forEach((p,i)=>{assert.ok(p.hitWidth>=44);assert.ok(p.x>=0);assert.ok(p.x+p.hitWidth<=width);assert.ok(p.y+fan.cardHeight<=height);if(i)assert.ok(p.x>=fan.positions[i-1].x+fan.positions[i-1].hitWidth-.01);});
 }
});
test('dense hands explicitly require an overview; prepared ghost data stays separate',()=>{
 assert.equal(fanGeometry(12,372,146).dense,true);assert.equal(fanGeometry(20,372,146).dense,true);
 const standard=demoHand(6),ghost=demoHand(6,true);assert.ok(!standard.some(c=>c.locked));assert.equal(ghost.filter(c=>c.locked).length,1);assert.equal(standard.length,6);assert.equal(demoHand(20).length,20);
});
test('prototype highlights forward existing attack/defense rules and reject the locked card',()=>{
 const hand=demoHand(6),pair=demoPairs(1,'defense')[0];assert.equal(demoCanDefend(hand[0],pair),true);assert.equal(demoCanDefend({...hand[0],locked:true},pair),false);
 assert.equal(demoCanAttack(hand[0],[pair]),true);assert.equal(demoCanAttack(hand[1],[pair]),false);assert.equal(demoCanAttack(undefined,[]),false);
});
