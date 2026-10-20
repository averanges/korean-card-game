import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {runtime,origin,session,raw} from './helpers';
import {randomSecret} from '../../worker/src/model';

test('pending auth cap, per-socket rate limit and no state before authentication',async t=>{
 const r=await runtime(t),host=await r.enter(),url=r.base.replace('http:','ws:')+`/api/rooms/${host.roomId}/ws`,pending:WebSocket[]=[];
 for(let i=0;i<4;i++){const ws=new WebSocket(url,{headers:{Origin:origin}});ws.on('error',()=>{});await once(ws,'open');pending.push(ws);t.after(()=>ws.terminate());}
 const rejected=new WebSocket(url,{headers:{Origin:origin}});rejected.on('error',()=>{});const[,response]=await once(rejected,'unexpected-response');assert.equal(response.statusCode,429);rejected.terminate();
 const first=pending[0],message=once(first,'message');first.send('{"v":1,"type":"get_snapshot"}');const denied=JSON.parse((await message)[0].toString());assert.deepEqual(denied,{v:1,type:'error',code:'unauthorized'});
 const closed=once(first,'close');for(let i=0;i<35;i++)first.send('{"v":1,"type":"get_snapshot"}');assert.equal((await closed)[0],1008);
});
test('concurrent joins claim only one seat; bounded room capacity',async t=>{
 const r=await runtime(t,{maxRooms:1}),host=await r.enter();
 const joined=await Promise.all([0,1].map(i=>r.post(`/api/rooms/${host.roomId}/join`,{name:'Guest '+i,joinKey:randomSecret()})));
 assert.deepEqual(joined.map(r=>r.response.status).sort(),[200,409]);
 assert.equal((await r.post('/api/rooms',{name:'another',joinKey:randomSecret()})).response.status,503);
});
test('concurrent commands serialize revisions, forged protocol and oversized payload do not mutate game',async t=>{
 const s=await session(t,'ordinary'),p=s.snapshots[0].view.attacker,c=s.clients[p],ref=s.snapshots[p].allowed.attack[0];
 const results=await Promise.all(['one','two'].map(requestId=>raw(c,{type:'attack',requestId,expectedRevision:1,cardRefs:[ref]})));
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'stale_revision');
 const invalid=c.next(v=>v.type==='error');c.ws.send(JSON.stringify({v:1,type:'command',command:{type:'end',requestId:'forged',expectedRevision:2,player:1}}));assert.equal((await invalid).code,'invalid_message');
 const closed=once(c.ws,'close');c.ws.send('x'.repeat(4097));assert.equal((await closed)[0],1009);
});
