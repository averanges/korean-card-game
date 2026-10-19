import test from 'node:test';
import assert from 'node:assert/strict';
import {roomEntryPayload,RoomAccessError} from './rooms/connection';
import {basicDeck} from './decks';
test('room creation sends only the validated deck schema; joins retain the legacy minimal payload',()=>{
 const proof='x'.repeat(43),payload=roomEntryPayload(' Гость ',proof,undefined,basicDeck);
 assert.deepEqual(Object.keys(payload).sort(),['deck','joinKey','name']);assert.equal(payload.name,'Гость');
 assert.deepEqual(Object.keys(payload.deck!).sort(),['name','words']);assert.ok(payload.deck!.words.every(w=>Object.keys(w).sort().join(',')==='ko,ru'));assert.equal(payload.deck!.words.length,36);
 assert.deepEqual(roomEntryPayload('Гость',proof,'room',basicDeck),{name:'Гость',joinKey:proof});
 assert.throws(()=>roomEntryPayload('Гость',proof,undefined,{name:'Мало слов',words:basicDeck.words.slice(0,8)}),/минимум 9/);
});
test('invalid-body creation errors explain incompatible versions without silently replacing the deck',()=>{
 const error=new RoomAccessError('invalid_body','create');assert.equal(error.code,'invalid_body');assert.match(error.message,/Cloudflare Worker/);assert.match(error.message,/разных версий/);
 assert.match(new RoomAccessError('body_too_large').message,/размер/);assert.match(new RoomAccessError('invalid_deck').message,/9 до 200/);
});
