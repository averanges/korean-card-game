import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,reduceGame,drawToSix,normalCount,canAttack,beats,type Game} from './engine';
import {createLearningState,sealedCards,isStudyLocked,reduceLearning,learningSettings,unlockView} from './learning';
import {projectGameForPlayer,projectEventsForPlayer} from './game-core/projection';
import {createChallengeBook,beginMagicChallenge,answerMagicChallenge,cancelMagicChallenge,publicQuiz} from './game-core/challenges';
import {isGhostLocked,isLocked,hatTargets} from './trickRules';
import {botAction,applyLocalAction} from './bot';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {SealedCard} from './SealedCard';
import {AudioQuestion} from './AudioQuestion';
function drawn(n=3,random=()=>0){const g=createGame(()=>.43);g.discard.push(...g.hands[0].splice(0,n));drawToSix(g,0,random);return g;}
function begin(g:Game,p:0|1=0){return reduceLearning(g,{type:'unlock_begin',player:p,ref:sealedCards(g,p)[0].ref},()=>.2);}
function correct(g:Game,random=()=>0,p:0|1=0){const q=g.learning!.attempts[p]!;return reduceLearning(g,{type:'unlock_answer',player:p,challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)},random);}
const total=(g:Game)=>[...g.deck,...g.hands.flat(),...g.discard,...g.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack])].filter(c=>!c.spell);
test('study locks: initial deal open; refill 1/3/6 keeps exactly 36 physical cards, no magic on draw',()=>{
 for(const n of [1,3,6]){const g=drawn(n);assert.equal(sealedCards(g,0).length,n);assert.equal(normalCount(g.hands[0]),6);assert.equal(g.magicPool!.length,11);assert.equal(total(g).length,36);assert.equal(new Set(total(g).map(c=>c.id)).size,36);}
 assert.equal(sealedCards(createGame(),0).length,0);assert.equal(learningSettings.LOCK_CHANCE,.4);assert.equal(learningSettings.MAGIC_REWARD_CHANCE,.25);
});
test('independent draw rolls include both sides of the 40% boundary',()=>{
 const draws=[.399,0,0,0,0,.4,.2,0,0,0,0],g=drawn(3,()=>draws.shift()??.9);assert.equal(sealedCards(g,0).length,2);
});
test('sealed physical card cannot attack, defend, be exchanged, or enable pass',()=>{
 const g=drawn(6),c=g.hands[0][0];g.attacker=0;assert.ok(isStudyLocked(g,c));assert.equal(canAttack(g,c),false);assert.equal(beats(c,{...c,rank:-1},g),false);assert.equal(hatTargets(g,0).length,0);assert.equal(reduceGame(g,{type:'attack',player:0,ids:[c.id]}),g);assert.equal(reduceGame(g,{type:'pass',player:0}),g);
});
test('sealed owner projection and received events contain only opaque ref + Korean; enemy has no faces',()=>{
 const g=drawn(3),sealed=g.hands[0].filter(c=>isStudyLocked(g,c)),view=projectGameForPlayer(g,0);assert.equal(view.sealed!.length,3);
 for(const c of sealed){assert.ok(!view.hand.cards.some(x=>'id' in x&&x.id===c.id));const s=view.sealed!.find(x=>x.ko===c.word.ko)!;assert.deepEqual(Object.keys(s).sort(),['ko','ref']);assert.notEqual(s.ref,c.id);assert.ok(!view.locked!.some(x=>x.id===c.id));}
 const events=projectEventsForPlayer([{type:'cards_drawn',player:0,cards:sealed}],0,g);assert.equal(events[0].cards!.length,0);assert.equal(events[0].sealed!.length,3);assert.equal(projectEventsForPlayer([{type:'cards_drawn',player:0,cards:sealed}],1,g)[0].cards,undefined);
 const html=renderToStaticMarkup(createElement(SealedCard,{ko:'학교'}));assert.ok(html.includes('학교'));assert.ok(!html.includes('школа'));assert.ok(!html.includes('corner'));
});
test('reading allows unlimited errors, reveals feedback, shuffles and resumes the same physical card',()=>{
 let g=begin(drawn(1));const ref=sealedCards(g,0)[0].ref,id=g.learning!.attempts[0]!.id;
 for(let i=0;i<7;i++){const q=g.learning!.attempts[0]!,wrong=q.quiz.options.findIndex(x=>x!==q.quiz.correct);g=reduceLearning(g,{type:'unlock_answer',player:0,challengeId:id,option:wrong});assert.equal(unlockView(g,0)!.correct,q.quiz.correct);const previous=[...q.quiz.options];g=reduceLearning(g,{type:'unlock_close',player:0,challengeId:id});g=reduceLearning(g,{type:'unlock_begin',player:0,ref});assert.equal(g.learning!.attempts[0]!.id,id);g=reduceLearning(g,{type:'unlock_continue',player:0,challengeId:id},()=>.999);assert.notDeepEqual(g.learning!.attempts[0]!.quiz.options,previous);}
 const before=total(g).map(c=>c.id).sort(),deck=g.deck.length;g=correct(g,()=>.9);assert.equal(g.learning!.seals[g.learning!.attempts[0]!.cardId].errors,7);assert.equal(unlockView(g,0)!.firstCorrect,false);assert.equal(sealedCards(g,0).length,0);assert.equal(g.deck.length,deck);assert.deepEqual(total(g).map(c=>c.id).sort(),before);
});
test('reward check is once per physical card; 0/25%/pool exhaustion do not alter normal cards',()=>{
 for(const random of [()=>0,()=>.249,()=>.25,()=>1]){let g=begin(drawn(1));const before=g.magicPool!.length;g=correct(g,random);assert.equal(g.magicPool!.length,before-(random()<.25?1:0));const next=correct(g,()=>0);assert.equal(next,g);assert.equal(normalCount(g.hands[0]),6);}
 let g=begin(drawn(1));g.magicPool=[];g=correct(g,()=>0);assert.equal(sealedCards(g,0).length,0);assert.equal(g.hands[0].filter(c=>c.spell).length,0);
});
test('unlock is owner-bound, works while waiting, never removes Ghost, and bot opens all locks without deadlock',()=>{
 let g=drawn(3);const ref=sealedCards(g,0)[0].ref;assert.equal(reduceLearning(g,{type:'unlock_begin',player:1,ref}),g);g.attacker=1;g=begin(g);const c=g.learning!.attempts[0]!.cardId;g.effects.push({id:'ghost',kind:'ghost_thief',name:'Ghost',description:'',duration:{type:'event',event:'ghost-release',label:''},modifier:{},lockedCardId:c,target:0});g=correct(g);assert.equal(isStudyLocked(g,g.hands[0].find(x=>x.id===c)!),false);assert.ok(isGhostLocked(g,g.hands[0].find(x=>x.id===c)!));assert.ok(isLocked(g,g.hands[0].find(x=>x.id===c)!));
 g=createGame();g.discard.push(...g.hands[1]);g.hands[1]=[];drawToSix(g,1,()=>0);for(let i=0;i<6;i++){const a=botAction(g)!;assert.equal(a.type,'unlock_bot');g=applyLocalAction(g,a,{});}assert.equal(sealedCards(g,1).length,0);
});
function audio(){const g=createGame(()=>.4);g.attacker=0;const c=g.magicPool!.find(c=>c.spell==='mirror')!;g.magicPool=g.magicPool!.filter(x=>x.id!==c.id);g.hands[0].push(c);const b=beginMagicChallenge(g,createChallengeBook(),0,c.id,'audio-id',[],()=>.2);return {g,b,c};}
test('listening succeeds on attempts 1/2/3; first two errors never reveal key or consume magic',()=>{
 for(const failures of [0,1,2]){let {g,b,c}=audio();for(let i=0;i<failures;i++){const q=b.attempts[0]!.quiz,r=answerMagicChallenge(g,b,0,'audio-id',q.options.findIndex(x=>x!==q.correct));b=r.book;assert.equal(r.game,g);const pub=publicQuiz(b.attempts[0]!);assert.equal(pub.prompt,'');assert.equal(pub.mode,'listening');assert.equal('correct' in pub,false);assert.equal(pub.options.length,4);}
 const q=b.attempts[0]!.quiz,result=answerMagicChallenge(g,b,0,'audio-id',q.options.indexOf(q.correct));assert.ok(result.game.inverted);assert.ok(result.game.magic.includes(c.id));}
});
test('listening cancellation/serialization preserves errors across other activations; third error burns once',()=>{
 let {g,b,c}=audio();const q=b.attempts[0]!.quiz,wrong=q.options.findIndex(x=>x!==q.correct);b=answerMagicChallenge(g,b,0,'audio-id',wrong).book;b=cancelMagicChallenge(b,0,'audio-id');assert.equal(b.attempts[0]!.phase,'paused');b=JSON.parse(JSON.stringify(b));b=beginMagicChallenge(g,b,0,c.id,'another-id');assert.equal(b.attempts[0]!.id,'audio-id');assert.equal(b.attempts[0]!.errors,1);b=answerMagicChallenge(g,b,0,'audio-id',wrong).book;const result=answerMagicChallenge(g,b,0,'audio-id',wrong);assert.ok(result.game.magic.includes(c.id));assert.ok(!result.game.inverted);assert.equal(answerMagicChallenge(result.game,result.book,0,'audio-id',wrong).game,result.game);
 const html=renderToStaticMarkup(createElement(AudioQuestion,{id:'a',audioText:'학교',options:['школа','дом','еда','друг'],attemptsLeft:2,disabled:false,onAnswer:()=>{}}));assert.ok(!html.includes('학교'));assert.ok(html.includes('Прослушать'));
});
