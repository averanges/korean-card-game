import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,randomSecret} from '../src/model';
import {createGame,type Card} from '../../src/engine';
import {migrateRoom} from '../src/magicSession';
import {applyCommand,sessionSnapshot} from '../src/gameSession';
import type {NetworkCommand} from '../../src/rooms/protocol';
test('Ghost: owner receives a marked card, peer does not; engine rejects it, then expiry restores it',async()=>{
 const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,{waitingMs:4000,roomMs:24000,retentionMs:1000});
 const card=(id:string,rank:number):Card=>({id,rank,suit:0,word:{ko:id,ru:id}});
 room.game=createGame(()=>.4);room.gameMode='magic';room.gameRevision=1;room.game.attacker=0;room.game.trump=room.game.baseTrump=3;room.game.hands=[[card('attack',0)],[card('locked-private',2),card('available',3)]];migrateRoom(room,()=>0);
 const i=room.game.magicPool!.findIndex(c=>c.spell==='ghost_thief'),spell=room.game.magicPool!.splice(i,1)[0];room.game.hands[0].push(spell);
 function send(p:0|1,intent:object){const next=applyCommand(room,p,{...intent,requestId:randomSecret(),expectedRevision:room.gameRevision} as NetworkCommand,()=>0);if(next.result.ok)Object.assign(room,next.state);return next;}
 send(0,{type:'begin_magic',magicRef:spell.id});const c=room.challenges!.attempts[0]!;send(0,{type:'answer_quiz',challengeId:c.id,option:c.quiz.options.indexOf(c.quiz.correct)});
 const owner=sessionSnapshot(room,1)!,peer=sessionSnapshot(room,0)!;assert.equal(owner.view.locked![0].id,'locked-private');assert.equal(owner.view.blockedCount,1);assert.ok(!JSON.stringify(peer).includes('locked-private'));assert.ok(!owner.allowed.defend.some(d=>d.cardRefs.includes('locked-private')));
 send(0,{type:'attack',cardRefs:['attack']});assert.equal(send(1,{type:'defend',cardRef:'locked-private',target:0}).result.code,'illegal_move');
 assert.ok(send(1,{type:'defend',cardRef:'available',target:0}).result.ok);assert.ok(send(0,{type:'end'}).result.ok);
 const released=sessionSnapshot(room,1)!;assert.deepEqual(released.view.locked,[]);assert.equal(released.view.blockedCount,0);assert.ok(released.allowed.attack.includes('locked-private'));assert.ok(send(1,{type:'attack',cardRefs:['locked-private']}).result.ok);
});
