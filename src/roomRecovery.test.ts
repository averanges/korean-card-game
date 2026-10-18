import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCredential,saveCredential,storageKey,getJoinKey,recoveryCode,parseRecoveryCode,hasPersistentCredential,forgetCredential} from './rooms/credentials';
import {connectRoom} from './rooms/connection';
import {ordinaryView} from './game-core/ordinary';
import {createGame} from './engine';
const own={roomId:'a'.repeat(43),seat:1 as const,recoverySecret:'b'.repeat(43)};
class Store {
 values=new Map<string,string>();
 getItem(key:string){return this.values.get(key)??null;}
 setItem(key:string,value:string){this.values.set(key,value);}
 removeItem(key:string){this.values.delete(key);}
}
function globals(values:Record<string,unknown>){const old=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,configurable:true});return()=>{for(const key of Object.keys(values)){const descriptor=old[key];if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}};}

test('recovery storage migrates existing session, survives empty new tabs, scopes rooms, strips extra fields',()=>{
 const local=new Store(),session=new Store(),restore=globals({localStorage:local,sessionStorage:session});
 try{
  session.setItem(storageKey(own.roomId),JSON.stringify({...own,inviteUrl:'not-a-credential'}));
  assert.deepEqual(loadCredential(own.roomId),own);assert.deepEqual(JSON.parse(local.getItem(storageKey(own.roomId))!),own);
  session.values.clear();assert.deepEqual(loadCredential(own.roomId),own);assert.ok(hasPersistentCredential(own));
  assert.equal(loadCredential('c'.repeat(43)),undefined);
  // A legacy tab retains its own seat if another tab used a different seat in the same browser.
  const legacy={...own,seat:0 as const,recoverySecret:'d'.repeat(43)};session.setItem(storageKey(own.roomId),JSON.stringify(legacy));assert.deepEqual(loadCredential(own.roomId),legacy);
  local.setItem(storageKey(own.roomId),JSON.stringify(own));forgetCredential(legacy);assert.deepEqual(JSON.parse(local.getItem(storageKey(own.roomId))!),own);
 }finally{restore();}
});
test('blocked persistent storage falls back to the legacy session; join proof also migrates and persists',()=>{
 const local=new Store(),session=new Store(),restore=globals({localStorage:local,sessionStorage:session});
 try{
  const id='e'.repeat(43),value={...own,roomId:id};session.setItem(`hangul-join:${id}`,'f'.repeat(43));assert.equal(getJoinKey(id),'f'.repeat(43));session.values.clear();assert.equal(getJoinKey(id),'f'.repeat(43));
  local.setItem=()=>{throw Error('storage denied');};assert.equal(saveCredential(value),false);assert.deepEqual(loadCredential(id),value);assert.equal(hasPersistentCredential(value),false);
  session.setItem(storageKey('g'.repeat(43)),JSON.stringify({...own,roomId:'g'.repeat(43),recoverySecret:'invalid'}));assert.equal(loadCredential('g'.repeat(43)),undefined);
 }finally{restore();}
});
test('personal recovery code carries only room and secret, never a chosen seat or a URL',()=>{
 assert.deepEqual(parseRecoveryCode(' '+recoveryCode(own)+' '),{roomId:own.roomId,secret:own.recoverySecret});
 assert.equal(parseRecoveryCode('https://site/room/'+own.roomId),undefined);assert.equal(parseRecoveryCode('HD1.'+own.roomId+'.1.'+own.recoverySecret),undefined);assert.equal(parseRecoveryCode('Учитель'),undefined);
});

class Socket {
 static OPEN=1;static CLOSED=3;static CONNECTING=0;static all:Socket[]=[];
 readyState=0;sent:string[]=[];onopen?:()=>void;onmessage?:(e:{data:string})=>void;onclose?:(e:{code:number;reason:string})=>void;
 url:string;
 constructor(url:string|URL){this.url=String(url);Socket.all.push(this);}
 send(value:string){this.sent.push(value);}
 close(code=1000,reason=''){this.readyState=3;this.onclose?.({code,reason});}
 accept(){this.readyState=1;this.onopen?.();}
 receive(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
test('connection restores current game/challenge, resumes online and foreground, and does not reclaim replaced tabs',()=>{
 Socket.all=[];const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'}),nav={onLine:true};
 const restore=globals({window:win,document:doc,navigator:nav,WebSocket:Socket});
 const issues:string[]=[],games:unknown[]=[],statuses:string[]=[];
 const game=ordinaryView(createGame(()=>.4),1,9);game.challenge={challengeId:'attempt',magicRef:'magic',magicKind:'mirror',phase:'question',quiz:{challengeId:'attempt',direction:'ko-ru',prompt:'학교',options:['школа','дом','парк','друг']}};
 const snapshot={v:1,type:'room_snapshot',self:1,room:{roomId:own.roomId,status:'playing',players:[{name:'A',connected:true},{name:'B',connected:true}],version:7,createdAt:1,lastActiveAt:2,expiresAt:999999},game};
 const connect=()=>connectRoom(own,()=>{},s=>statuses.push(s),g=>games.push(g),undefined,{apiBase:'https://rooms.example',onAccessIssue:i=>issues.push(i)});
 let close=connect();
 try{
  const first=Socket.all.at(-1)!;assert.ok(!first.url.includes(own.recoverySecret));assert.equal(close.sendCommand({type:'end',requestId:'pre-auth',expectedRevision:9}),false);
  first.accept();assert.deepEqual(JSON.parse(first.sent[0]),{v:1,type:'authenticate',secret:own.recoverySecret});first.receive(snapshot);assert.deepEqual(games[0],game);
  close();close=connect();const reopened=Socket.all.at(-1)!;reopened.accept();reopened.receive(snapshot);assert.deepEqual(games[1],game);
  doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));assert.ok(reopened.sent.some(s=>s.includes('get_snapshot')));
  reopened.close(1006,'offline');win.dispatchEvent(new Event('online'));const reconnected=Socket.all.at(-1)!;assert.notEqual(reconnected,reopened);reconnected.accept();reconnected.receive(snapshot);
  // A late event from the stale connection must not erase fresh state.
  const count=games.length;reopened.receive({...snapshot,game:{...game,revision:0}});assert.equal(games.length,count);
  win.dispatchEvent(new Event('pagehide'));win.dispatchEvent(new Event('pageshow'));const foreground=Socket.all.at(-1)!;assert.notEqual(foreground,reconnected);foreground.accept();foreground.receive(snapshot);
  foreground.close(4009,'connection_replaced');const sockets=Socket.all.length;win.dispatchEvent(new Event('online'));win.dispatchEvent(new Event('pageshow'));doc.dispatchEvent(new Event('visibilitychange'));assert.equal(Socket.all.length,sockets);assert.deepEqual(issues,['replaced']);assert.match(statuses.at(-1)!,/другой вкладке/);
 }finally{close();restore();}
});
test('invalid recovery stops retries; temporary auth timeout is not treated as a lost credential',()=>{
 Socket.all=[];const restore=globals({window:new EventTarget(),document:Object.assign(new EventTarget(),{visibilityState:'visible'}),navigator:{onLine:true},WebSocket:Socket});
 const issues:string[]=[],options={apiBase:'https://rooms.example',onAccessIssue:(i:string)=>issues.push(i)};
 let close=connectRoom(own,()=>{},()=>{},undefined,undefined,options);
 try{
  Socket.all.at(-1)!.close(4001,'authentication_timeout');assert.deepEqual(issues,[]);close();
  close=connectRoom(own,()=>{},()=>{},undefined,undefined,options);const socket=Socket.all.at(-1)!;socket.accept();socket.receive({v:1,type:'error',code:'unauthorized'});socket.close(4001,'unauthorized');assert.deepEqual(issues,['unauthorized']);
 }finally{close();restore();}
});
