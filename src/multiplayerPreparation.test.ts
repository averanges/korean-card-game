import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createGame,reduceGame,beats,type Card,type Game,type Player,type Action} from './engine';
import {applyLocalAction,type BotMemory} from './bot';
import {projectGameForPlayer,projectEventsForPlayer,createProjectionContext,resolveBlindReference} from './game-core/projection';
import {createChallengeBook,beginMagicChallenge,answerMagicChallenge,cancelMagicChallenge,chooseMagicTarget,publicQuiz} from './game-core/challenges';
import {animationEvents} from './animationModel';
const card=(id:string,rank=0,suit=0,spell?:string):Card=>({id,rank,suit,spell,word:{ko:id,ru:id}});
function sample(p:Player=0):Game {const g=createGame(()=>.4);g.attacker=p;g.deck=[card('deck-secret',8,2)];g.hands=[[card('own0')],[card('own1')]];g.magicPool=[];g.table=[];g.effects=[];return g;}
test('core import graph is browser/AI independent; deterministic RNG covers all rules',()=>{
 const seen=new Set<string>();
 const walk=(file:string)=>{if(seen.has(file))return;seen.add(file);const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/from\s*['"][^'"]*(?:bot|react|animation|speech|cloudflare)[^'"]*['"]|\b(?:window|document|localStorage|setTimeout|setInterval)\b/);
  for(const m of source.matchAll(/(?:import|export)[^;]*?from\s*['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))walk(resolve(dirname(file),m[1]+'.ts'));
 };
 walk(resolve('src/game-core/index.ts'));
 assert.deepEqual(createGame(()=>.4),createGame(()=>.4));
});
test('both seats can attack/defend/take/end and all seven spells obey symmetric rules',()=>{
 for(const p of [0,1] as Player[]){
  const other=(1-p) as Player;let g=sample(p);g.hands[p]=[card('attack'),card('keep',4)];g.hands[other]=[card('defense',2),card('otherkeep',4)];
  g=reduceGame(g,{type:'attack',player:p,ids:['attack']});assert.equal(g.table.length,1);
  assert.ok(beats(g.hands[other][0],g.table[0].attack,g));
  const taken=reduceGame(g,{type:'take',player:other});assert.ok(taken.taking);
  g=reduceGame(g,{type:'defend',player:other,id:'defense',target:0});g.magicPool=[];g=reduceGame(g,{type:'end',player:p},()=>.9);assert.equal(g.attacker,other);
  for(const spell of ['mirror','chance','fate','ghost_thief','trick_gift','monkey_prank','magicians_hat']){
   const state=sample(p);state.hands[p].push(card('magic',0,0,spell));state.discard=[card('discard',3)];
   const action:Action={type:'magic',player:p,id:'magic',question:0,answer:state.dictionary![0].ru,trump:(state.trump+1)%4,targetId:state.hands[p][0].id};
   const next=reduceGame(state,action,()=>.2);assert.notEqual(next,state,spell);assert.ok(next.magic.includes('magic'));
   assert.deepEqual(next,reduceGame(state,action,()=>.2));
   assert.equal(reduceGame(next,action),next);
   if(spell==='fate')assert.equal(reduceGame(state,{...action,trump:undefined}),state);
   if(spell==='ghost_thief'||spell==='monkey_prank')assert.equal(next.effects[0].target,other);
   const wrong=reduceGame(state,{...action,answer:'wrong'});assert.ok(wrong.magic.includes('magic'));assert.equal(wrong.effects.length,0);
  }
 }
});
test('PlayerView never includes enemy cards, deck/pool identities, locked references or internal extras',()=>{
 for(const p of [0,1] as Player[]){
  const g=sample(p),other=(1-p) as Player;g.hands[other]=[card('enemy-secret'),card('enemy-magic-secret',0,0,'mirror')];g.magicPool=[card('pool-secret',0,0,'chance')];
  g.effects=[{id:'effect',kind:'ghost_thief',name:'private-name',description:'private-description',target:other,status:'active',lockedCardId:'enemy-secret',expiresRound:2,duration:{type:'event',event:'release',label:'Until round end'},modifier:{}}];
  const view=projectGameForPlayer(g,p),json=JSON.stringify(view);
  for(const secret of ['enemy-secret','enemy-magic-secret','deck-secret','pool-secret','lockedCardId','private-name','private-description','magicPool','dictionary'])assert.ok(!json.includes(secret),secret);
  assert.equal(view.opponent.ordinaryCount,1);assert.equal(view.opponent.magicCount,1);assert.equal(view.opponent.blockedCount,1);
  view.hand.cards.length=0;assert.equal(g.hands[p].length,1);
 }
});
test('blind view uses opaque resolvable references, scoped to the player and current blind attack',()=>{
 const g=sample(0);g.hands[0]=[card('0-8',8,0)];g.effects=[{id:'curse',kind:'monkey_prank',name:'Monkey',description:'Blind',target:0,status:'pending',duration:{type:'event',event:'end',label:'Next attack'},modifier:{}}];
 let serial=0;const context=createProjectionContext(()=>`opaque-${++serial}`),view=projectGameForPlayer(g,0,context);
 assert.ok(view.hand.blind);const json=JSON.stringify(view.hand);for(const key of ['0-8','rank','suit','word'])assert.ok(!json.includes(key));
 const ref=(view.hand.cards[0] as {ref:string}).ref;assert.equal(resolveBlindReference(g,0,ref,context),'0-8');assert.equal(resolveBlindReference(g,1,ref,context),undefined);
 const next=reduceGame(g,{type:'attack',player:0,ids:['0-8']});assert.equal(resolveBlindReference(next,0,ref,context),undefined);
});
test('event projection reveals draws and Hat output only to their owner, but played cards to both',()=>{
 const secret=card('secret-hand-card',8,3);
 for(const owner of [0,1] as Player[]){
  const events=[{type:'cards_drawn' as const,player:owner,cards:[secret],correctAnswer:'private-answer'}, {type:'magic_activated' as const,player:owner,cards:[card('hat',0,0,'magicians_hat')],magicId:'magicians_hat',exchange:{oldCard:card('public-discard'),newCard:secret}}];
  assert.ok(JSON.stringify(projectEventsForPlayer(events,owner)).includes(secret.id));
  const opponentJSON=JSON.stringify(projectEventsForPlayer(events,(1-owner) as Player));assert.ok(!opponentJSON.includes(secret.id));assert.ok(!opponentJSON.includes('private-answer'));assert.ok(opponentJSON.includes('public-discard'));
  assert.ok(projectEventsForPlayer([{type:'card_attack',player:owner,cards:[secret]}],(1-owner) as Player)[0].cards?.length);
 }
});
test('challenges are owner-bound, hide the answer key, resolve once, and do not pause the other player',()=>{
 let g=sample(0);g.hands[0].push(card('magic',0,0,'mirror'));let book=createChallengeBook();book=beginMagicChallenge(g,book,0,'magic','challenge',[],()=>.3);
 const attempt=book.attempts[0]!,pub=publicQuiz(attempt);assert.equal('correct' in pub,false);assert.equal('index' in pub,false);
 assert.equal(answerMagicChallenge(g,book,1,'challenge',0).book,book);
 const whilePending=reduceGame(g,{type:'attack',player:0,ids:['own0']});assert.notEqual(whilePending,g);assert.notEqual(reduceGame(whilePending,{type:'take',player:1}),whilePending);
 assert.equal(cancelMagicChallenge(book,0,'challenge').attempts[0]?.phase,'cancelled');assert.ok(g.hands[0].some(c=>c.id==='magic'));
 const result=answerMagicChallenge(g,book,0,'challenge',attempt.quiz.options.indexOf(attempt.quiz.correct));assert.ok(result.game.inverted);
 assert.equal(answerMagicChallenge(result.game,result.book,0,'challenge',0).game,result.game);
 assert.equal(cancelMagicChallenge(result.book,0,'challenge'),result.book);
 const g2=sample(0);g2.hands[0].push(card('fate',0,0,'fate'));let b=beginMagicChallenge(g2,createChallengeBook(),0,'fate','fate-q',[],()=>.3);const q=b.attempts[0]!.quiz;
 const awaiting=answerMagicChallenge(g2,b,0,'fate-q',q.options.indexOf(q.correct));b=awaiting.book;assert.equal(b.attempts[0]?.phase,'target');assert.equal(cancelMagicChallenge(b,0,'fate-q'),b);
 const resolved=chooseMagicTarget(g2,b,0,'fate-q',{trump:(g2.trump+1)%4});assert.notEqual(resolved.game,g2);assert.equal(chooseMagicTarget(resolved.game,resolved.book,0,'fate-q',{trump:0}).game,resolved.game);
 const both=sample(0);both.table=[{attack:card('table')}];both.hands[0].push(card('m0',0,0,'mirror'));both.hands[1].push(card('m1',0,0,'mirror'));
 let independent=beginMagicChallenge(both,createChallengeBook(),0,'m0','q0',[],()=>.3);independent=beginMagicChallenge(both,independent,1,'m1','q1',[],()=>.3);
 assert.ok(independent.attempts.every(c=>c?.phase==='question'));
 const q1=independent.attempts[1]!.quiz,wrongIndex=q1.options.findIndex(x=>x!==q1.correct);
 const failed=answerMagicChallenge(both,independent,1,'q1',wrongIndex);assert.ok(failed.game.magic.includes('m1'));assert.equal(failed.book.attempts[0]?.phase,'question');assert.equal(failed.game.inverted,false);
});
test('local bot memory remains outside the rules and existing animation events can be projected',()=>{
 const g=sample(1);g.hands[1].push(card('mirror',0,0,'mirror'));const memory:BotMemory={};const action:Action={type:'magic',player:1,id:'mirror',question:0,answer:g.dictionary![0].ru};
 const next=applyLocalAction(g,action,memory);assert.equal(memory.magicUsedRound,0);assert.equal('botMagicUsed' in next,false);assert.ok(projectEventsForPlayer(animationEvents(g,next,action),0).length);
});
