import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runtimeModules} from './runtime';
import {randomSecret,createRoom,publicRoom} from '../src/model';
import {applyCommand,sessionSnapshot} from '../src/gameSession';
import {migrateRoom} from '../src/magicSession';
import type {NetworkCommand} from '../../src/rooms/protocol';
import {createGame} from '../../src/engine';
const origin='https://game.example';
const dictionary=(n:number)=>({name:`Слова темы ${n}`,words:Array.from({length:n},(_,i)=>({ko:`새로운${i}`,ru:`новое слово ${i}`}))});
function inbox(ws:any){const messages:any[]=[],waiters:any[]=[];ws.addEventListener('message',(e:any)=>{if(e.data==='pong')return;const value=JSON.parse(e.data),i=waiters.findIndex(w=>w.predicate(value));if(i<0)messages.push(value);else{const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(value);}});return (predicate:(v:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const i=messages.findIndex(predicate);if(i>=0)return resolve(messages.splice(i,1)[0]);const w={predicate,resolve,timer:setTimeout(()=>{const i=waiters.indexOf(w);if(i>=0)waiters.splice(i,1);reject(Error('deck snapshot timeout'));},6000)};waiters.push(w);});}
test('custom dictionary: real DO validates create-only payload, shares cards safely, quizzes and restores unchanged',async()=>{
 const mf=new Miniflare({...convertV4MiniflareOptions({name:'deck-test',modules:await runtimeModules(false,true),modulesRoot:resolve('..'),cf:false,compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'Room',useSQLite:true}},bindings:{FRONTEND_ORIGIN:origin,ALLOWED_ORIGINS:origin,WAITING_TTL_SECONDS:'14400',ROOM_TTL_SECONDS:'86400',EXPIRED_RETENTION_SECONDS:'3600'}}),telemetry:{enabled:false}});
 const sockets:any[]=[],post=(path:string,value:unknown)=>mf.dispatchFetch(`https://worker.test/api/rooms${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});
 async function connect(c:any){const response=await mf.dispatchFetch(`https://worker.test/api/rooms/${c.roomId}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(response.status,101);const ws=response.webSocket!,next=inbox(ws);ws.accept();sockets.push(ws);ws.send(JSON.stringify({v:1,type:'authenticate',secret:c.recoverySecret}));return {ws,next};}
 try{
  for(const deck of [dictionary(8),dictionary(201),{...dictionary(9),words:[...dictionary(9).words,dictionary(9).words[0]]},{...dictionary(9),words:dictionary(9).words.map(w=>({...w,ru:'одинаково'}))},{...dictionary(9),cards:[]},{...dictionary(9),name:'x'.repeat(61)}])assert.equal((await post('',{name:'A',joinKey:randomSecret(),deck})).status,400);
  assert.equal((await post('',{name:'A',joinKey:randomSecret(),deck:dictionary(9),cards:[]})).status,400);
  assert.equal((await post('',{name:'A',joinKey:randomSecret(),deck:{...dictionary(9),name:'x'.repeat(140000)}})).status,413);
  // The larger budget belongs only to creation, not join or recovery.
  const deck=dictionary(70);assert.ok(new TextEncoder().encode(JSON.stringify(deck)).length>2048);
  const response=await post('',{name:'Создатель',joinKey:randomSecret(),deck});assert.equal(response.status,201);const host=await response.json() as any;
  const guest=await (await post(`/${host.roomId}/join`,{name:'Гость без локальной колоды',joinKey:randomSecret()})).json() as any;
  assert.equal((await post(`/${host.roomId}/join`,{name:'Гость',joinKey:randomSecret(),deck})).status,413);
  const a=await connect(host);await a.next(v=>v.room);const b=await connect(guest);const ready=await b.next(v=>v.room?.status==='ready');assert.deepEqual(ready.room.deck,{name:deck.name,wordCount:36,sourceCount:70});assert.equal(ready.room.wordDeck,undefined);
  let revision=0;const snapshots:any[]=[];
  async function act(player:0|1,intent:object){const client=player===0?a:b;client.ws.send(JSON.stringify({v:1,type:'command',command:{...intent,expectedRevision:revision,requestId:randomSecret()}}));const result=await client.next(v=>v.type==='command_result');assert.ok(result.ok,result.code);revision=result.revision;for(const [p,c] of [[0,a],[1,b]] as const)snapshots[p]=(await c.next(v=>v.game?.revision===revision)).game;}
  await act(0,{type:'start_game'});
  for(const p of [0,1]){assert.ok(snapshots[p].view.hand.cards.every((c:any)=>deck.words.some(w=>w.ko===c.word.ko&&w.ru===c.word.ru)));const peer=snapshots[1-p];for(const card of snapshots[p].view.hand.cards)assert.ok(!JSON.stringify(peer).includes(`"id":"${card.id}"`));}
  await act(0,{type:'attack',cardRefs:[snapshots[0].allowed.attack[0]]});assert.deepEqual(snapshots[0].view.table,snapshots[1].view.table);
  const spell=snapshots[0].view.magic.find((c:any)=>c.spell==='mirror');await act(0,{type:'begin_magic',magicRef:spell.id});
  const before=structuredClone(snapshots),quiz=snapshots[0].challenge.quiz;assert.equal(snapshots[1].challenge,undefined);
  const word=deck.words.find(w=>quiz.direction==='ko-ru'?w.ko===quiz.prompt:w.ru===quiz.prompt)!;assert.ok(word);assert.ok(quiz.options.every((o:string)=>deck.words.some(w=>o===w.ko||o===w.ru)));
  await mf.unsafeEvictDurableObject('deck-test','Room',{name:host.roomId,webSockets:'hibernate'});
  for(const [p,c] of [[0,a],[1,b]] as const){c.ws.send('{"v":1,"type":"get_snapshot"}');const restored=await c.next(v=>v.type==='room_snapshot'&&v.game?.revision===revision);assert.deepEqual(restored.game,before[p]);assert.equal(restored.room.deck.name,deck.name);}
  a.ws.send(JSON.stringify({v:1,type:'command',command:{type:'set_deck',deck,expectedRevision:revision,requestId:'forged'}}));assert.equal((await a.next(v=>v.type==='error')).code,'invalid_message');
  await act(0,{type:'answer_quiz',challengeId:snapshots[0].challenge.challengeId,option:quiz.options.indexOf(quiz.direction==='ko-ru'?word.ru:word.ko)});assert.ok(snapshots[0].view.inverted);assert.ok(snapshots[1].view.inverted);
 }finally{for(const ws of sockets)try{ws.close(1000,'done');}catch{}await mf.dispose();}
});
test('custom room snapshot is independent; existing schema-3 games keep cards, dictionary and revision',async()=>{
 const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,{waitingMs:10000,roomMs:10000,retentionMs:1000});room.gameMode='magic';room.wordDeck=dictionary(9);room.players[0]!.connectionId='a';room.players[1]={name:'B',secretHash:'',joinHash:'',connectionId:'b'};
 const c:NetworkCommand={type:'start_game',requestId:'start',expectedRevision:0};const next=applyCommand(room,0,c,()=>.4);assert.ok(next.result.ok);Object.assign(room,next.state);const serialized=JSON.parse(JSON.stringify(room)),before=sessionSnapshot(room,0);
 room.wordDeck!.words[0].ko='изменение исходника';assert.deepEqual(sessionSnapshot(room,0),before);assert.equal(publicRoom(serialized).deck!.wordCount,9);assert.equal(serialized.game.dictionary.length,9);
 const old={...serialized,wordDeck:undefined,game:createGame(()=>.4),schemaVersion:3 as const,gameRevision:19};const saved=JSON.stringify(old.game);assert.equal(migrateRoom(old,()=>.9),false);assert.equal(old.gameRevision,19);assert.equal(JSON.stringify(old.game),saved);
});
