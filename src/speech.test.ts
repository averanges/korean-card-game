import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseKoreanVoice,setSpeechEnabled,speakKorean} from './speech';
test('shared TTS speaks the current custom word, prefers Korean Google voice and respects mute',async()=>{
 const saved=['window','SpeechSynthesisUtterance'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)] as const),spoken:any[]=[],voices=[{lang:'ko-KR',name:'Microsoft',default:true},{lang:'ko-KR',name:'Google 한국의',default:false}] as SpeechSynthesisVoice[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{speechSynthesis:{getVoices:()=>voices,cancel:()=>{},speak:(u:unknown)=>spoken.push(u)}}});
 Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(public text:string){}}});
 try{setSpeechEnabled(true);await speakKorean('새로운 단어',()=>{});assert.equal(spoken[0].text,'새로운 단어');assert.equal(spoken[0].lang,'ko-KR');assert.equal(spoken[0].voice,chooseKoreanVoice(voices));setSpeechEnabled(false);await speakKorean('не должно звучать',()=>{});assert.equal(spoken.length,1);}finally{setSpeechEnabled(true);for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}}
});
test('listening requires a Korean voice, reports technical failures and ignores stale canceled playback',async()=>{
 const saved=['window','SpeechSynthesisUtterance'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)] as const),spoken:any[]=[],errors:string[]=[],voices:any[]=[{lang:'en-US',name:'English'}];let started=0,failed=0;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{speechSynthesis:{getVoices:()=>voices,cancel:()=>{},speak:(u:any)=>spoken.push(u)}}});Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(public text:string){}}});
 try{setSpeechEnabled(true);const options={rate:.88,requireKorean:true,onStarted:()=>started++,onFailure:()=>failed++};await speakKorean('학교',s=>errors.push(s),options);assert.equal(spoken.length,0);assert.equal(failed,1);assert.ok(errors.at(-1)?.includes('Корейский голос'));
  voices.push({lang:'ko-KR',name:'Google 한국의'});await speakKorean('학교',s=>errors.push(s),options);const first=spoken[0];assert.equal(first.rate,.88);first.onstart();assert.equal(started,1);await speakKorean('학교',s=>errors.push(s),options);const second=spoken[1];second.onstart();first.onerror({error:'canceled'});assert.equal(failed,1);second.onerror({error:'synthesis-failed'});assert.equal(failed,2);assert.ok(errors.at(-1)?.includes('Не удалось'));
 }finally{setSpeechEnabled(true);for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}}
});
