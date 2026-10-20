import test from 'node:test';
import assert from 'node:assert/strict';
import {session,noPrivate,raw} from './helpers';
import {words} from '../../src/words';
import type {Seat} from '../../src/rooms/protocol';

test('all seven spells over real HTTP/WS, private questions, target reconnect, burn and blind references',{timeout:30000},async t=>{
 const s=await session(t,'magic',{name:'TEST_MAGIC_FIXTURE',words});let actions=0;
 async function act(p:Seat,intent:object){if(++actions%5===0){await s.reconnect(0);await s.reconnect(1);}const c=await s.act(p,intent);noPrivate(s.snapshots[0]);noPrivate(s.snapshots[1]);return c;}
 async function begin(p:Seat,spell:string){const card=s.snapshots[p].view.magic.find(c=>c.spell===spell);assert.ok(card,spell);await act(p,{type:'begin_magic',magicRef:card.id});assert.equal(s.snapshots[(1-p)as Seat].challenge?.quiz,undefined);assert.ok(!Object.hasOwn(s.snapshots[p].challenge!.quiz!,'correct'));return s.snapshots[p].challenge!.challengeId;}
 async function answer(p:Seat,correct=true){const q=s.snapshots[p].challenge!.quiz!,word=words.find(w=>q.direction==='ko-ru'?w.ko===(q.audioText||q.prompt):w.ru===q.prompt)!;assert.ok(word);const expected=q.direction==='ko-ru'?word.ru:word.ko;return act(p,{type:'answer_quiz',challengeId:s.snapshots[p].challenge!.challengeId,option:q.options.findIndex(o=>correct?o===expected:o!==expected)});}
 await begin(0,'mirror');const quiz=structuredClone(s.snapshots[0].challenge);await s.reconnect(0);assert.deepEqual(s.snapshots[0].challenge,quiz);
 const answered=await answer(0);assert.equal(s.snapshots[1].view.inverted,true);assert.ok((await raw(s.clients[0],answered)).ok);await s.clients[0].next(v=>v.game?.revision===s.revision);
 const count=s.snapshots[0].view.deckCount;await begin(0,'chance');await answer(0);assert.equal(s.snapshots[0].view.deckCount,count+2);
 const fate=await begin(0,'fate');await answer(0);await s.reconnect(0);assert.equal(s.snapshots[0].challenge!.phase,'target');const trump=(s.snapshots[0].view.trump+1)%4;await act(0,{type:'choose_trump',challengeId:fate,trump});assert.equal(s.snapshots[1].view.trump,trump);
 await begin(0,'ghost_thief');await answer(0);assert.equal(s.snapshots[1].view.blockedCount,1);
 const enemy=s.snapshots[0].view.opponent.ordinaryCount;await begin(0,'trick_gift');await answer(0);assert.equal(s.snapshots[0].view.opponent.ordinaryCount,enemy+1);
 const hat=await begin(0,'magicians_hat');await answer(0);await s.reconnect(0);const target=s.snapshots[0].challenge!.target!;assert.equal(target.kind,'hat');if(target.kind==='hat')await act(0,{type:'choose_hat_card',challengeId:hat,cardRef:target.cardRefs[0]});
 await begin(0,'monkey_prank');await answer(0);
 // End a genuinely defended round to activate the existing blind-hand effect.
 const a=s.snapshots[0],d=s.snapshots[1];const pair=a.allowed.attack.flatMap(id=>{const c=a.view.hand.cards.find(c=>'id'in c&&c.id===id);if(!c||!('id'in c))return [];return d.view.hand.cards.filter(v=>'id'in v&&(v.suit===c.suit?v.rank<c.rank:v.suit===a.view.trump&&c.suit!==v.suit)).map(v=>({a:c,d:v}));})[0];assert.ok(pair);
 await act(0,{type:'attack',cardRefs:[pair.a.id]});assert.ok('id'in pair.d);await act(1,{type:'defend',cardRef:pair.d.id,target:0});await act(0,{type:'end'});
 assert.equal(s.snapshots[1].view.hand.blind,true);const opaque=s.snapshots[1].allowed.attack.slice();await s.reconnect(1);assert.deepEqual(s.snapshots[1].allowed.attack,opaque);assert.ok(s.snapshots[1].view.hand.cards.every(c=>'hidden'in c));
 await act(1,{type:'attack',cardRefs:[opaque[0]]});
 // A wrong answer uses the original three-attempt burn policy, including reconnect mid-question.
 await begin(1,'trick_gift');await answer(1,false);assert.equal(s.snapshots[1].challenge!.attemptsLeft,2);await s.reconnect(1);assert.equal(s.snapshots[1].challenge!.attemptsLeft,2);await answer(1,false);await answer(1,false);assert.equal(s.snapshots[1].challenge!.outcome,'wrong');assert.equal(s.snapshots[1].view.magic.some(c=>c.spell==='trick_gift'),false);
});
