import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,drawToSix} from './engine';
import {magicDropChance,magicDropSettings,rollMagicDrop} from './magicDrops';
import {animationEvents} from './animationModel';
test('initial deal has no magic; refill can award more than three unique extras without replacing normals',()=>{
 const g=createGame();assert.equal(g.magicPool?.length,11);assert.ok([...g.deck,...g.hands.flat()].every(c=>!c.spell));
 g.hands[0]=[];drawToSix(g,0,()=>0);
 assert.equal(g.hands[0].filter(c=>!c.spell).length,6);assert.equal(g.hands[0].filter(c=>c.spell).length,6);
 assert.equal(g.magicPool?.length,5);assert.equal(new Set(g.hands[0].map(c=>c.id)).size,12);
});
test('repeat penalty persists in current and next round, is mild, player-specific and then expires',()=>{
 const g=createGame();const base=magicDropChance(g,0);rollMagicDrop(g,0,()=>0);
 assert.equal(magicDropChance(g,0),base*.8);assert.equal(magicDropChance(g,1),base);
 g.round=1;assert.equal(magicDropChance(g,0),base*.8);
 g.round=2;assert.equal(magicDropChance(g,0),base);
 g.magicDropHistory=[[2,2,2,2],[]];assert.equal(magicDropChance(g,0),base*magicDropSettings.minimumMultiplier);
});
test('legendary instance occupies less weighted range; pool awards are animated after refill',()=>{
 const g=createGame();const normal=g.hands[0][0];g.hands[0]=[];
 g.magicPool=[{...normal,id:'legend',spell:'mirror'},{...normal,id:'major',spell:'ghost_thief'}];
 const randoms=[0,.3];rollMagicDrop(g,0,()=>randoms.shift()??0);
 assert.equal(g.hands[0][0].id,'major'); // .3 is outside legendary's .35/1.35 share.
 const before=createGame();before.attacker=0;before.hands[0]=[];
 before.table=[{attack:normal,defense:{...normal,id:'cover'}}];
 const after=structuredClone(before);drawToSix(after,0,()=>0);after.table=[];
 const events=animationEvents(before,after,{type:'end',player:0});
 assert.ok(events.some(e=>e.type==='magic_received'));assert.ok(events.filter(e=>e.type==='magic_received').every(e=>e.delay>=320));
});
