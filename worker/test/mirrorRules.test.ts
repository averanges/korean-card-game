import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../../src/engine';
import {createRoom,randomSecret,type StoredRoom} from '../src/model';
import {applyCommand,sessionSnapshot} from '../src/gameSession';
import {migrateRoom} from '../src/magicSession';
import type {NetworkCommand,Seat} from '../../src/rooms/protocol';

function send(room:StoredRoom,player:Seat,intent:object){
 const next=applyCommand(room,player,{...intent,requestId:randomSecret(),expectedRevision:room.gameRevision} as NetworkCommand,()=>.4);
 if(next.result.ok)Object.assign(room,next.state);
 return next;
}
async function fixture(attacker:Seat,suit:number,inverted:boolean,attackRank=8){
 const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,{waitingMs:4000,roomMs:24000,retentionMs:1000});
 const defender=(1-attacker) as Seat,other=(suit+1)%4;
 const game=createGame(()=>.4),all=[...game.deck,...game.hands.flat()];
 const card=(s:number,rank:number)=>all.find(c=>c.suit===s&&c.rank===rank)!;
 const defenseRank=attackRank===8?0:8;
 game.hands[attacker]=[card(suit,attackRank),card(other,8),card(other,0),card(other,1),card((suit+2)%4,8)];
 game.hands[defender]=[card(suit,defenseRank),card(suit,2),card(suit,3),card(suit,4)];
 game.deck=all.filter(c=>!game.hands.flat().includes(c));game.attacker=attacker;game.trump=game.baseTrump=3;game.limit=3;
 room.game=game;room.gameMode='magic';room.gameRevision=1;migrateRoom(room,()=>.4);
 if(inverted){
  const i=game.magicPool!.findIndex(c=>c.spell==='mirror'),magic=game.magicPool!.splice(i,1)[0];game.hands[attacker].push(magic);
  assert.ok(send(room,attacker,{type:'begin_magic',magicRef:magic.id}).result.ok);
  const challenge=room.challenges!.attempts[attacker]!;
  assert.ok(send(room,attacker,{type:'answer_quiz',challengeId:challenge.id,option:challenge.quiz.options.indexOf(challenge.quiz.correct)}).result.ok);
 }
 return {room,defender,attack:card(suit,attackRank).id,defense:card(suit,defenseRank).id,ace:card(other,8).id,six:card(other,0).id,seven:card(other,1).id,extra:card((suit+2)%4,8).id};
}

test('Mirror network commands: six beats same-suit ace for either seat in every suit; reverse defense is rejected',async()=>{
 for(const attacker of [0,1] as const)for(let suit=0;suit<4;suit++)for(const inverted of [false,true])for(const attackRank of [0,8]){
  const {room,defender,attack,defense}=await fixture(attacker,suit,inverted,attackRank);
  assert.ok(send(room,attacker,{type:'attack',cardRefs:[attack]}).result.ok);
  for(const viewer of [0,1] as const)assert.equal(sessionSnapshot(room,viewer)!.view.inverted,inverted);
  const permitted=inverted?attackRank===8:attackRank===0;
  assert.equal(sessionSnapshot(room,defender)!.allowed.defend.some(d=>d.target===0&&d.cardRefs.includes(defense)),permitted);
  const result=send(room,defender,{type:'defend',cardRef:defense,target:0});assert.equal(result.result.ok,permitted);
  if(permitted)for(const viewer of [0,1] as const)assert.equal(sessionSnapshot(room,viewer)!.view.table[0].defense!.id,defense);
  else assert.equal(result.result.code,'illegal_move');
 }
});

test('Mirror leaves network throw-ins based on printed attack/defense ranks and preserves the attack limit',async()=>{
 for(const attacker of [0,1] as const)for(const inverted of [false,true]){
  const {room,defender,attack,defense,ace,six,seven,extra}=await fixture(attacker,0,inverted,inverted?8:0);
  // Different printed ranks cannot form an opening batch, irrespective of their strength.
  assert.equal(send(room,attacker,{type:'attack',cardRefs:[attack,inverted?six:ace]}).result.code,'illegal_move');
  assert.ok(send(room,attacker,{type:'attack',cardRefs:[attack]}).result.ok);
  const before=sessionSnapshot(room,attacker)!.allowed.attack;
  assert.ok(before.includes(inverted?ace:six));assert.ok(!before.includes(inverted?six:ace));assert.ok(!before.includes(seven));
  assert.ok(send(room,defender,{type:'defend',cardRef:defense,target:0}).result.ok);
  const after=sessionSnapshot(room,attacker)!.allowed.attack;
  assert.ok(after.includes(ace));assert.ok(after.includes(six));assert.ok(!after.includes(seven));
  assert.equal(send(room,attacker,{type:'attack',cardRefs:[seven]}).result.code,'illegal_move');
  assert.ok(send(room,attacker,{type:'attack',cardRefs:[ace,six]}).result.ok);
  assert.equal(room.game!.table.length,3);assert.deepEqual(sessionSnapshot(room,attacker)!.allowed.attack,[]);
  assert.equal(send(room,attacker,{type:'attack',cardRefs:[extra]}).result.code,'illegal_move');
 }
});
