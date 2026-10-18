import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runtimeModules} from './runtime';
import {randomSecret} from '../src/model';
const origin='https://game.example';
function inbox(ws:any){
 const messages:any[]=[],waiters:any[]=[];
 ws.addEventListener('message',(e:any)=>{if(e.data==='pong')return;const value=JSON.parse(e.data),i=waiters.findIndex(w=>w.predicate(value));if(i<0)messages.push(value);else{const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(value);}});
 return (predicate:(v:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const i=messages.findIndex(predicate);if(i>=0)return resolve(messages.splice(i,1)[0]);const w={predicate,resolve,timer:setTimeout(()=>{const i=waiters.indexOf(w);if(i>=0)waiters.splice(i,1);reject(Error('recovery snapshot timeout'));},5000)};waiters.push(w);});
}
test('manual recovery verifies existing secret, preserves game and quiz, replaces only the authenticated seat',async()=>{
 const mf=new Miniflare({...convertV4MiniflareOptions({name:'recovery-test',modules:await runtimeModules(false,true),modulesRoot:resolve('..'),cf:false,compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'Room',useSQLite:true}},bindings:{FRONTEND_ORIGIN:origin,ALLOWED_ORIGINS:origin,WAITING_TTL_SECONDS:'14400',ROOM_TTL_SECONDS:'86400',EXPIRED_RETENTION_SECONDS:'3600'}}),telemetry:{enabled:false}});
 const sockets:any[]=[];
 const post=(path:string,value:unknown,requestOrigin=origin)=>mf.dispatchFetch(`https://worker.test/api/rooms${path}`,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(value)});
 async function connect(id:string,secret:string){const response=await mf.dispatchFetch(`https://worker.test/api/rooms/${id}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(response.status,101);const ws=response.webSocket!,next=inbox(ws);ws.accept();sockets.push(ws);ws.send(JSON.stringify({v:1,type:'authenticate',secret}));return {ws,next};}
 try{
  const host=await (await post('',{name:'A',joinKey:randomSecret()})).json() as any;
  const guest=await (await post(`/${host.roomId}/join`,{name:'B',joinKey:randomSecret()})).json() as any;
  const a=await connect(host.roomId,host.recoverySecret);await a.next(v=>v.room);
  const b=await connect(host.roomId,guest.recoverySecret);await b.next(v=>v.room?.status==='ready');
  a.ws.send(JSON.stringify({v:1,type:'command',command:{type:'start_game',requestId:'start',expectedRevision:0}}));
  const initial=await a.next(v=>v.game?.revision===1),spell=initial.game.view.magic.find((c:any)=>c.spell==='mirror');
  a.ws.send(JSON.stringify({v:1,type:'command',command:{type:'begin_magic',magicRef:spell.id,requestId:'quiz',expectedRevision:1}}));
  const before=await a.next(v=>v.game?.revision===2);assert.equal(before.game.challenge.phase,'question');
  const path=`/${host.roomId}/recover`;
  assert.equal((await post(path,{name:'A'})).status,400);
  assert.equal((await post(path,{secret:host.roomId})).status,401); // An invitation is not proof of ownership.
  assert.equal((await post(path,{secret:randomSecret()})).status,401);
  assert.equal((await post(path,{secret:guest.recoverySecret,seat:0})).status,400);
  assert.equal((await post(path,{secret:host.recoverySecret},'https://evil.example')).status,403);
  assert.equal((await post(path,{secret:'x'.repeat(3000)})).status,413);
  assert.equal((await post(`/${host.roomId}/join`,{name:'A',joinKey:randomSecret()})).status,409);
  const response=await post(path,{secret:host.recoverySecret});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  const restored=await response.json() as any;assert.deepEqual(restored,{roomId:host.roomId,seat:0,recoverySecret:host.recoverySecret});
  const other=await (await post('',{name:'C',joinKey:randomSecret()})).json() as any;assert.equal((await post(path,{secret:other.recoverySecret})).status,401);
  // Merely checking a code cannot replace a socket or change the game/version.
  a.ws.send('{"v":1,"type":"get_snapshot"}');const unchanged=await a.next(v=>v.type==='room_snapshot'&&v.game?.revision===2);assert.equal(unchanged.room.version,before.room.version);assert.deepEqual(unchanged.game,before.game);
  const replaced=new Promise<number>(resolve=>a.ws.addEventListener('close',(e:any)=>resolve(e.code)));
  const fresh=await connect(restored.roomId,restored.recoverySecret),after=await fresh.next(v=>v.game?.revision===2);assert.equal(await replaced,4009);assert.equal(after.self,0);assert.deepEqual(after.game,before.game);
  b.ws.send('{"v":1,"type":"get_snapshot"}');const peer=await b.next(v=>v.type==='room_snapshot'&&v.game?.revision===2);assert.equal(peer.game.challenge,undefined);assert.ok(!JSON.stringify(peer).includes(host.recoverySecret));assert.ok(!JSON.stringify(peer).includes(guest.recoverySecret));
  // The other seat is still authenticated and owns only its own view.
  const guestResponse=await post(path,{secret:guest.recoverySecret});assert.equal((await guestResponse.json() as any).seat,1);
  const rateClosed=new Promise<number>(resolve=>fresh.ws.addEventListener('close',(e:any)=>resolve(e.code)));
  for(let i=0;i<31;i++)fresh.ws.send('{"v":1,"type":"get_snapshot"}');assert.equal(await rateClosed,1008);
  const afterLimit=await connect(host.roomId,host.recoverySecret);assert.deepEqual((await afterLimit.next(v=>v.game?.revision===2)).game,before.game);
  for(let i=0;i<4;i++){
   const pending=await mf.dispatchFetch(`https://worker.test/api/rooms/${host.roomId}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(pending.status,101);pending.webSocket!.accept();sockets.push(pending.webSocket!);
  }
  const excess=await mf.dispatchFetch(`https://worker.test/api/rooms/${host.roomId}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(excess.status,429);
 }finally{for(const ws of sockets)try{ws.close(1000,'done');}catch{}await mf.dispose();}
});
