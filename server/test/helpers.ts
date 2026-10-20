import {once} from 'node:events';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createRoomsServer,type Config} from '../src/server';
import {randomSecret} from '../../worker/src/model';
import type {RoomCredential,GameSnapshot,Seat} from '../../src/rooms/protocol';
export const origin='https://averanges.github.io';
export async function runtime(t:any,overrides:Partial<Config>={}){
 const config:Config={origins:[origin,'http://127.0.0.1:5173'],frontendUrl:origin+'/korean-card-game',mode:'magic',ttl:{waitingMs:14400000,roomMs:86400000,retentionMs:1000},maxRooms:100,...overrides};
 const app=createRoomsServer(config);app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 const base=`http://127.0.0.1:${(app.server.address()as any).port}`;t.after(()=>app.close());
 async function post(path:string,value:unknown,requestOrigin=origin){const response=await fetch(base+path,{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(value)});return {response,value:await response.json()as any};}
 async function enter(path='',deck?:unknown){const r=await post('/api/rooms'+path,{name:path?'Guest':'Host',joinKey:randomSecret(),...(deck?{deck}:{})});assert.ok(r.response.ok);return r.value as RoomCredential&{inviteUrl:string};}
 async function connect(credential:RoomCredential){
  const ws=new WebSocket(base.replace('http:','ws:')+`/api/rooms/${credential.roomId}/ws`,{headers:{Origin:origin}});
  const messages:any[]=[],waiters:any[]=[];
  ws.on('error',()=>{});ws.on('message',data=>{if(data.toString()==='pong')return;const value=JSON.parse(data.toString());const i=waiters.findIndex(w=>w.predicate(value));if(i<0)messages.push(value);else{const[w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(value);}});
  const next=(predicate:(v:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const i=messages.findIndex(predicate);if(i>=0)return resolve(messages.splice(i,1)[0]);const waiter={predicate,resolve,timer:setTimeout(()=>reject(Error('network event timeout')),5000)};waiters.push(waiter);});
  await once(ws,'open');ws.send(JSON.stringify({v:1,type:'authenticate',secret:credential.recoverySecret}));const first=await next(v=>v.room);
  t.after(()=>{ws.terminate();for(const w of waiters)clearTimeout(w.timer);});return {ws,next,first};
 }
 return {app,base,post,enter,connect};
}
export type Client=Awaited<ReturnType<Awaited<ReturnType<typeof runtime>>['connect']>>;
export async function raw(c:Client,command:object){c.ws.send(JSON.stringify({v:1,type:'command',command}));return c.next(v=>v.type==='command_result'&&v.requestId===(command as any).requestId);}
export async function session(t:any,mode:'ordinary'|'magic'='magic',deck?:unknown){
 const r=await runtime(t,{mode}),host=await r.enter('',deck),guest=await r.enter(`/${host.roomId}/join`),credentials=[host,guest];
 const clients=[await r.connect(host),await r.connect(guest)];let revision=0;const snapshots:GameSnapshot[]=[];
 async function act(p:Seat,intent:object){const command={...intent,requestId:randomSecret(),expectedRevision:revision};const ack=await raw(clients[p],command);assert.ok(ack.ok,ack.code);revision=ack.revision;for(const s of [0,1]as const)snapshots[s]=(await clients[s].next(v=>v.game?.revision===revision)).game;return command;}
 async function reconnect(p:Seat){clients[p].ws.terminate();clients[p]=await r.connect(credentials[p]);if(clients[p].first.game)snapshots[p]=clients[p].first.game;}
 await act(0,{type:'start_game'});
 return {...r,credentials,clients,snapshots,act,reconnect,get revision(){return revision;}};
}
export function noPrivate(value:unknown){const forbidden=new Set(['hands','deck','discard','seed','secretHash','joinHash','connectionId','recoverySecret','dictionary','magicPool','references','orders','signatures','lockedCardId']);function walk(v:any){if(!v||typeof v!=='object')return;for(const[k,c]of Object.entries(v)){assert.ok(!forbidden.has(k),'private state leaked');walk(c);}}walk(value);}
