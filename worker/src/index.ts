import {DurableObject} from 'cloudflare:workers';
import {ROOM_ID,SECRET,record,parseRoomMessage,type Seat,type RoomEventType} from '../../src/rooms/protocol';
import {authenticate,createRoom,displayName,joinRoom,publicRoom,randomSecret,RoomError,touch,type Policy,type StoredRoom} from './model';
import {applyCommand,sessionSnapshot,sessionEvents,serverRandom} from './gameSession';
import {migrateRoom} from './magicSession';
import type {DomainEvent} from '../../src/game-core/types';
import type {CommandResult,NetworkCommand} from '../../src/rooms/protocol';
import {validateDeck,type DeckSnapshot} from '../../src/decks';

export interface Env {ROOMS:DurableObjectNamespace<Room>;FRONTEND_ORIGIN:string;ALLOWED_ORIGINS:string;WAITING_TTL_SECONDS:string;ROOM_TTL_SECONDS:string;EXPIRED_RETENTION_SECONDS:string;NETWORK_GAME_MODE?:'ordinary'|'magic'}
interface Attachment {seat:Seat|null;id:string;deadline:number;window:number;count:number}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const failure=(error:unknown)=>error instanceof RoomError?json({error:error.code},error.status):json({error:'internal_error'},500);
function policy(env:Env):Policy {
 const ms=(value:string,fallback:number)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value)*1000:fallback;
 return {waitingMs:ms(env.WAITING_TTL_SECONDS,14400000),roomMs:ms(env.ROOM_TTL_SECONDS,86400000),retentionMs:ms(env.EXPIRED_RETENTION_SECONDS,3600000)};
}
async function readBody(request:Request,limit=2048) {
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new RoomError('json_required',415);
 const reader=request.body?.getReader();if(!reader)throw new RoomError('invalid_body');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RoomError('body_too_large',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new RoomError('invalid_body');}
 return value;
}
async function body(request:Request) {
 const value=await readBody(request);
 if(!record(value)||Object.keys(value).sort().join(',')!=='joinKey,name'||typeof value.joinKey!=='string'||!SECRET.test(value.joinKey))throw new RoomError('invalid_body');
 return {name:displayName(value.name),joinKey:value.joinKey};
}
async function recoveryBody(request:Request){
 const value=await readBody(request);
 if(!record(value)||Object.keys(value).join(',')!=='secret'||typeof value.secret!=='string'||!SECRET.test(value.secret))throw new RoomError('invalid_body');
 return {secret:value.secret};
}
async function createBody(request:Request){
 const value=await readBody(request,128*1024);
 if(!record(value)||typeof value.joinKey!=='string'||!SECRET.test(value.joinKey))throw new RoomError('invalid_body');
 const hasDeck=Object.prototype.hasOwnProperty.call(value,'deck');
 if(!hasDeck&&new TextEncoder().encode(JSON.stringify(value)).length>2048)throw new RoomError('body_too_large',413);
 if(Object.keys(value).sort().join(',')!==(hasDeck?'deck,joinKey,name':'joinKey,name'))throw new RoomError('invalid_body');
 let deck:DeckSnapshot|undefined;
 if(hasDeck){
  const d=value.deck;
  if(!record(d)||Object.keys(d).sort().join(',')!=='name,words'||!Array.isArray(d.words)||d.words.length>200||!d.words.every(w=>record(w)&&Object.keys(w).sort().join(',')==='ko,ru'))throw new RoomError('invalid_deck');
  try{deck=validateDeck(d);}catch{throw new RoomError('invalid_deck');}
 }
 return {name:displayName(value.name),joinKey:value.joinKey,...(deck?{deck}:{})};
}
export default {
 async fetch(request:Request,env:Env):Promise<Response> {
  const origin=request.headers.get('Origin');
  const allowed=env.ALLOWED_ORIGINS.split(',').map(x=>x.trim());
  if(!origin||!allowed.includes(origin))return json({error:'origin_forbidden'},403);
  const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try {
   const url=new URL(request.url);let response:Response;
   if(request.method==='POST'&&url.pathname==='/api/rooms') {
    const input=await createBody(request),id=randomSecret();
    response=await env.ROOMS.get(env.ROOMS.idFromName(id)).fetch('https://room/internal/create',{method:'POST',body:JSON.stringify({...input,roomId:id})});
    if(response.ok){const credential=await response.json() as object;response=json({...credential,inviteUrl:`${env.FRONTEND_ORIGIN.replace(/\/$/,'')}/room/${id}`},201);}
   } else {
    const match=/^\/api\/rooms\/([^/]+)\/(join|recover|ws)$/.exec(url.pathname);
    if(!match||!ROOM_ID.test(match[1]))throw new RoomError('not_found',404);
    const stub=env.ROOMS.get(env.ROOMS.idFromName(match[1]));
    if(match[2]==='join'&&request.method==='POST')response=await stub.fetch('https://room/internal/join',{method:'POST',body:JSON.stringify(await body(request))});
    else if(match[2]==='recover'&&request.method==='POST')response=await stub.fetch('https://room/internal/recover',{method:'POST',body:JSON.stringify(await recoveryBody(request))});
    else if(match[2]==='ws'&&request.method==='GET'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket') {
     // Credentials are sent in the first frame, never in a URL or an access log.
     return await stub.fetch(new Request('https://room/internal/ws',request));
    } else throw new RoomError('method_not_allowed',405);
   }
   const headers=new Headers(response.headers);for(const [key,value] of Object.entries(cors))headers.set(key,value);
   return new Response(response.body,{status:response.status,headers});
  } catch(error) {const response=failure(error);for(const [key,value] of Object.entries(cors))response.headers.set(key,value);return response;}
 }
};

export class Room extends DurableObject<Env> {
 private room?:StoredRoom;
 private queue:Promise<unknown>=Promise.resolve();
 private readonly ttl:Policy;
 constructor(ctx:DurableObjectState,env:Env) {
  super(ctx,env);this.ttl=policy(env);
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  ctx.blockConcurrencyWhile(async()=>{
   this.room=await ctx.storage.get<StoredRoom>('room');
   if(!this.room)return;
   const live=new Set(ctx.getWebSockets().map(ws=>(ws.deserializeAttachment() as Attachment)?.id));
   let changed=migrateRoom(this.room,serverRandom);for(const player of this.room.players){if(player?.connectionId&&!live.has(player.connectionId)){player.connectionId=null;changed=true;}}
   if(changed){this.room.version++;await this.save();}
  });
 }
 private serial<T>(action:()=>Promise<T>):Promise<T> {const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;}
 private async save() {if(this.room)await this.ctx.storage.put('room',this.room);await this.schedule();}
 private async schedule() {
  if(!this.room)return;
  let next=this.room.expired?this.room.expiresAt+this.ttl.retentionMs:this.room.expiresAt;
  if(!this.room.expired)for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment() as Attachment;if(a?.seat===null&&a.deadline>0)next=Math.min(next,a.deadline);}
  await this.ctx.storage.setAlarm(Math.max(Date.now()+1,next));
 }
 private send(ws:WebSocket,value:unknown) {try{ws.send(JSON.stringify(value));}catch{/* Close callbacks reconcile presence. */}}
 private snapshot(ws:WebSocket,p:Seat,type:RoomEventType='room_snapshot',events:DomainEvent[]=[]) {
  if(this.room)this.send(ws,{v:1,type,room:publicRoom(this.room),self:p,game:sessionSnapshot(this.room,p),events:sessionEvents(events,p,this.room)});
 }
 private broadcast(type:RoomEventType,events:DomainEvent[]=[]) {
  if(!this.room)return;
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment() as Attachment;if(a?.seat!==null&&a&&this.room.players[a.seat]?.connectionId===a.id)this.snapshot(ws,a.seat,type,events);}
 }
 private async command(ws:WebSocket,p:Seat,c:NetworkCommand) {
  const room=this.room!;
  const key=`request:${p}:${c.requestId}`;
  try {
   const previous=await this.ctx.storage.get<CommandResult>(key);
   if(previous){this.send(ws,{v:1,type:'command_result',...previous});this.snapshot(ws,p);return;}
   const next=applyCommand(room,p,c);
   if(!next.result.ok){this.send(ws,{v:1,type:'command_result',...next.result});this.snapshot(ws,p);return;}
   const stored=next.state!;touch(stored,Date.now(),this.ttl);
   let alarm=stored.expiresAt;
   for(const socket of this.ctx.getWebSockets()){const a=socket.deserializeAttachment() as Attachment;if(a?.seat===null&&a.deadline>0)alarm=Math.min(alarm,a.deadline);}
   // State and idempotency receipt commit together. Never mutate the live game first.
   await this.ctx.storage.transaction(async tx=>{await tx.put('room',stored);await tx.put(key,next.result);await tx.setAlarm(Math.max(Date.now()+1,alarm));});
   this.room=stored;
   this.send(ws,{v:1,type:'command_result',...next.result});this.broadcast('room_snapshot',next.events);
  } catch {
   // A transaction may have failed. Reload committed state before serving another action.
   this.room=await this.ctx.storage.get<StoredRoom>('room');
   this.send(ws,{v:1,type:'command_result',requestId:c.requestId,ok:false,revision:this.room?.gameRevision??0,code:'storage_error'});
  }
 }
 private async active():Promise<StoredRoom> {
  if(!this.room)throw new RoomError('room_not_found',404);
  if(this.room.expired||Date.now()>=this.room.expiresAt){await this.expire();throw new RoomError('room_expired',410);}
  return this.room;
 }
 private async expire() {
  if(!this.room||this.room.expired)return;
  this.room.expired=true;this.room.version++;
  this.broadcast('room_snapshot');
  for(const ws of this.ctx.getWebSockets())ws.close(4004,'room_expired');
  // Keep a small tombstone; erase recovery material immediately on expiration.
  this.room.seed='';this.room.players=[null,null];delete this.room.game;delete this.room.challenges;delete this.room.blind;delete this.room.recentQuestions;await this.save();
 }
 async fetch(request:Request):Promise<Response> {return this.serial(async()=>{try{
  const path=new URL(request.url).pathname;
  if(path==='/internal/create') {
   if(this.room)throw new RoomError('room_exists',409);
   const input=await request.json() as {roomId:string;name:string;joinKey:string;deck?:DeckSnapshot};
   const result=await createRoom(input.roomId,input.name,input.joinKey,Date.now(),this.ttl);
   this.room=result.room;if(input.deck)this.room.wordDeck=structuredClone(input.deck);this.room.gameMode=this.env.NETWORK_GAME_MODE==='ordinary'?'ordinary':'magic';migrateRoom(this.room,serverRandom);await this.save();return json(result.credential,201);
  }
  const room=await this.active();
  if(path==='/internal/recover'){
   const {secret}=await request.json() as {secret:string};
   const seat=await authenticate(room,secret);
   if(seat===undefined)throw new RoomError('unauthorized',401);
   // Verification changes neither presence nor game state. WebSocket auth performs replacement.
   return json({roomId:room.roomId,seat,recoverySecret:secret});
  }
  if(path==='/internal/join') {
   const input=await request.json() as {name:string;joinKey:string};
   const version=room.version;
   const credential=await joinRoom(room,input.name,input.joinKey,Date.now(),this.ttl);
   await this.save();if(version!==room.version)this.broadcast('player_joined');return json(credential);
  }
  if(path==='/internal/ws') {
   const pending=this.ctx.getWebSockets().filter(ws=>(ws.deserializeAttachment() as Attachment)?.seat===null).length;
   if(pending>=4)throw new RoomError('too_many_connections',429);
   const pair=new WebSocketPair();const [client,server]=Object.values(pair);
   server.serializeAttachment({seat:null,id:randomSecret(),deadline:Date.now()+10000,window:Date.now(),count:0} satisfies Attachment);
   this.ctx.acceptWebSocket(server);await this.schedule();
   return new Response(null,{status:101,webSocket:client});
  }
  throw new RoomError('not_found',404);
 }catch(error){return failure(error);}});}
 async webSocketMessage(ws:WebSocket,data:string|ArrayBuffer):Promise<void> {await this.serial(async()=>{
  const a=ws.deserializeAttachment() as Attachment;
  if(!a)return ws.close(1008,'invalid_connection');
  const now=Date.now();if(now-a.window>=10000){a.window=now;a.count=0;}a.count++;ws.serializeAttachment(a);
  if(a.count>30)return ws.close(1008,'rate_limit');
  if(a.seat===null&&now>a.deadline)return ws.close(4001,'authentication_timeout');
  const invalid=()=>this.send(ws,{v:1,type:'error',code:'invalid_message'});
  if(typeof data!=='string'||new TextEncoder().encode(data).length>4096){invalid();return;}
  const message=parseRoomMessage(data);if(!message){invalid();return;}
  let room:StoredRoom;try{room=await this.active();}catch{ws.close(4004,'room_unavailable');return;}
  if(message.type==='authenticate') {
   if(a.seat!==null){invalid();return;}
   const seat=await authenticate(room,message.secret);
   if(seat===undefined){a.deadline=0;ws.serializeAttachment(a);this.send(ws,{v:1,type:'error',code:'unauthorized'});ws.close(4001,'unauthorized');return;}
   const oldId=room.players[seat]!.connectionId;
   a.seat=seat;ws.serializeAttachment(a);room.players[seat]!.connectionId=a.id;
   touch(room,now,this.ttl);await this.save();
   for(const old of this.ctx.getWebSockets()){if(old!==ws&&(old.deserializeAttachment() as Attachment)?.id===oldId)old.close(4009,'connection_replaced');}
   this.broadcast(publicRoom(room).status==='ready'?'room_ready':'player_reconnected');
  } else {
   if(a.seat===null){this.send(ws,{v:1,type:'error',code:'unauthorized'});return;}
   if(room.players[a.seat]?.connectionId!==a.id)return ws.close(4009,'connection_replaced');
   if(message.type==='command')await this.command(ws,a.seat,message.command);
   else this.snapshot(ws,a.seat);
  }
 });}
 async webSocketClose(ws:WebSocket,code:number,reason:string,wasClean:boolean):Promise<void> {
  await this.disconnected(ws);try{ws.close(code===1006?1000:code,reason);}catch{/* Already closed. */}void wasClean;
 }
 async webSocketError(ws:WebSocket):Promise<void> {await this.disconnected(ws);try{ws.close(1011,'connection_error');}catch{/* Already closed. */}}
 private async disconnected(ws:WebSocket) {await this.serial(async()=>{
  const a=ws.deserializeAttachment() as Attachment;
  if(!this.room||this.room.expired||!a||a.seat===null||this.room.players[a.seat]?.connectionId!==a.id)return;
  this.room.players[a.seat]!.connectionId=null;touch(this.room,Date.now(),this.ttl);await this.save();this.broadcast('player_left');
 });}
 async alarm():Promise<void> {await this.serial(async()=>{
  if(!this.room)return;
  const now=Date.now();
  for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment() as Attachment;if(a?.seat===null&&a.deadline>0&&a.deadline<=now){a.deadline=0;ws.serializeAttachment(a);ws.close(4001,'authentication_timeout');}}
  if(this.room.expired&&now>=this.room.expiresAt+this.ttl.retentionMs){await this.ctx.storage.deleteAll();this.room=undefined;return;}
  if(now>=this.room.expiresAt)await this.expire();else await this.schedule();
 });}
}
