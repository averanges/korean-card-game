import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticate,createRoom,displayName,joinRoom,publicRoom,randomSecret,RoomError,touch} from '../src/model';
import {parseRoomMessage,ROOM_ID} from '../../src/rooms/protocol';
const policy={waitingMs:4000,roomMs:24000,retentionMs:1000};

test('unpredictable room and recovery IDs; host credential survives serialized storage',async()=>{
 const id=randomSecret(),proof=randomSecret();assert.match(id,ROOM_ID);assert.notEqual(id,randomSecret());
 const {room,credential}=await createRoom(id,'Хозяин',proof,100,policy);
 assert.equal(credential.seat,0);assert.notEqual(credential.recoverySecret,proof);
 assert.equal(await authenticate(JSON.parse(JSON.stringify(room)),credential.recoverySecret),0);
 assert.equal(await authenticate(room,randomSecret()),undefined);
 assert.equal(publicRoom(room).status,'waiting');
});
test('two places, retry-safe join, third rejected; names and invite are not credentials',async()=>{
 const {room,credential}=await createRoom(randomSecret(),'Учитель',randomSecret(),100,policy);
 const proof=randomSecret(),guest=await joinRoom(room,'Ученик',proof,200,policy),version=room.version;
 assert.equal(guest.seat,1);assert.equal(await authenticate(room,guest.recoverySecret),1);
 assert.notEqual(guest.recoverySecret,credential.recoverySecret);
 assert.deepEqual(await joinRoom(room,'Другое имя',proof,300,policy),guest);assert.equal(room.version,version);
 await assert.rejects(joinRoom(room,'Учитель',randomSecret(),300,policy),(e:unknown)=>e instanceof RoomError&&e.code==='room_full');
 assert.equal(await authenticate(room,'Учитель'),undefined);assert.equal(await authenticate(room,room.roomId),undefined);
});
test('public snapshot is an allowlist without recovery or join material',async()=>{
 const {room,credential}=await createRoom(randomSecret(),'Игрок',randomSecret(),100,policy);
 room.players[0]!.connectionId='private-connection';
 const snapshot=JSON.stringify(publicRoom(room));
 for(const value of [room.seed,room.players[0]!.secretHash,room.players[0]!.joinHash,credential.recoverySecret,'private-connection'])assert.ok(!snapshot.includes(value));
 assert.deepEqual(Object.keys(publicRoom(room).players[0]!).sort(),['connected','name']);
});
test('ready requires both sockets; expiry retains reserved places until TTL',async()=>{
 const {room}=await createRoom(randomSecret(),'Один',randomSecret(),100,policy);
 await joinRoom(room,'Два',randomSecret(),200,policy);
 assert.equal(room.expiresAt,24200);room.players[0]!.connectionId='a';assert.equal(publicRoom(room).status,'waiting');
 room.players[1]!.connectionId='b';assert.equal(publicRoom(room).status,'ready');
 room.players[0]!.connectionId=null;touch(room,300,policy);assert.equal(publicRoom(room).status,'waiting');assert.ok(room.players[0]);
 await assert.rejects(joinRoom(room,'Три',randomSecret(),24300,policy),(e:unknown)=>e instanceof RoomError&&e.code==='room_expired');
});
test('runtime messages reject injected playerId, unknown commands and malformed input',()=>{
 const secret=randomSecret();assert.deepEqual(parseRoomMessage(JSON.stringify({v:1,type:'authenticate',secret})),{v:1,type:'authenticate',secret});
 for(const value of ['null','{}','bad','[]',JSON.stringify({v:2,type:'get_snapshot'}),JSON.stringify({v:1,type:'attack',cardId:'a'}),JSON.stringify({v:1,type:'get_snapshot',playerId:1}),JSON.stringify({v:1,type:'authenticate',secret,playerId:1})])assert.equal(parseRoomMessage(value),undefined);
 assert.deepEqual(parseRoomMessage('{"v":1,"type":"get_snapshot"}'),{v:1,type:'get_snapshot'});
});
test('display names normalize Unicode and reject controls and oversized names',()=>{
 assert.equal(displayName('  Игрок  '),'Игрок');for(const name of ['', 'a'.repeat(33),'Имя\nФамилия','a\u200bb'])assert.throws(()=>displayName(name));
});
