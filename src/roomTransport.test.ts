import test from 'node:test';
import assert from 'node:assert/strict';
import {postRoom,RoomTransportError,ROOM_REQUEST_TIMEOUT_MS} from './rooms/connection';
const url='https://worker.test/api/rooms';
const code=(expected:string)=>(error:unknown)=>{assert.ok(error instanceof RoomTransportError);assert.equal(error.code,expected);assert.ok(!error.message.includes('CANARY'));return true;};
test('fetch/CORS failures are explained without claiming a definite cause or exposing exception data',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch CANARY_SECRET');});
 await assert.rejects(postRoom(url,{}),error=>{code('network_unreachable')(error);assert.match((error as Error).message,/CORS/);return true;});
});
test('bounded request maps signal aborted without reason to timeout and never retries the POST',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0,signal:AbortSignal|undefined;
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>{calls++;signal=options.signal!;return new Promise((_,reject)=>signal!.addEventListener('abort',()=>reject(new Error('signal aborted without reason CANARY')),{once:true}));});
 const rejected=assert.rejects(postRoom(url,{}),code('request_timeout'));t.mock.timers.tick(ROOM_REQUEST_TIMEOUT_MS);await rejected;assert.equal(calls,1);assert.equal(signal!.aborted,true);
});
test('timeout also covers reading the response body after headers arrived',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let began!:()=>void;const bodyStarted=new Promise<void>(resolve=>began=resolve);
 t.mock.method(globalThis,'fetch',async(_url:unknown,options:RequestInit)=>({json(){began();return new Promise((_,reject)=>options.signal!.addEventListener('abort',()=>reject(new Error('CANARY aborted')),{once:true}));}}));
 const rejected=assert.rejects(postRoom(url,{}),code('request_timeout'));await bodyStarted;t.mock.timers.tick(ROOM_REQUEST_TIMEOUT_MS);await rejected;
});
test('HTML or malformed JSON is an invalid response, while structured server rejection stays intact',async t=>{
 const fetch=t.mock.method(globalThis,'fetch',async()=>new Response('<html>CANARY</html>',{status:502}));await assert.rejects(postRoom(url,{}),code('invalid_response'));
 fetch.mock.mockImplementation(async()=>Response.json({error:'origin_forbidden'},{status:403}));const result=await postRoom(url,{});assert.equal(result.response.status,403);assert.deepEqual(result.value,{error:'origin_forbidden'});
});
test('successful POST keeps wire options, omits cookies and clears its timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let options:RequestInit|undefined;
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{options=init;return Response.json({ok:true});});
 const result=await postRoom(url,{name:'Гость'});assert.deepEqual(result.value,{ok:true});assert.equal(options!.method,'POST');assert.equal(options!.credentials,'omit');assert.deepEqual(options!.headers,{'Content-Type':'application/json'});assert.equal(options!.body,JSON.stringify({name:'Гость'}));t.mock.timers.tick(ROOM_REQUEST_TIMEOUT_MS);assert.equal(options!.signal!.aborted,false);
});
