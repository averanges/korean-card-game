import test from 'node:test';
import assert from 'node:assert/strict';
import {session,noPrivate,raw} from './helpers';
import {words} from '../../src/words';
import type {Seat} from '../../src/rooms/protocol';

for(const mode of ['ordinary','magic']as const)test(`real HTTP + WebSocket full ${mode} game, learning, throw-in, take and hidden hands`,{timeout:90000},async t=>{
 const s=await session(t,mode);let steps=0,defended=0,taken=0,thrown=0,unlocked=0;
 while(!s.snapshots[0].view.result&&steps++<2500){
  // Keep production rate limits; rotate authorized test connections for accelerated play.
  if(steps%5===0){await s.reconnect(0);await s.reconnect(1);}
  for(const snapshot of s.snapshots)noPrivate(snapshot);
  const sealed=([0,1]as const).find(p=>s.snapshots[p].view.sealed?.length);
  if(sealed!==undefined){
   const seal=s.snapshots[sealed].view.sealed![0];await s.act(sealed,{type:'begin_unlock',cardRef:seal.ref});
   const q=s.snapshots[sealed].view.unlock!,word=words.find(w=>w.ko===q.ko)!;
   await s.reconnect(sealed);assert.equal(s.snapshots[sealed].view.unlock!.id,q.id);
   await s.act(sealed,{type:'answer_unlock',challengeId:q.id,option:q.options.indexOf(word.ru)});await s.act(sealed,{type:'close_unlock',challengeId:q.id});unlocked++;continue;
  }
  const a=s.snapshots[0].view.attacker,d=(1-a)as Seat,av=s.snapshots[a],dv=s.snapshots[d];
  if(!av.view.table.length){await s.act(a,{type:'attack',cardRefs:[av.allowed.attack[0]]});continue;}
  if(av.view.phase==='taking'){
   if(av.allowed.attack.length){await s.act(a,{type:'attack',cardRefs:[av.allowed.attack[0]]});thrown++;}else await s.act(a,{type:'end'});continue;
  }
  const target=dv.allowed.defend.find(d=>d.cardRefs.length);
  if(dv.view.table.some(pair=>!pair.defense)){
   if(target){await s.act(d,{type:'defend',target:target.target,cardRef:target.cardRefs[0]});defended++;}else{await s.act(d,{type:'take'});taken++;}
  }else if(av.allowed.attack.length&&steps%3===0){await s.act(a,{type:'attack',cardRefs:[av.allowed.attack[0]]});thrown++;}
  else await s.act(a,{type:'end'});
 }
 assert.ok(s.snapshots[0].view.result,`game not finished after ${steps} actions`);assert.deepEqual(s.snapshots[0].view.result,s.snapshots[1].view.result);
 assert.ok(defended);assert.ok(taken);assert.ok(thrown);if(mode==='magic')assert.ok(unlocked);
 assert.equal((await raw(s.clients[0],{type:'end',requestId:'after-finish',expectedRevision:s.revision})).code,'game_finished');
 console.log(`${mode}: ${steps} actions, defenses=${defended}, takes=${taken}, throw-ins=${thrown}, unlocks=${unlocked}`);
});
