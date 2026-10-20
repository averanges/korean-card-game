import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForRoomServer,WAKE_TIMEOUT_MS,RoomReadinessError} from './rooms/readiness';
const url='https://test.onrender.com';
test('ready health is credential-free, reports real stages and does not call room POST',async t=>{
 const stages:string[]=[];let options:RequestInit|undefined,calls=0;
 t.mock.method(globalThis,'fetch',async(u:string,o:RequestInit)=>{calls++;assert.equal(u,url+'/health');options=o;return Response.json({ok:true,service:'hangul-durak-render-probe'});});
 await waitForRoomServer(url,s=>stages.push(s));assert.equal(calls,1);assert.equal(options!.credentials,'omit');assert.equal(options!.cache,'no-store');assert.match(stages[0],/0 с/);assert.equal(stages.at(-1),'HTTP: сервер готов.');assert.ok(stages.every(s=>!s.includes('%')));
});
test('existing Cloudflare path has no added health dependency',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('must not fetch');});await waitForRoomServer('https://old.workers.dev');
});
test('cold-start timeout aborts GET after 90s, with no automatic room creation',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});let began!:()=>void;const started=new Promise<void>(r=>began=r);
 t.mock.method(globalThis,'fetch',async(_u:unknown,o:RequestInit)=>{began();return new Promise((_,reject)=>o.signal!.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));});
 const pending=assert.rejects(waitForRoomServer(url),e=>e instanceof RoomReadinessError&&e.code==='health_timeout');await started;t.mock.timers.tick(WAKE_TIMEOUT_MS);await pending;
});
test('HTTP refusal differs from WebSocket errors and cancellation is silent to caller',async t=>{
 const mocked=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:403}));await assert.rejects(waitForRoomServer(url),e=>e instanceof RoomReadinessError&&e.code==='health_http');
 const abort=new AbortController();abort.abort();await assert.rejects(waitForRoomServer(url,undefined,abort.signal),e=>e instanceof DOMException&&e.name==='AbortError');assert.equal(mocked.mock.callCount(),1);
});
test('temporary 503 is retried only as health GET, then becomes ready',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response(null,{status:503}):Response.json({ok:true,service:'hangul-durak-render-probe'}));await waitForRoomServer(url);assert.equal(calls,2);
});
