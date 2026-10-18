import test from 'node:test';
import assert from 'node:assert/strict';
import {basicDeck,validateDeck,distributeWords,resolveDeck,RANDOM_DECK} from './decks';
import {newProfile,putDeck,deleteDeck,duplicateDeck,writeProfile,readProfile,PROFILE_KEY} from './profile';
import {createDeckGame} from './gameFactory';
import {reduceGame} from './engine';
import {makeMagicQuiz} from './magicQuiz';
const rows=(n:number)=>Array.from({length:n},(_,i)=>({ko:`단어${i}`,ru:`значение ${i}`}));
const rng=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
test('deck validation: nine accepted; eight, ambiguous values, duplicates and oversized input rejected',()=>{
 assert.equal(validateDeck({name:' Моя колода ',words:rows(9)}).words.length,9);
 assert.throws(()=>validateDeck({name:'Колода',words:rows(8)}),/Добавьте ещё 1/);
 for(const words of [[...rows(9),rows(9)[0]],[...rows(9),{ko:'другое',ru:rows(9)[0].ru}],[...rows(9),{ko:rows(9)[0].ko,ru:'другое'}],rows(201)])assert.throws(()=>validateDeck({name:'Колода',words}));
 assert.throws(()=>validateDeck({name:'x'.repeat(61),words:rows(9)}));assert.throws(()=>validateDeck({name:'Колода',words:[...rows(9),{ko:'x',ru:''}]}));
 assert.equal(validateDeck({name:'Колода',words:[...rows(9),{ko:' ',ru:' '}]}).words.length,9);
});
test('36 physical assignments are fair for all requested sizes and independent of ranks',()=>{
 for(const n of [9,12,15,18,24,30,36,70,200]){
  const {dictionary,assigned}=distributeWords(rows(n),rng(n));assert.equal(assigned.length,36);assert.equal(dictionary.length,Math.min(n,36));
  const counts=dictionary.map(w=>assigned.filter(a=>a.ko===w.ko).length);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);assert.ok(counts.every(c=>c>0));
  if(n===9)assert.ok(counts.every(c=>c===4));if(n===24)assert.equal(counts.filter(c=>c===2).length,12);if(n>=36)assert.equal(new Set(assigned.map(w=>w.ko)).size,36);
 }
 assert.notDeepEqual(distributeWords(rows(24),rng(1)),distributeWords(rows(24),rng(2)));
 const game=createDeckGame({name:'Тема',words:rows(70)},rng(10));const all=[...game.deck,...game.hands.flat()];assert.equal(new Set(all.map(c=>`${c.suit}-${c.rank}`)).size,36);
 for(const direction of [()=>0,()=>.9]){const quiz=makeMagicQuiz(game.dictionary!,[],direction)!;assert.equal(quiz.options.length,4);assert.ok(game.dictionary!.some(w=>quiz.correct===w.ko||quiz.correct===w.ru));}
});
test('Second Chance and refills preserve assigned words and the in-party dictionary',()=>{
 let g=createDeckGame({name:'Тема',words:rows(24)},rng(4));g.attacker=0;
 const original=new Map([...g.deck,...g.hands.flat()].map(c=>[c.id,JSON.stringify(c.word)]));const dictionary=structuredClone(g.dictionary);
 g.discard=g.deck.splice(0,3);const spell=g.magicPool!.find(c=>c.spell==='chance')!;g.magicPool=g.magicPool!.filter(c=>c.id!==spell.id);g.hands[0].push(spell);
 g=reduceGame(g,{type:'magic',player:0,id:spell.id,question:0,answer:g.dictionary![0].ru},rng(3));assert.equal(g.discard.length,0);
 const a=g.hands[0].find(c=>!c.spell)!,d=g.hands[1].find(c=>!c.spell)!;g.hands[0]=g.hands[0].filter(c=>c!==a);g.hands[1]=g.hands[1].filter(c=>c!==d);g.table=[{attack:a,defense:d}];g=reduceGame(g,{type:'end',player:0},rng(2));
 for(const card of [...g.deck,...g.hands.flat(),...g.discard].filter(c=>!c.spell))assert.equal(JSON.stringify(card.word),original.get(card.id));assert.deepEqual(g.dictionary,dictionary);
});
test('profile CRUD, immutable built-in, random choice, persistence, corrupted JSON and failed writes',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();let fail=false;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw Error('quota');data.set(k,v);}}});
 try{
  let p=newProfile(),copy=duplicateDeck(basicDeck);p=putDeck(p,copy);p={...p,selectedDeckId:copy.id};writeProfile(p);assert.deepEqual(readProfile().profile,p);
  copy={...copy,name:'Новое имя'};p=putDeck(p,copy);assert.equal(p.decks.length,1);assert.equal(p.decks[0].name,'Новое имя');
  const before=data.get(PROFILE_KEY);assert.throws(()=>writeProfile({...p,decks:[{...copy,words:copy.words.slice(0,8)}]}));assert.equal(data.get(PROFILE_KEY),before);
  fail=true;assert.throws(()=>writeProfile(p),/Прежние данные сохранены/);assert.equal(data.get(PROFILE_KEY),before);fail=false;
  assert.throws(()=>putDeck(p,basicDeck));p=deleteDeck(p,copy.id);assert.equal(p.selectedDeckId,basicDeck.id);assert.equal(p.decks.length,0);
  assert.equal(resolveDeck(RANDOM_DECK,[copy],()=>.99).name,copy.name);data.set(PROFILE_KEY,'{broken');assert.ok(readProfile().error);assert.equal(data.get(PROFILE_KEY),'{broken');
 }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}
});
