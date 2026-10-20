import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withBase,withoutBase} from './hosting';
test('hosting paths round-trip root and project Pages URLs including room IDs',()=>{
 const id='a'.repeat(43);
 for(const base of ['/','/korean-card-game/'])for(const path of ['/','/singleplayer','/multiplayer',`/room/${id}`]){
  assert.equal(withoutBase(withBase(path,base),base),path);
  assert.equal(withoutBase(withBase(path,base)+'/',base),path);
 }
 assert.equal(withoutBase('/korean-card-game','/korean-card-game/'),'/');
 assert.equal(withoutBase('/korean-card-game-other/room/a','/korean-card-game/'),'/');
 assert.throws(()=>withBase('//other.example/room/a','/korean-card-game/'));
});
