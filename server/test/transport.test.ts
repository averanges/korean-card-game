import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {runtime,origin,raw,session,noPrivate} from './helpers';
import {randomSecret} from '../../worker/src/model';

test('HTTP health, diagnostics, CORS, validation, third seat, recovery and WebSocket Origin',async t=>{
 const r=await runtime(t);
 for(const path of ['/health','/diagnostics.html','/diagnostics.js'])assert.equal((await fetch(r.base+path)).status,200);
 const publicHealth=await fetch(r.base+'/health',{headers:{Origin:'null'}});assert.equal(publicHealth.headers.get('access-control-allow-origin'),'*');assert.equal((await publicHealth.json()as any).mode,'rooms-memory');
 const preflight=await fetch(r.base+'/api/rooms',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
 assert.equal((await r.post('/api/rooms',{name:'X',joinKey:randomSecret()},'https://forbidden.example')).response.status,403);
 assert.equal((await r.post('/api/rooms',{name:'X',joinKey:randomSecret(),player:0})).response.status,400);
 assert.equal((await r.post('/api/rooms',{name:'X',joinKey:randomSecret(),deck:{name:'bad',words:[]}})).value.error,'invalid_deck');
 const big=await fetch(r.base+'/api/rooms',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'x'.repeat(129*1024)});assert.equal(big.status,413);
 const host=await r.enter();assert.equal(host.inviteUrl,`${origin}/korean-card-game/room/${host.roomId}`);const a=await r.connect(host);noPrivate(a.first);
 const guest=await r.enter(`/${host.roomId}/join`);await r.connect(guest);
 const full=await r.post(`/api/rooms/${host.roomId}/join`,{name:'Host',joinKey:randomSecret()});assert.equal(full.value.error,'room_full');
 assert.equal((await r.post(`/api/rooms/${host.roomId}/recover`,{secret:randomSecret()})).response.status,401);
 assert.equal((await r.post(`/api/rooms/${host.roomId}/recover`,{secret:host.recoverySecret})).value.seat,0);
 const bad=new WebSocket(r.base.replace('http:','ws:')+`/api/rooms/${host.roomId}/ws`,{headers:{Origin:'https://forbidden.example'}});bad.on('error',()=>{});const[,response]=await once(bad,'unexpected-response');assert.equal(response.statusCode,403);bad.terminate();
 const wrong=new WebSocket(r.base.replace('http:','ws:')+`/api/rooms/${host.roomId}/ws`,{headers:{Origin:origin}});wrong.on('error',()=>{});await once(wrong,'open');const closed=once(wrong,'close');wrong.send(JSON.stringify({v:1,type:'authenticate',secret:randomSecret()}));assert.equal((await closed)[0],4001);
});
test('refresh, connection replacement, temporary socket loss and receipt replay preserve table',async t=>{
 const s=await session(t,'ordinary'),p=s.snapshots[0].view.attacker;
 const command=await s.act(p,{type:'attack',cardRefs:[s.snapshots[p].allowed.attack[0]]});const view=structuredClone(s.snapshots[p].view);
 const old=s.clients[p],closed=once(old.ws,'close');s.clients[p]=await s.connect(s.credentials[p]);assert.equal((await closed)[0],4009);
 assert.deepEqual(s.clients[p].first.game.view,view);await s.reconnect(p);assert.deepEqual(s.snapshots[p].view,view);
 const replay=await raw(s.clients[p],command);assert.ok(replay.ok);assert.equal(replay.revision,s.revision);
 assert.equal((await s.clients[p].next(v=>v.game?.revision===s.revision)).game.view.table.length,1);
 const stale=await raw(s.clients[p],{type:'end',requestId:'stale',expectedRevision:0});assert.equal(stale.code,'stale_revision');
 const foreign=s.snapshots[(1-p)as 0|1].view.hand.cards[0];assert.ok('id'in foreign);
 assert.equal((await raw(s.clients[p],{type:'attack',requestId:'forged',expectedRevision:s.revision,cardRefs:[foreign.id]})).ok,false);
 noPrivate(s.snapshots[0]);noPrivate(s.snapshots[1]);
});
test('expiry closes sockets and new process cannot recover memory rooms',async t=>{
 const r=await runtime(t,{ttl:{waitingMs:150,roomMs:150,retentionMs:5000}}),host=await r.enter(),c=await r.connect(host);
 assert.equal((await once(c.ws,'close'))[0],4004);
 assert.equal((await r.post(`/api/rooms/${host.roomId}/recover`,{secret:host.recoverySecret})).response.status,410);
 const other=await runtime(t);assert.equal((await other.post(`/api/rooms/${host.roomId}/recover`,{secret:host.recoverySecret})).value.error,'room_not_found');
});
