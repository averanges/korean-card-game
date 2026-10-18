import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseKoreanVoice,setSpeechEnabled,speakKorean} from './speech';
test('shared TTS speaks the current custom word, prefers Korean Google voice and respects mute',async()=>{
 const saved=['window','SpeechSynthesisUtterance'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)] as const),spoken:any[]=[],voices=[{lang:'ko-KR',name:'Microsoft',default:true},{lang:'ko-KR',name:'Google 한국의',default:false}] as SpeechSynthesisVoice[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{speechSynthesis:{getVoices:()=>voices,cancel:()=>{},speak:(u:unknown)=>spoken.push(u)}}});
 Object.defineProperty(globalThis,'SpeechSynthesisUtterance',{configurable:true,value:class{constructor(public text:string){}}});
 try{setSpeechEnabled(true);await speakKorean('새로운 단어',()=>{});assert.equal(spoken[0].text,'새로운 단어');assert.equal(spoken[0].lang,'ko-KR');assert.equal(spoken[0].voice,chooseKoreanVoice(voices));setSpeechEnabled(false);await speakKorean('не должно звучать',()=>{});assert.equal(spoken.length,1);}finally{setSpeechEnabled(true);for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else Reflect.deleteProperty(globalThis,k);}}
});
