import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,drawToSix} from '../../src/engine';
import {sealedCards} from '../../src/learning';
import {createRoom,randomSecret,type StoredRoom} from '../src/model';
import {applyCommand,sessionSnapshot,sessionEvents} from '../src/gameSession';
import {migrateRoom,refreshBlind} from '../src/magicSession';
import type {NetworkCommand,Seat} from '../../src/rooms/protocol';
async function fixture(){const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,{waitingMs:10000,roomMs:10000,retentionMs:1000});room.gameMode='magic';room.game=createGame(()=>.4);room.gameRevision=1;room.game.discard.push(...room.game.hands[0].splice(0,3));drawToSix(room.game,0,()=>0);migrateRoom(room,()=>.4);return room;}
function send(r:StoredRoom,p:Seat,intent:object,random=()=>0){const result=applyCommand(r,p,{...intent,requestId:randomSecret(),expectedRevision:r.gameRevision} as NetworkCommand,random);if(result.result.ok)Object.assign(r,result.state);return result;}
test('learning commands bind ref to owner, validate answers, preserve physical card and award atomically once',async()=>{
 const r=await fixture(),seal=sealedCards(r.game!,0)[0];assert.equal(send(r,1,{type:'begin_unlock',cardRef:seal.ref}).result.ok,false);assert.equal(send(r,0,{type:'begin_unlock',cardRef:r.game!.hands[0][0].id}).result.ok,false);
 r.game!.attacker=1;assert.ok(send(r,0,{type:'begin_unlock',cardRef:seal.ref}).result.ok);const q=r.game!.learning!.attempts[0]!,card=r.game!.hands[0].find(c=>c.id===q.cardId)!,deck=r.game!.deck.map(c=>c.id),before=r.game!.magicPool!.length;
 assert.equal(sessionSnapshot(r,1)!.view.unlock,undefined);assert.equal(sessionSnapshot(r,0)!.view.unlock!.correct,undefined);assert.equal(send(r,0,{type:'answer_unlock',challengeId:q.id,option:4}).result.ok,false);
 const events=send(r,0,{type:'answer_unlock',challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)}).events;
 assert.equal(r.game!.hands[0].filter(c=>c.id===card.id).length,1);assert.equal(r.game!.magicPool!.length,before-1);assert.deepEqual(r.game!.deck.map(c=>c.id),deck);assert.ok(events.some(e=>e.type==='magic_received'&&e.sourceRef===seal.ref));assert.ok(sessionEvents(events,0,r).find(e=>e.type==='card_unlocked')!.cards!.length);assert.equal(sessionEvents(events,1,r).find(e=>e.type==='card_unlocked')!.cards,undefined);
 const size=r.game!.magicPool!.length;assert.equal(send(r,0,{type:'answer_unlock',challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)}).result.ok,false);assert.equal(r.game!.magicPool!.length,size);
});
test('serialized room restores unlimited reading failures, same attempt, stats and no reward duplication',async()=>{
 let r=await fixture(),ref=sealedCards(r.game!,0)[0].ref;send(r,0,{type:'begin_unlock',cardRef:ref});const q=r.game!.learning!.attempts[0]!;send(r,0,{type:'answer_unlock',challengeId:q.id,option:q.quiz.options.findIndex(o=>o!==q.quiz.correct)});send(r,0,{type:'close_unlock',challengeId:q.id});r=JSON.parse(JSON.stringify(r));assert.ok(send(r,0,{type:'begin_unlock',cardRef:ref}).result.ok);assert.equal(sessionSnapshot(r,0)!.view.unlock!.errors,1);assert.equal(sessionSnapshot(r,0)!.view.unlock!.id,q.id);assert.equal(sessionSnapshot(r,0)!.view.unlock!.firstCorrect,false);assert.ok(send(r,0,{type:'continue_unlock',challengeId:q.id}).result.ok);
});
test('reconnected room preserves per-player pity and awards third opening atomically only once',async()=>{
 let r=await fixture();
 for(let i=0;i<3;i++){
  const ref=sealedCards(r.game!,0)[0].ref;assert.ok(send(r,0,{type:'begin_unlock',cardRef:ref}).result.ok);const q=r.game!.learning!.attempts[0]!;
  const command={type:'answer_unlock',challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)};
  assert.ok(send(r,0,command,()=>.99).result.ok);assert.deepEqual(r.game!.learning!.rewardMisses,[i<2?i+1:0,0]);
  r=JSON.parse(JSON.stringify(r));migrateRoom(r,()=>.99);sessionSnapshot(r,0);
  assert.equal(send(r,0,command,()=>0).result.ok,false);
 }
 assert.equal(r.game!.magicPool!.length,10);assert.equal(r.game!.hands[0].filter(c=>c.spell).length,1);
});
test('normal draw and ghost-expiry wire events never leak sealed rank, suit, Russian or physical ID',async()=>{
 const r=await fixture(),cards=r.game!.hands[0].filter(c=>r.game!.learning!.seals[c.id]?.locked),view=sessionSnapshot(r,0)!.view;
 for(const c of cards){assert.ok(!view.hand.cards.some(x=>'id' in x&&x.id===c.id));assert.ok(!view.locked!.some(x=>x.id===c.id));}
 for(const type of ['cards_drawn','magic_expired'] as const){const event=sessionEvents([{type,player:0,cards}],0,r)[0];assert.equal(event.cards!.length,0);}
});
test('unlock during a blind attack reveals neither new face nor physical card through events',async()=>{
 const r=await fixture(),g=r.game!;g.attacker=0;g.effects.push({id:'monkey',kind:'monkey_prank',name:'Monkey',description:'',modifier:{},target:0,status:'pending',duration:{type:'event',event:'monkey-resolved',label:''}});refreshBlind(r,()=>.4);
 send(r,0,{type:'begin_unlock',cardRef:sealedCards(r.game!,0)[0].ref});const q=r.game!.learning!.attempts[0]!,next=send(r,0,{type:'answer_unlock',challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)});assert.ok(sessionSnapshot(r,0)!.view.hand.blind);assert.equal(sessionEvents(next.events,0,r).find(e=>e.type==='card_unlocked')!.cards,undefined);
});
test('legacy magic room gains learning state without redeal, and active text quiz migrates once',async()=>{
 const r=await fixture();delete r.game!.learning;const c=r.game!.magicPool!.find(c=>c.spell==='mirror')!;r.game!.hands[0].push(c);r.challenges!.attempts[0]={id:'old',player:0,cardId:c.id,phase:'question',quiz:{index:0,direction:'ru-ko',prompt:r.game!.dictionary![0].ru,correct:r.game!.dictionary![0].ko,options:r.game!.dictionary!.slice(0,4).map(w=>w.ko)}};const ids=r.game!.hands.map(h=>h.map(c=>c.id)),revision=r.gameRevision;assert.equal(migrateRoom(r,()=>.4),true);assert.deepEqual(r.game!.hands.map(h=>h.map(c=>c.id)),ids);assert.equal(r.gameRevision,revision);assert.equal(sessionSnapshot(r,0)!.challenge!.quiz!.mode,'listening');assert.equal(sessionSnapshot(r,0)!.challenge!.quiz!.prompt,'');assert.equal(migrateRoom(r,()=>.4),false);
});
