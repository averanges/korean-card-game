import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,drawToSix} from './engine';
import {magicDropSettings,awardMagic} from './magicDrops';
import {animationEvents} from './animationModel';
import {sealedCards,reduceLearning} from './learning';
test('refill never awards random magic; locks occupy the ordinary cards drawn',()=>{
 const g=createGame();assert.equal(g.magicPool?.length,11);assert.equal(sealedCards(g,0).length,0);g.discard.push(...g.hands[0]);g.hands[0]=[];drawToSix(g,0,()=>0);
 assert.equal(g.hands[0].length,6);assert.equal(sealedCards(g,0).length,6);assert.equal(g.magicPool?.length,11);
});
test('learning awards can exceed three, without replacing normal cards or exceeding finite pool',()=>{
 let g=createGame();g.discard.push(...g.hands[0]);g.hands[0]=[];drawToSix(g,0,()=>0);
 for(const seal of sealedCards(g,0)){g=reduceLearning(g,{type:'unlock_begin',player:0,ref:seal.ref},()=>0);const q=g.learning!.attempts[0]!;g=reduceLearning(g,{type:'unlock_answer',player:0,challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)},()=>0);}
 assert.equal(g.hands[0].filter(c=>!c.spell).length,6);assert.equal(g.hands[0].filter(c=>c.spell).length,6);assert.equal(g.magicPool?.length,5);
});
test('legendary rewards retain their lower weight, and reward animations originate at unlocked card',()=>{
 const g=createGame(),normal=g.hands[0][0];g.magicPool=[{...normal,id:'legend',spell:'mirror'},{...normal,id:'major',spell:'ghost_thief'}];
 assert.ok(magicDropSettings.legendaryWeight<magicDropSettings.majorWeight);awardMagic(g,0,()=>.3);assert.equal(g.hands[0].at(-1)!.id,'major');
 let before=createGame();before.discard.push(...before.hands[0]);before.hands[0]=[];drawToSix(before,0,()=>0);const ref=sealedCards(before,0)[0].ref;before=reduceLearning(before,{type:'unlock_begin',player:0,ref},()=>0);const q=before.learning!.attempts[0]!,action={type:'unlock_answer' as const,player:0 as const,challengeId:q.id,option:q.quiz.options.indexOf(q.quiz.correct)};const after=reduceLearning(before,action,()=>0);const events=animationEvents(before,after,action);
 assert.ok(events.some(e=>e.type==='card_unlocked'&&e.sourceRef===ref));assert.ok(events.some(e=>e.type==='magic_received'&&e.sourceRef===ref&&e.duration>=1800));
});
