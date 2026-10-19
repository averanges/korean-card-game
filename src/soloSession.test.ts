import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,drawToSix} from './engine';
import {reduceLearning,sealedCards} from './learning';
import {createChallengeBook,beginMagicChallenge,answerMagicChallenge} from './game-core/challenges';
import {readSoloSession,writeSoloSession,type SoloSession} from './soloSession';
function storage(){const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);}};}
test('solo reload keeps sealed physical cards, reading errors and reward receipt; different guest cannot inherit it',()=>{
 let g=createGame(()=>.4);g.discard.push(...g.hands[0].splice(0,1));drawToSix(g,0,()=>0);const ref=sealedCards(g,0)[0].ref;g=reduceLearning(g,{type:'unlock_begin',player:0,ref});let q=g.learning!.attempts[0]!;g=reduceLearning(g,{type:'unlock_answer',player:0,challengeId:q.id,option:q.quiz.options.findIndex(o=>o!==q.quiz.correct)});const db=storage(),session:SoloSession={version:1,game:g,book:createChallengeBook(),memory:{magicUsedRound:2},recent:[]};assert.ok(writeSoloSession('me',session,db));const saved=readSoloSession('me',db)!;assert.deepEqual(saved.game,JSON.parse(JSON.stringify(g)));assert.equal(saved.game.learning!.seals[q.cardId].errors,1);assert.equal(readSoloSession('other',db),undefined);
 g=reduceLearning(saved.game,{type:'unlock_continue',player:0,challengeId:q.id});q=g.learning!.attempts[0]!;g=reduceLearning(g,{type:'unlock_answer',player:0,challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)},()=>0);assert.ok(writeSoloSession('me',{...session,game:g},db));const restored=readSoloSession('me',db)!.game;assert.equal(restored.learning!.seals[q.cardId].rewardChecked,true);assert.equal(reduceLearning(restored,{type:'unlock_answer',player:0,challengeId:q.id,option:0}),restored);
});
test('solo active listening and errors survive serialization, without replaying or resetting its activation',()=>{
 const g=createGame(()=>.4);g.attacker=0;const c=g.magicPool!.find(c=>c.spell==='mirror')!;g.magicPool=g.magicPool!.filter(x=>x.id!==c.id);g.hands[0].push(c);let book=beginMagicChallenge(g,createChallengeBook(),0,c.id,'q');const q=book.attempts[0]!.quiz;book=answerMagicChallenge(g,book,0,'q',q.options.findIndex(o=>o!==q.correct)).book;const db=storage();writeSoloSession('me',{version:1,game:g,book,memory:{},recent:[],spell:c.id},db);const saved=readSoloSession('me',db)!;assert.equal(saved.spell,c.id);assert.equal(saved.book.attempts[0]!.id,'q');assert.equal(saved.book.attempts[0]!.errors,1);assert.equal(saved.game.magic.includes(c.id),false);
});
test('blocked storage and malformed save are handled without crashing the game',()=>{
 assert.equal(writeSoloSession('me',{} as SoloSession,{setItem(){throw Error('blocked');}}),false);assert.equal(readSoloSession('me',{getItem(){throw Error('blocked');}}),undefined);for(const text of ['{','{}','{"version":1,"game":{"hands":[]}}'])assert.equal(readSoloSession('me',{getItem:()=>text}),undefined);
});
test('solo refresh retains both pity counters and third-opening guarantee',()=>{
 let g=createGame(()=>.4);g.discard.push(...g.hands[0].splice(0,3));drawToSix(g,0,()=>0);const db=storage();
 for(let i=0;i<3;i++){
  g=reduceLearning(g,{type:'unlock_begin',player:0,ref:sealedCards(g,0)[0].ref});const q=g.learning!.attempts[0]!;
  g=reduceLearning(g,{type:'unlock_answer',player:0,challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)},()=>.99);
  assert.ok(writeSoloSession('pity',{version:1,game:g,book:createChallengeBook(),memory:{},recent:[]},db));g=readSoloSession('pity',db)!.game;
  assert.deepEqual(g.learning!.rewardMisses,[i<2?i+1:0,0]);
 }
 assert.equal(g.magicPool!.length,10);
});
