import {words} from '../../src/words';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runtimeModules} from './runtime';
import {randomSecret} from '../src/model';
import type {GameSnapshot} from '../../src/rooms/protocol';
const origin='http://localhost:5173';
function checkWire(value:any) {
 const forbidden=new Set(['hands','deck','discard','seed','secretHash','joinHash','connectionId','recoverySecret','dictionary','magicPool','log']);
 function walk(v:any){if(!v||typeof v!=='object')return;for(const [key,child] of Object.entries(v)){assert.ok(!forbidden.has(key),`private field ${key}`);walk(child);}}
 walk(value);
 if(value.events)for(const e of value.events)if(e.type==='cards_drawn'&&e.player!==value.self)assert.equal(e.cards,undefined);
 if(value.game){assert.ok(Array.isArray(value.game.view.magic));}
}
function client(ws:any) {
 const messages:any[]=[],waiters:any[]=[];
 ws.addEventListener('message',(event:any)=>{if(event.data==='pong')return;const v=JSON.parse(event.data);checkWire(v);const i=waiters.findIndex(w=>w.predicate(v));if(i<0)messages.push(v);else{const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(v);}});
 const next=(predicate:(v:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const i=messages.findIndex(predicate);if(i>=0)return resolve(messages.splice(i,1)[0]);const w={predicate,resolve,timer:setTimeout(()=>reject(Error('event timeout')),7000)};waiters.push(w);});
 return {ws,next};
}
for(const mode of ['ordinary','magic'] as const)test('real WebSockets complete '+mode+' game, hide hands, deduplicate and restore',async()=>{
 const persist=await mkdtemp(join(tmpdir(),'hangul-game-'));
 const options={...convertV4MiniflareOptions({name:'game-test',modules:await runtimeModules(true),modulesRoot:resolve('..'),cf:false,compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'Room',useSQLite:true}},bindings:{NETWORK_GAME_MODE:mode,FRONTEND_ORIGIN:origin,ALLOWED_ORIGINS:origin,WAITING_TTL_SECONDS:'14400',ROOM_TTL_SECONDS:'86400',EXPIRED_RETENTION_SECONDS:'3600'}}),resourcePersistencePath:persist,telemetry:{enabled:false}};
 let mf=new Miniflare(options);const sockets:any[]=[];
 const post=async(path:string,name:string)=>{const r=await mf.dispatchFetch(`https://test/api/rooms${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name,joinKey:randomSecret()})});assert.ok(r.ok);return r.json() as Promise<any>;};
 async function connect(credential:any){const r=await mf.dispatchFetch(`https://test/api/rooms/${credential.roomId}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});const c=client(r.webSocket!);c.ws.accept();sockets.push(c.ws);c.ws.send(JSON.stringify({v:1,type:'authenticate',secret:credential.recoverySecret}));await c.next(v=>v.room);return c;}
 try {
  const host=await post('','Host');let a=await connect(host);
  async function raw(c:ReturnType<typeof client>,command:any){c.ws.send(JSON.stringify({v:1,type:'command',command}));return c.next(v=>v.type==='command_result'&&v.requestId===command.requestId);}
  let failed=await raw(a,{type:'start_game',requestId:'early',expectedRevision:0});assert.equal(failed.code,'players_not_ready');
  const guest=await post(`/${host.roomId}/join`,'Guest');let b=await connect(guest);await a.next(v=>v.room?.status==='ready');
  failed=await raw(b,{type:'start_game',requestId:'guest-start',expectedRevision:0});assert.equal(failed.code,'host_only');
  const start={type:'start_game',requestId:'start',expectedRevision:0};assert.ok((await raw(a,start)).ok);
  let snapshots:[GameSnapshot,GameSnapshot]=[(await a.next(v=>v.game?.revision===1)).game,(await b.next(v=>v.game?.revision===1)).game];
  assert.deepEqual(snapshots.map(s=>s.view.hand.cards.length),[6,6]);assert.equal(snapshots[0].view.deckCount,24);
  for(const card of snapshots[1].view.hand.cards)assert.ok(!JSON.stringify(snapshots[0]).includes('"'+('id' in card?card.id:'')+'"'));
  assert.ok((await raw(a,start)).ok);await a.next(v=>v.game?.revision===1);
  assert.equal((await raw(a,{...start,requestId:'second-start',expectedRevision:1})).code,'already_started');
  const attacker=snapshots[0].view.attacker,defender=(1-attacker) as 0|1;
  const players=()=>[a,b] as const;
  const attackCard=snapshots[attacker].allowed.attack[0];
  const storageFailure=await raw(players()[attacker],{type:'attack',requestId:'fault-injection',expectedRevision:1,cardRefs:[attackCard]});
  assert.equal(storageFailure.code,'storage_error');assert.equal(storageFailure.revision,1);
  players()[attacker].ws.send('{"v":1,"type":"get_snapshot"}');const uncommitted=await players()[attacker].next(v=>v.game?.revision===1);
  assert.equal(uncommitted.game.view.table.length,0);assert.equal(uncommitted.game.view.hand.cards.length,6);
  assert.equal((await raw(players()[defender],{type:'attack',requestId:'wrong-turn',expectedRevision:1,cardRefs:[attackCard]})).ok,false);
  const other=snapshots[defender].view.hand.cards[0];
  assert.equal((await raw(players()[attacker],{type:'attack',requestId:'foreign',expectedRevision:1,cardRefs:['id' in other?other.id:'']})).ok,false);
  assert.equal((await raw(a,{type:'take',requestId:'stale',expectedRevision:0})).code,'stale_revision');
  let revision=1,steps=0;
  async function play(p:0|1,intent:any,id=randomSecret()){
   const command={...intent,requestId:id,expectedRevision:revision};const ack=await raw(players()[p],command);assert.ok(ack.ok,ack.code);revision=ack.revision;
   snapshots=[(await a.next(v=>v.game?.revision===revision)).game,(await b.next(v=>v.game?.revision===revision)).game];return command;
  }
  const first=await play(attacker,{type:'attack',cardRefs:[attackCard]});const stable=JSON.stringify(snapshots[attacker].view);
  assert.ok((await raw(players()[attacker],first)).ok);assert.equal((await players()[attacker].next(v=>v.game?.revision===revision)).game.revision,revision);
  assert.equal(JSON.stringify(snapshots[attacker].view),stable);
  // A real runtime restart while the table contains an attack must preserve both hands and revision.
  for(const ws of sockets)try{ws.close(1000,'restart');}catch{}
  await new Promise(r=>setTimeout(r,100));await mf.dispose();mf=new Miniflare(options);
  a=await connect(host);b=await connect(guest);a.ws.send('{"v":1,"type":"get_snapshot"}');b.ws.send('{"v":1,"type":"get_snapshot"}');
  snapshots=[(await a.next(v=>v.game?.revision===revision)).game,(await b.next(v=>v.game?.revision===revision)).game];assert.equal(snapshots[attacker].view.table[0].attack.id,attackCard);
  const restoredReceipt=await raw(players()[attacker],first);assert.ok(restoredReceipt.ok);assert.equal(restoredReceipt.revision,revision);
  assert.equal((await players()[attacker].next(v=>v.game?.revision===revision)).game.view.table.length,1);
  while(!snapshots[0].view.result&&steps++<2000){
   // Refresh sockets periodically so this fast test does not trip the production per-socket rate limit.
   if(steps%6===0){a=await connect(host);b=await connect(guest);}
   const learner=([0,1] as const).find(p=>snapshots[p].view.sealed?.length);
   if(learner!==undefined){const seal=snapshots[learner].view.sealed![0];await play(learner,{type:'begin_unlock',cardRef:seal.ref});const q=snapshots[learner].view.unlock!,word=words.find(w=>w.ko===q.ko)!;await play(learner,{type:'answer_unlock',challengeId:q.id,option:q.options.indexOf(word.ru)});await play(learner,{type:'close_unlock',challengeId:q.id});continue;}
   const attack=snapshots[0].view.attacker as 0|1,defense=(1-attack) as 0|1;
   const av=snapshots[attack],dv=snapshots[defense];
   if(!av.view.table.length){await play(attack,{type:'attack',cardRefs:[av.allowed.attack[0]]});continue;}
   if(av.view.phase==='taking'){
    if(av.allowed.attack.length)await play(attack,{type:'attack',cardRefs:[av.allowed.attack[0]]});else await play(attack,{type:'end'});continue;
   }
   const target=dv.allowed.defend.find(d=>d.cardRefs.length);
   if(dv.view.table.some(pair=>!pair.defense)){
    if(target)await play(defense,{type:'defend',target:target.target,cardRef:target.cardRefs[0]});else await play(defense,{type:'take'});
   }else await play(attack,{type:'end'});
  }
  assert.ok(snapshots[0].view.result,`game did not finish after ${steps} actions`);assert.deepEqual(snapshots[0].view.result,snapshots[1].view.result);
  assert.equal((await raw(a,{type:'end',requestId:'after-finish',expectedRevision:revision})).code,'game_finished');
  console.log(`Full ${mode} network game finished after ${steps} actions.`);
 } finally {for(const ws of sockets)try{ws.close(1000,'done');}catch{}await mf.dispose();await rm(persist,{recursive:true,force:true});}
});
