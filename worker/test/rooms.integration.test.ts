import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
// Wrangler includes Miniflare. This suite runs the real Durable Object/WebSocket runtime.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {randomSecret} from '../src/model';
import {runtimeModules} from './runtime';
const origin='http://localhost:5173';
const root=process.cwd();
async function modules() {
 return runtimeModules();
}
function inbox(ws:any) {
 const messages:any[]=[],waiters:Array<{predicate:(x:any)=>boolean;resolve:(x:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>=[];
 ws.addEventListener('message',(event:any)=>{let value;try{value=JSON.parse(event.data);}catch{return;}const i=waiters.findIndex(w=>w.predicate(value));if(i>=0){const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(value);}else messages.push(value);});
 return (predicate:(x:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const i=messages.findIndex(predicate);if(i>=0){resolve(messages.splice(i,1)[0]);return;}const w={predicate,resolve,reject,timer:setTimeout(()=>{const i=waiters.indexOf(w);if(i>=0)waiters.splice(i,1);reject(new Error('WebSocket event timeout'));},5000)};waiters.push(w);});
}
test('real rooms: create, join, auth, two tabs, disconnect, restore and storage restart',async()=>{
 const persist=await mkdtemp(join(tmpdir(),'hangul-rooms-'));
 const options={...convertV4MiniflareOptions({name:'rooms-test',modules:await modules(),modulesRoot:join(root,'..'),compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'Room',useSQLite:true}},durableObjectsPersist:persist,cf:false,bindings:{FRONTEND_ORIGIN:origin,ALLOWED_ORIGINS:origin,WAITING_TTL_SECONDS:'14400',ROOM_TTL_SECONDS:'86400',EXPIRED_RETENTION_SECONDS:'3600'}}),resourcePersistencePath:persist,telemetry:{enabled:false}};
 let mf=new Miniflare(options);
 const sockets:any[]=[];
 const post=(path:string,value:unknown,requestOrigin=origin)=>mf.dispatchFetch(`https://worker.test${path}`,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(value)});
 async function connect(id:string,secret:string) {const response=await mf.dispatchFetch(`https://worker.test/api/rooms/${id}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(response.status,101);const ws=response.webSocket!;const next=inbox(ws);ws.accept();sockets.push(ws);ws.send(JSON.stringify({v:1,type:'authenticate',secret}));return {ws,next};}
 try {
  assert.equal((await post('/api/rooms',{name:'A',joinKey:randomSecret()},'https://evil.test')).status,403);
  assert.equal((await post('/api/rooms',{name:'a'.repeat(3000),joinKey:randomSecret()})).status,413);
  const response=await post('/api/rooms',{name:'Учитель',joinKey:randomSecret()});assert.equal(response.status,201);
  const host=await response.json() as any;assert.equal(host.seat,0);assert.equal(host.inviteUrl,`${origin}/room/${host.roomId}`);assert.ok(!host.inviteUrl.includes(host.recoverySecret));
  const a=await connect(host.roomId,host.recoverySecret);const first=await a.next(x=>!!x.room);assert.equal(first.room.players[0].connected,true);
  const guestKey=randomSecret();const joined=await post(`/api/rooms/${host.roomId}/join`,{name:'Ученик',joinKey:guestKey});const guest=await joined.json() as any;assert.equal(guest.seat,1);
  const retry=await post(`/api/rooms/${host.roomId}/join`,{name:'Ученик',joinKey:guestKey});assert.deepEqual(await retry.json(),guest);
  assert.equal((await post(`/api/rooms/${host.roomId}/join`,{name:'Учитель',joinKey:randomSecret()})).status,409);
  const b=await connect(host.roomId,guest.recoverySecret);const ready=await b.next(x=>x.room?.status==='ready');assert.equal(ready.self,1);assert.equal(ready.room.players[0].name,'Учитель');
  const bad=await connect(host.roomId,randomSecret());assert.equal((await bad.next(x=>x.type==='error')).code,'unauthorized');
  b.ws.send(JSON.stringify({v:1,type:'attack',playerId:0}));assert.equal((await b.next(x=>x.type==='error')).code,'invalid_message');
  b.ws.send('x'.repeat(5000));assert.equal((await b.next(x=>x.type==='error')).code,'invalid_message');
  b.ws.send(JSON.stringify({v:1,type:'get_snapshot'}));assert.equal((await b.next(x=>x.type==='room_snapshot')).room.version,ready.room.version);
  await mf.unsafeEvictDurableObject('rooms-test','Room',{name:host.roomId,webSockets:'hibernate'});
  b.ws.send(JSON.stringify({v:1,type:'get_snapshot'}));const waking=await b.next(x=>x.type==='room_snapshot');
  assert.equal(waking.room.status,'ready');assert.equal(waking.room.version,ready.room.version);
  const oldClosed=new Promise<number>(resolve=>a.ws.addEventListener('close',(e:any)=>resolve(e.code)));
  const replacement=await connect(host.roomId,host.recoverySecret);await replacement.next(x=>x.room?.status==='ready');assert.equal(await oldClosed,4009);
  replacement.ws.close(1000,'refresh');await b.next(x=>x.type==='player_left');
  const restored=await connect(host.roomId,host.recoverySecret);assert.equal((await restored.next(x=>x.room?.status==='ready')).self,0);
  for(const ws of sockets)try{ws.close(1000,'restart');}catch{}
  // Wait until close callbacks persist presence, then terminate the runtime completely.
  await new Promise(resolve=>setTimeout(resolve,100));await mf.dispose();mf=new Miniflare(options);
  const afterRestart=await connect(host.roomId,host.recoverySecret);const snapshot=await afterRestart.next(x=>!!x.room);
  assert.equal(snapshot.room.players[1].name,'Ученик');assert.ok(snapshot.room.version>=ready.room.version);
  assert.equal(JSON.stringify(snapshot).includes('secretHash'),false);assert.equal(JSON.stringify(snapshot).includes(host.recoverySecret),false);
 } finally {for(const ws of sockets)try{ws.close(1000,'test_done');}catch{}await mf.dispose();await rm(persist,{recursive:true,force:true});}
});
