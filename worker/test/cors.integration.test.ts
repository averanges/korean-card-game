import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import ts from 'typescript';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runtimeModules} from './runtime';
import {randomSecret} from '../src/model';
const github='https://averanges.github.io',netlify='https://hangul-durak.netlify.app';
async function runtime(){
 const config=ts.parseConfigFileTextToJson('wrangler.jsonc',await readFile('wrangler.jsonc','utf8'));assert.equal(config.error,undefined);
 const vars=config.config.vars,allowed=vars.ALLOWED_ORIGINS.split(',').map((s:string)=>s.trim());
 for(const origin of [github,netlify,'https://korean-card-game-multiplayer.pages.dev','http://localhost:5173','http://127.0.0.1:5173'])assert.ok(allowed.includes(origin),origin);
 assert.ok(!allowed.includes('*'));assert.ok(!allowed.includes(github+'/korean-card-game/'));
 const mf=new Miniflare({...convertV4MiniflareOptions({name:'cors-test',modules:await runtimeModules(),modulesRoot:resolve('..'),compatibilityDate:'2026-10-01',cf:false,durableObjects:{ROOMS:{className:'Room',useSQLite:true}},bindings:vars}),telemetry:{enabled:false}});
 return {mf,allowed};
}
test('configured origins retain existing hosts; preflight permits exact GitHub origin and rejects lookalikes/paths/null',async()=>{
 const {mf,allowed}=await runtime();try{
  for(const origin of allowed){const r=await mf.dispatchFetch('https://worker.test/api/rooms',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.match(r.headers.get('Access-Control-Allow-Methods')!,/POST/);assert.match(r.headers.get('Access-Control-Allow-Headers')!,/content-type/i);assert.equal(r.headers.get('Vary'),'Origin');}
  for(const origin of [github+'/korean-card-game/','https://averanges.github.io.evil.test','https://someone-else.github.io','https://hangul-durak.netlify.app.evil.test','null','']){
   const r=await mf.dispatchFetch('https://worker.test/api/rooms',{method:'OPTIONS',headers:origin?{Origin:origin}:{}});assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
  }
 }finally{await mf.dispose();}
});
test('actual create/join/recover POSTs and server errors expose proper CORS without changing room authorization',async()=>{
 const {mf}=await runtime();
 const post=async(path:string,value:unknown,origin=github)=>{const r=await mf.dispatchFetch('https://worker.test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.headers.get('Vary'),'Origin');return r;};
 try{
  const created=await post('/api/rooms',{name:'CORS host',joinKey:randomSecret()});assert.equal(created.status,201);const host=await created.json() as any;
  const guestKey=randomSecret(),joined=await post(`/api/rooms/${host.roomId}/join`,{name:'CORS guest',joinKey:guestKey},netlify);assert.equal(joined.status,200);const guest=await joined.json() as any;assert.equal(guest.seat,1);
  const repeated=await post(`/api/rooms/${host.roomId}/join`,{name:'CORS guest',joinKey:guestKey},'https://korean-card-game-multiplayer.pages.dev');assert.deepEqual(await repeated.json(),guest);
  assert.equal((await post(`/api/rooms/${host.roomId}/join`,{name:'Third',joinKey:randomSecret()})).status,409);
  const restored=await post(`/api/rooms/${host.roomId}/recover`,{secret:host.recoverySecret});assert.equal(restored.status,200);assert.equal((await restored.json() as any).seat,0);
  assert.equal((await post(`/api/rooms/${host.roomId}/recover`,{secret:randomSecret()})).status,401);
  assert.equal((await post('/api/rooms',{name:'bad',joinKey:'bad'})).status,400);
  assert.equal((await post('/api/rooms/not-valid/join',{name:'A',joinKey:randomSecret()})).status,404);
  const denied=await mf.dispatchFetch('https://worker.test/api/rooms',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({name:'Denied',joinKey:randomSecret()})});assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
 }finally{await mf.dispose();}
});
test('GitHub origin can upgrade WebSocket but still needs a valid recovery secret',async()=>{
 const {mf}=await runtime();const sockets:any[]=[];
 try{
  const r=await mf.dispatchFetch('https://worker.test/api/rooms',{method:'POST',headers:{Origin:github,'Content-Type':'application/json'},body:JSON.stringify({name:'WS host',joinKey:randomSecret()})}),host=await r.json() as any;
  assert.equal((await mf.dispatchFetch(`https://worker.test/api/rooms/${host.roomId}/ws`,{headers:{Origin:'https://evil.test',Upgrade:'websocket'}})).status,403);
  for(const valid of [true,false]){
   const response=await mf.dispatchFetch(`https://worker.test/api/rooms/${host.roomId}/ws`,{headers:{Origin:github,Upgrade:'websocket'}});assert.equal(response.status,101);const ws=response.webSocket!;sockets.push(ws);ws.accept();
   const message=new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Authentication response timeout')),4000);ws.addEventListener('message',(event:any)=>{clearTimeout(timeout);resolve(JSON.parse(event.data));},{once:true});});
   ws.send(JSON.stringify({v:1,type:'authenticate',secret:valid?host.recoverySecret:randomSecret()}));const value=await message;
   if(valid){assert.ok(['room_snapshot','player_reconnected','room_ready'].includes(value.type));assert.equal(value.self,0);assert.ok(value.room);assert.ok(!JSON.stringify(value).includes(host.recoverySecret));}else{assert.equal(value.type,'error');assert.equal(value.code,'unauthorized');}
  }
 }finally{for(const ws of sockets)try{ws.close(1000,'test complete');}catch{}await mf.dispose();}
});
