import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {runtimeModules} from './runtime';
import {randomSecret} from '../src/model';
import {words} from '../../src/words';
import type {GameSnapshot,Seat} from '../../src/rooms/protocol';
const origin='http://localhost:5173';
function inspect(v:any){
 const forbidden=new Set(['correct','correctIndex','index','dictionary','usedIds','references','orders','signatures','lockedCardId','hands','deck','discard','magicPool','seed','secretHash','joinHash','recoverySecret']);
 function walk(value:any){if(!value||typeof value!=='object')return;for(const [k,x] of Object.entries(value)){assert.ok(!forbidden.has(k),`private field ${k}`);walk(x);}}walk(v);
 if(v.game?.view.hand.blind){for(const c of v.game.view.hand.cards)assert.deepEqual(Object.keys(c).sort(),['hidden','ref']);assert.deepEqual(v.game.allowed.attack,v.game.view.hand.cards.map((c:any)=>c.ref));}
 if(v.events)for(const e of v.events){if(['cards_drawn','magic_received'].includes(e.type)&&e.player!==v.self)assert.equal(e.cards,undefined);if(v.game?.view.hand.blind&&['cards_drawn','magic_expired'].includes(e.type))assert.equal(e.cards,undefined);if(e.exchange&&e.player!==v.self)assert.equal(e.exchange.newCard,undefined);}
}
function client(ws:any){const messages:any[]=[],waiters:any[]=[];
 ws.addEventListener('message',(e:any)=>{if(e.data==='pong')return;const value=JSON.parse(e.data);inspect(value);const i=waiters.findIndex(w=>w.predicate(value));if(i<0)messages.push(value);else{const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(value);}});
 const next=(predicate:(v:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const i=messages.findIndex(predicate);if(i>=0)return resolve(messages.splice(i,1)[0]);waiters.push({predicate,resolve,timer:setTimeout(()=>reject(Error('magic event timeout')),7000)});});return {ws,next};
}
function option(snapshot:GameSnapshot,correct=true){const q=snapshot.challenge!.quiz!;const word=words.find(w=>q.direction==='ko-ru'?w.ko===(q.audioText||q.prompt):w.ru===q.prompt)!;const answer=q.direction==='ko-ru'?word.ru:word.ko;const i=q.options.findIndex(o=>correct?o===answer:o!==answer);assert.ok(i>=0);return i;}
test('real magic protocol: all seven effects, private quizzes, hibernation, lost ack, target restart and blind references',async()=>{
 const persist=await mkdtemp(join(tmpdir(),'hangul-magic-'));
 const options={...convertV4MiniflareOptions({name:'magic-test',modules:await runtimeModules(true,true),modulesRoot:resolve('..'),cf:false,compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'Room',useSQLite:true}},bindings:{FRONTEND_ORIGIN:origin,ALLOWED_ORIGINS:origin,WAITING_TTL_SECONDS:'14400',ROOM_TTL_SECONDS:'86400',EXPIRED_RETENTION_SECONDS:'3600'}}),resourcePersistencePath:persist,telemetry:{enabled:false}};
 let mf=new Miniflare(options);const sockets:any[]=[],credentials:any[]=[],players:ReturnType<typeof client>[]=[],snapshots:GameSnapshot[]=[];let revision=0;
 async function enter(path:string){const r=await mf.dispatchFetch('https://test/api/rooms'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:path?'B':'A',joinKey:randomSecret()})});assert.ok(r.ok);return r.json() as Promise<any>;}
 async function connect(p:Seat){const credential=credentials[p],r=await mf.dispatchFetch(`https://test/api/rooms/${credential.roomId}/ws`,{headers:{Origin:origin,Upgrade:'websocket'}});assert.equal(r.status,101);const c=client(r.webSocket!);c.ws.accept();sockets.push(c.ws);players[p]=c;c.ws.send(JSON.stringify({v:1,type:'authenticate',secret:credential.recoverySecret}));const first=await c.next(v=>v.room);if(first.game)snapshots[p]=first.game;return c;}
 async function raw(p:Seat,c:any){players[p].ws.send(JSON.stringify({v:1,type:'command',command:c}));return players[p].next(v=>v.type==='command_result'&&v.requestId===c.requestId);}
 async function sync(){for(const p of [0,1] as const){players[p].ws.send('{"v":1,"type":"get_snapshot"}');snapshots[p]=(await players[p].next(v=>v.game?.revision===revision)).game;}}
 async function act(p:Seat,intent:any){const command={...intent,requestId:randomSecret(),expectedRevision:revision};const result=await raw(p,command);assert.ok(result.ok,result.code);revision=result.revision;for(const s of [0,1] as const)snapshots[s]=(await players[s].next(v=>v.game?.revision===revision)).game;return command;}
 async function begin(p:Seat,spell:string){const c=snapshots[p].view.magic.find(c=>c.spell===spell)!;assert.ok(c,spell);await act(p,{type:'begin_magic',magicRef:c.id});return snapshots[p].challenge!.challengeId;}
 async function answer(p:Seat,correct=true){return act(p,{type:'answer_quiz',challengeId:snapshots[p].challenge!.challengeId,option:option(snapshots[p],correct)});}
 async function restart(){for(const ws of sockets)try{ws.close(1000,'restart');}catch{}await new Promise(r=>setTimeout(r,100));await mf.dispose();mf=new Miniflare(options);await connect(0);await connect(1);await sync();}
 try{
  credentials[0]=await enter('');credentials[1]=await enter(`/${credentials[0].roomId}/join`);await connect(0);await connect(1);await act(0,{type:'start_game'});
  assert.deepEqual(snapshots.map(s=>s.view.hand.cards.length),[6,6]);assert.deepEqual(snapshots.map(s=>s.view.magic.length),[7,4]);
  const mirror=await begin(0,'mirror'),quiz=snapshots[0].challenge!.quiz;assert.equal(snapshots[1].challenge,undefined);
  const beforeFailure=revision;assert.equal((await raw(0,{type:'answer_quiz',challengeId:mirror,option:option(snapshots[0]),requestId:'fault-injection',expectedRevision:revision})).code,'storage_error');await sync();assert.equal(revision,beforeFailure);assert.equal(snapshots[0].challenge!.phase,'question');
  await mf.unsafeEvictDurableObject('magic-test','Room',{name:credentials[0].roomId,webSockets:'hibernate'});await sync();assert.deepEqual(snapshots[0].challenge!.quiz,quiz);
  await restart();assert.equal(snapshots[0].challenge!.challengeId,mirror);assert.deepEqual(snapshots[0].challenge!.quiz,quiz);
  // Commit an answer, deliberately discard the sender's acknowledgement, then reconnect and replay.
  const lost={type:'answer_quiz',challengeId:mirror,option:option(snapshots[0]),requestId:'lost-answer',expectedRevision:revision};players[0].ws.send(JSON.stringify({v:1,type:'command',command:lost}));revision++;
  snapshots[1]=(await players[1].next(v=>v.game?.revision===revision)).game;await connect(0);await sync();assert.equal(snapshots[0].view.inverted,true);
  const replay=await raw(0,lost);assert.ok(replay.ok);assert.equal(replay.revision,revision);await sync();assert.equal(snapshots[0].view.magic.some(c=>c.spell==='mirror'),false);
  assert.equal((await raw(0,{...lost,requestId:'second-answer',expectedRevision:revision})).code,'invalid_challenge');
  await begin(0,'chance');const count=snapshots[0].view.deckCount;await answer(0);assert.equal(snapshots[0].view.deckCount,count+2);
  const fate=await begin(0,'fate');await answer(0);const target=snapshots[0].challenge!.target!;assert.equal(target.kind,'trump');const same=snapshots[0].view.trump;
  assert.equal((await raw(0,{type:'choose_trump',challengeId:fate,trump:same,requestId:'bad-suit',expectedRevision:revision})).code,'invalid_target');
  await restart();assert.equal(snapshots[0].challenge!.phase,'target');await act(0,{type:'choose_trump',challengeId:fate,trump:(same+1)%4});assert.equal(snapshots[1].view.trump,(same+1)%4);
  await begin(0,'ghost_thief');await answer(0);assert.equal(snapshots[1].view.blockedCount,1);
  await begin(0,'trick_gift');const enemy=snapshots[0].view.opponent.ordinaryCount;await answer(0);assert.equal(snapshots[0].view.opponent.ordinaryCount,enemy+1);
  const hat=await begin(0,'magicians_hat');await answer(0);await restart();const choices=snapshots[0].challenge!.target!;assert.equal(choices.kind,'hat');if(choices.kind==='hat')await act(0,{type:'choose_hat_card',challengeId:hat,cardRef:choices.cardRefs[0]});
  await connect(0);await connect(1); // reset production per-socket rate counters for this fast test
  await begin(0,'monkey_prank');await answer(0);
  const own=snapshots[0].view.hand,enemyHand=snapshots[1].view.hand;assert.ok(!own.blind&&!enemyHand.blind);
  const pair=!own.blind&&!enemyHand.blind?own.cards.flatMap(a=>enemyHand.cards.filter(d=>(d.suit===a.suit?d.rank<a.rank:d.suit===snapshots[0].view.trump&&a.suit!==d.suit)).map(d=>({a,d})))[0]:undefined;assert.ok(pair);
  await act(0,{type:'attack',cardRefs:[pair.a.id]});await act(1,{type:'defend',cardRef:pair.d.id,target:0});await act(0,{type:'end'});
  assert.equal(snapshots[1].view.hand.blind,true);assert.equal(snapshots[1].view.blockedCount,0);
  const opaque=snapshots[1].allowed.attack.slice();await restart();assert.deepEqual(snapshots[1].allowed.attack,opaque);
  await act(1,{type:'attack',cardRefs:[opaque[0]]});assert.equal(snapshots[1].allowed.attack.length,0);assert.ok(snapshots[0].view.table[0].attack.word.ko);
  assert.equal((await raw(1,{type:'attack',cardRefs:[opaque[1]||opaque[0]],requestId:'no-throw',expectedRevision:revision})).ok,false);
  // Other participant also answers through the server; wrong answer burns its physical extra.
  const guestGift=await begin(1,'trick_gift');await answer(1,false);assert.equal(snapshots[1].challenge!.attemptsLeft,2);await restart();assert.equal(snapshots[1].challenge!.attemptsLeft,2);await answer(1,false);assert.equal(snapshots[1].challenge!.attemptsLeft,1);await answer(1,false);assert.equal(snapshots[1].challenge!.outcome,'wrong');assert.equal(snapshots[1].view.magic.some(c=>c.spell==='trick_gift'),false);
  assert.equal((await raw(1,{type:'answer_quiz',challengeId:guestGift,option:0,requestId:'no-second-try',expectedRevision:revision})).code,'invalid_challenge');
 }finally{for(const ws of sockets)try{ws.close(1000,'done');}catch{}await mf.dispose();await rm(persist,{recursive:true,force:true});}
});
