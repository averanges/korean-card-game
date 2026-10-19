import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,beats,type Card} from '../../src/engine';
import {createRoom,randomSecret,type StoredRoom} from '../src/model';
import {applyCommand,sessionSnapshot,sessionEvents} from '../src/gameSession';
import {refreshBlind,migrateRoom} from '../src/magicSession';
import {learningSettings,sealedCards} from '../../src/learning';
import {resolveBlindReference} from '../../src/game-core/projection';
import {restoreProjection} from '../src/magicSession';
import type {NetworkCommand,Seat} from '../../src/rooms/protocol';
const policy={waitingMs:4000,roomMs:24000,retentionMs:1000};
const card=(id:string,rank:number,suit=0):Card=>({id,rank,suit,word:{ko:id,ru:id}});
async function fixture(p:Seat=0) {const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,policy);room.gameMode='magic';room.game=createGame(()=>.4);room.game.attacker=p;room.gameRevision=1;migrateRoom(room,()=>.4);return room;}
function give(r:StoredRoom,p:Seat,spell:string){const i=r.game!.magicPool!.findIndex(c=>c.spell===spell);assert.ok(i>=0);const c=r.game!.magicPool!.splice(i,1)[0];r.game!.hands[p].push(c);return c.id;}
function send(r:StoredRoom,p:Seat,intent:object,random=()=>.4){const next=applyCommand(r,p,{...intent,requestId:randomSecret(),expectedRevision:r.gameRevision} as NetworkCommand,random);if(next.result.ok)Object.assign(r,next.state);return next;}
function open(r:StoredRoom,p:Seat,id:string){const next=send(r,p,{type:'begin_magic',magicRef:id});assert.ok(next.result.ok,next.result.code);return r.challenges!.attempts[p]!;}
function answer(r:StoredRoom,p:Seat,correct=true){const c=r.challenges!.attempts[p]!;const option=c.quiz.options.findIndex(o=>correct?o===c.quiz.correct:o!==c.quiz.correct);return send(r,p,{type:'answer_quiz',challengeId:c.id,option});}
test('new magic deal keeps 36 ordinary cards, 11 physical extras; refill seals normals; only unlocking can exhaust the finite reward pool',async()=>{
 const r=await fixture();assert.deepEqual(r.game!.hands.map(h=>h.length),[6,6]);assert.equal(r.game!.magicPool!.length,11);
 const initial=r.game!.magicPool!.map(c=>c.id);assert.equal(new Set(initial).size,11);assert.equal(learningSettings.MAGIC_REWARD_CHANCE,.25);
 // Repeated real engine refills can exhaust the physical pool, never exceed it.
 for(let round=0;round<12;round++){
  r.game!.attacker=0;r.game!.table=[{attack:card('attack-'+round,0),defense:card('defense-'+round,1)}];
  for(const p of [0,1] as const){const ordinary=r.game!.hands[p].filter(c=>!c.spell);r.game!.hands[p]=r.game!.hands[p].filter(c=>c.spell);r.game!.deck.push(...ordinary);}
  const next=send(r,0,{type:'end'},()=>0);assert.ok(next.result.ok);for(const p of [0,1] as const)for(const seal of sealedCards(r.game!,p)){assert.ok(send(r,p,{type:'begin_unlock',cardRef:seal.ref},()=>0).result.ok);const q=r.game!.learning!.attempts[p]!;assert.ok(send(r,p,{type:'answer_unlock',challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)},()=>0).result.ok);}
 }
 const awarded=r.game!.hands.flat().filter(c=>c.spell).map(c=>c.id);assert.equal(awarded.length,11);assert.equal(new Set(awarded).size,11);assert.deepEqual([...awarded].sort(),initial.sort());assert.equal(r.game!.magicPool!.length,0);
});
test('both seats: begin is free, cancel preserves card, wrong answer burns exactly once, quiz JSON is private',async()=>{
 for(const p of [0,1] as const){const r=await fixture(p),id=give(r,p,'mirror'),hand=r.game!.hands[p].length;
  const attempt=open(r,p,id);assert.equal(r.game!.hands[p].length,hand);
  const pub=sessionSnapshot(r,p)!,other=sessionSnapshot(r,(1-p) as Seat)!;
  assert.equal(pub.challenge!.quiz!.options.length,4);assert.equal(other.challenge,undefined);
  assert.doesNotMatch(JSON.stringify(pub),/"(?:correct|index|dictionary|usedIds|lockedCardId|references)"/);
  assert.equal(send(r,p,{type:'begin_magic',magicRef:id}).result.code,'challenge_pending');
  assert.equal(send(r,p,{type:'attack',cardRefs:[r.game!.hands[p][0].id]}).result.code,'challenge_pending');
  assert.ok(send(r,p,{type:'cancel_quiz',challengeId:attempt.id}).result.ok);assert.ok(r.game!.hands[p].some(c=>c.id===id));
  const next=open(r,p,id);assert.notEqual(next.id,attempt.id);assert.ok(r.challenges!.usedIds.includes(attempt.id));
  for(let i=0;i<2;i++){assert.ok(answer(r,p,false).result.ok);assert.ok(r.game!.hands[p].some(c=>c.id===id));assert.equal(sessionSnapshot(r,p)!.challenge!.attemptsLeft,2-i);}assert.ok(answer(r,p,false).result.ok);assert.ok(!r.game!.hands[p].some(c=>c.id===id));assert.ok(!r.game!.inverted);
  assert.equal(send(r,p,{type:'answer_quiz',challengeId:next.id,option:0}).result.code,'invalid_challenge');
 }
});
test('phase gate rejects waiting defender and fully covered defender, permits genuine defense',async()=>{
 const r=await fixture(0),id=give(r,1,'mirror');assert.equal(send(r,1,{type:'begin_magic',magicRef:id}).result.code,'magic_unavailable');
 r.game!.table=[{attack:card('a',0)}];assert.ok(send(r,1,{type:'begin_magic',magicRef:id}).result.ok);
 const pending=r.challenges!.attempts[1]!;send(r,1,{type:'cancel_quiz',challengeId:pending.id});r.game!.table[0].defense=card('d',1);
 assert.equal(send(r,1,{type:'begin_magic',magicRef:id}).result.code,'magic_unavailable');
});
test('Mirror is permanent; Chance returns only discard; Gift draws privately to the other seat',async()=>{
 for(const p of [0,1] as const){
  const mirror=await fixture(p);open(mirror,p,give(mirror,p,'mirror'));assert.ok(answer(mirror,p).result.ok);assert.equal(mirror.game!.inverted,true);assert.equal(mirror.game!.effects[0].duration.type,'permanent');
  const chance=await fixture(p);chance.game!.discard=chance.game!.deck.splice(0,4);const count=chance.game!.deck.length;const hands=chance.game!.hands.map(h=>h.filter(c=>!c.spell).map(c=>c.id));open(chance,p,give(chance,p,'chance'));answer(chance,p);assert.equal(chance.game!.deck.length,count+4);assert.equal(chance.game!.discard.length,0);assert.deepEqual(chance.game!.hands.map(h=>h.filter(c=>!c.spell).map(c=>c.id)),hands);
  const gift=await fixture(p),other=(1-p) as Seat;const size=gift.game!.hands[other].length,top=gift.game!.deck.at(-1)!.id;open(gift,p,give(gift,p,'trick_gift'));const next=answer(gift,p);assert.equal(gift.game!.hands[other].length,size+1);assert.ok(gift.game!.hands[other].some(c=>c.id===top));
  const caster=sessionEvents(next.events,p,gift).find(e=>e.type==='cards_drawn')!,recipient=sessionEvents(next.events,other,gift).find(e=>e.type==='cards_drawn')!;assert.equal(caster.cards,undefined);assert.equal(recipient.cards![0].id,top);
 }
});
test('Fate and Hat persist target phase; invalid target can be retried without another quiz',async()=>{
 for(const p of [0,1] as const){const fate=await fixture(p),id=give(fate,p,'fate');const c=open(fate,p,id);answer(fate,p);assert.equal(fate.challenges!.attempts[p]!.phase,'target');assert.ok(fate.game!.hands[p].some(c=>c.id===id));
  assert.equal(send(fate,p,{type:'cancel_quiz',challengeId:c.id}).result.code,'answer_committed');
  assert.equal(send(fate,p,{type:'choose_trump',challengeId:c.id,trump:fate.game!.trump}).result.code,'invalid_target');const trump=(fate.game!.trump+1)%4;
  assert.ok(send(fate,p,{type:'choose_trump',challengeId:c.id,trump}).result.ok);assert.equal(fate.game!.trump,trump);assert.equal(send(fate,p,{type:'choose_trump',challengeId:c.id,trump}).result.code,'invalid_challenge');
  const hat=await fixture(p);hat.game!.inverted=true;const h=open(hat,p,give(hat,p,'magicians_hat'));answer(hat,p);const pub=sessionSnapshot(hat,p)!.challenge!;assert.equal(pub.target!.kind,'hat');
  const target=pub.target!.kind==='hat'?pub.target!.cardRefs[0]:'';const old=hat.game!.hands[p].find(c=>c.id===target)!,deck=new Set(hat.game!.deck.map(c=>c.id));
  assert.equal(send(hat,p,{type:'choose_hat_card',challengeId:h.id,cardRef:'foreign'}).result.code,'invalid_target');
  const next=send(hat,p,{type:'choose_hat_card',challengeId:h.id,cardRef:target});assert.ok(next.result.ok);const exchange=next.events[0].exchange!;assert.ok(deck.has(exchange.newCard.id));assert.ok(exchange.newCard.rank>old.rank);assert.ok(hat.game!.discard.some(c=>c.id===old.id));assert.equal(sessionEvents(next.events,(1-p) as Seat,hat)[0].exchange!.newCard,undefined);
 }
});
test('Ghost blocks privately, expires by existing round policy; Monkey uses persisted opaque shuffled refs',async()=>{
 const ghost=await fixture(),id=give(ghost,0,'ghost_thief');open(ghost,0,id);answer(ghost,0);const lock=ghost.game!.effects.find(e=>e.kind==='ghost_thief')!;assert.ok(lock.lockedCardId);assert.equal(sessionSnapshot(ghost,1)!.view.blockedCount,1);assert.ok(!JSON.stringify(sessionSnapshot(ghost,0)).includes(JSON.stringify(lock.lockedCardId)));
 ghost.game!.table=[{attack:card('a',0),defense:card('d',1)}];const ended=send(ghost,0,{type:'end'});assert.ok(ended.result.ok);assert.equal(ghost.game!.effects.some(e=>e.kind==='ghost_thief'),false);assert.equal(sessionSnapshot(ghost,1)!.view.blockedCount,0);
 const r=await fixture();r.game!.deck=[];r.game!.hands=[[card('a',0),card('c',2)],[card('b',1),card('d',3)]];open(r,0,give(r,0,'monkey_prank'));answer(r,0);
 send(r,0,{type:'attack',cardRefs:['a']});send(r,1,{type:'defend',cardRef:'b',target:0});send(r,0,{type:'end'});
 const view=sessionSnapshot(r,1)!;assert.ok(view.view.hand.blind);const ref=view.allowed.attack[0];assert.ok(ref&&ref!=='d');assert.equal(send(r,1,{type:'attack',cardRefs:['d']}).result.code,'invalid_blind_reference');
 const serialized=JSON.parse(JSON.stringify(r));assert.deepEqual(sessionSnapshot(serialized,1),view);assert.equal(resolveBlindReference(r.game!,1,ref,restoreProjection(r)),'d');
 const hands=JSON.stringify(r.game!.hands);refreshBlind(r,()=>.8);assert.equal(JSON.stringify(r.game!.hands),hands);assert.equal(sessionSnapshot(r,1)!.allowed.attack[0],ref);
 r.game!.hands[1].push(card('new',4));refreshBlind(r,()=>.2);assert.equal(resolveBlindReference(r.game!,1,ref,restoreProjection(r)),undefined);
 const nextRef=sessionSnapshot(r,1)!.allowed.attack[0];assert.ok(send(r,1,{type:'attack',cardRefs:[nextRef]}).result.ok);assert.equal(sessionSnapshot(r,1)!.allowed.attack.length,0);assert.equal(send(r,1,{type:'attack',cardRefs:['new']}).result.ok,false);
});
test('opponent continues while question is open; lost availability preserves the magic card',async()=>{
 const r=await fixture();r.game!.table=[{attack:card('a',0)}];r.game!.hands[1]=[card('b',1)];const id=give(r,0,'ghost_thief');const c=open(r,0,id);
 assert.ok(send(r,1,{type:'defend',cardRef:'b',target:0}).result.ok);assert.equal(r.challenges!.attempts[0]!.phase,'resolved');
 assert.equal(r.challenges!.attempts[0]!.outcome,'unavailable');assert.ok(r.game!.hands[0].some(c=>c.id===id));assert.equal(send(r,0,{type:'answer_quiz',challengeId:c.id,option:0}).result.code,'invalid_challenge');
 const gift=await fixture();gift.game!.table=[{attack:card('table',0)}];gift.game!.deck=[card('last',4)];const own=give(gift,0,'trick_gift'),other=give(gift,1,'trick_gift');open(gift,0,own);open(gift,1,other);answer(gift,1);answer(gift,0);assert.equal(gift.challenges!.attempts[0]!.outcome,'unavailable');assert.ok(gift.game!.hands[0].some(c=>c.id===own));
});
