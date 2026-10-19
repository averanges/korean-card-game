import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../../src/engine';
import {createRoom,randomSecret} from '../src/model';
import {migrateRoom} from '../src/magicSession';
import {applyCommand,sessionSnapshot} from '../src/gameSession';
import type {NetworkCommand} from '../../src/rooms/protocol';
const policy={waitingMs:4000,roomMs:24000,retentionMs:1000};
test('schema 2 game migrates without redeal or enabling magic in an existing ordinary party',async()=>{
 const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,policy);room.schemaVersion=2;room.game=createGame(()=>.4);room.game.magicPool=[];room.gameRevision=7;
 const before=JSON.stringify(room.game);assert.ok(migrateRoom(room,()=>.1));assert.equal(room.schemaVersion,3);assert.equal(room.gameMode,'ordinary');assert.equal(JSON.stringify(room.game),before);assert.equal(room.gameRevision,7);assert.deepEqual(room.challenges!.usedIds,[]);assert.equal(migrateRoom(room,()=>.9),false);
});
test('server listening has four Russian options, audio text, and no written prompt or answer key',async()=>{
 for(const random of [()=>.1,()=>.9]){const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,policy);room.gameMode='magic';room.game=createGame(()=>.4);room.game.attacker=0;room.gameRevision=1;migrateRoom(room,random);const i=room.game.magicPool!.findIndex(c=>c.spell==='mirror'),card=room.game.magicPool!.splice(i,1)[0];room.game.hands[0].push(card);
  const next=applyCommand(room,0,{type:'begin_magic',magicRef:card.id,requestId:'begin',expectedRevision:1},random);assert.ok(next.result.ok);const q=sessionSnapshot(next.state!,0)!.challenge!.quiz!;
  assert.equal(q.direction,'ko-ru');assert.equal(q.mode,'listening');assert.equal(q.prompt,'');assert.ok(q.audioText);assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.deepEqual(Object.keys(q).sort(),['audioText','challengeId','direction','mode','options','prompt']);
 }
});
test('Hat target becomes unavailable atomically when opponent consumes the last eligible deck card',async()=>{
 const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,policy);room.gameMode='magic';room.game=createGame(()=>.4);room.game.attacker=0;room.gameRevision=1;room.game.table=[{attack:{id:'table',rank:0,suit:0,word:{ko:'표',ru:'стол'}}}];
 room.game.deck=[{id:'last',rank:8,suit:0,word:{ko:'마지막',ru:'последний'}}];migrateRoom(room,()=>.4);
 for(const [p,spell] of [[0,'magicians_hat'],[1,'trick_gift']] as const){const i=room.game.magicPool!.findIndex(c=>c.spell===spell);room.game.hands[p].push(room.game.magicPool!.splice(i,1)[0]);}
 const hat=room.game.hands[0].find(c=>c.spell==='magicians_hat')!;
 function send(p:0|1,intent:object){const next=applyCommand(room,p,{...intent,requestId:randomSecret(),expectedRevision:room.gameRevision} as NetworkCommand,()=>.4);assert.ok(next.result.ok,next.result.code);Object.assign(room,next.state);}
 function answer(p:0|1){const c=room.challenges!.attempts[p]!;send(p,{type:'answer_quiz',challengeId:c.id,option:c.quiz.options.indexOf(c.quiz.correct)});}
 send(0,{type:'begin_magic',magicRef:hat.id});answer(0);assert.equal(room.challenges!.attempts[0]!.phase,'target');
 send(1,{type:'begin_magic',magicRef:room.game.hands[1].find(c=>c.spell==='trick_gift')!.id});answer(1);
 assert.equal(room.challenges!.attempts[0]!.outcome,'unavailable');assert.equal(room.challenges!.attempts[0]!.phase,'resolved');assert.ok(room.game.hands[0].some(c=>c.id===hat.id));assert.equal(applyCommand(room,0,{type:'end',requestId:'unlocked',expectedRevision:room.gameRevision!}).result.code,'illegal_move');
});
