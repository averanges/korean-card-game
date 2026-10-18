import {botAction} from './bot';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicQuiz,quizAnswer} from './magicQuiz';
import {chooseBotMagic,evaluateMagic} from './botMagic';
import {createGame,reduceGame,type Card} from './engine';
import {words} from './words';
const card=(id:string,rank=0,suit=0,spell?:string):Card=>({id,rank,suit,spell,word:words[0]});
test('both quiz directions use only unique in-party answers and avoid recent words',()=>{
 for(const direction of ['ko-ru','ru-ko']){
  const quiz=makeMagicQuiz(words,[words[0].ko],()=>direction==='ko-ru'?.1:.8)!;
  assert.equal(quiz.direction,direction);assert.notEqual(words[quiz.index].ko,words[0].ko);
  assert.equal(quiz.options.length,4);assert.equal(new Set(quiz.options).size,4);
  assert.equal(quiz.options.filter(x=>x===quiz.correct).length,1);
  assert.ok(quiz.options.every(x=>words.some(w=>w[direction==='ko-ru'?'ru':'ko']===x)));
 }
});
test('ambiguous prompts excluded, small dictionaries fall back without external words',()=>{
 const dictionary=[{ko:'집',ru:'дом'},{ko:'주택',ru:'дом'},{ko:'물',ru:'вода'}];
 assert.equal(quizAnswer(dictionary,0,'ru-ko'),undefined);
 const quiz=makeMagicQuiz(dictionary,[],()=>.8)!;assert.equal(quiz.prompt,'вода');
 assert.equal(makeMagicQuiz([{ko:'물',ru:'вода'}])!.options.length,1);
 const ambiguous=[{ko:'a',ru:'x'},{ko:'a',ru:'y'},{ko:'b',ru:'x'},{ko:'b',ru:'y'}];
 assert.equal(makeMagicQuiz(ambiguous),undefined);
});
test('reverse answer activates, wrong burns, invalid quiz and duplicate activation preserve state',()=>{
 const g=createGame();g.attacker=0;g.hands[0]=[card('keep'),card('mirror',0,0,'mirror')];
 const a={type:'magic' as const,player:0 as const,id:'mirror',question:0,direction:'ru-ko' as const,answer:words[0].ko};
 const next=reduceGame(g,a);assert.ok(next.inverted);assert.equal(reduceGame(next,a),next);
 const wrong=reduceGame(g,{...a,answer:'wrong'});assert.equal(wrong.hands[0].length,1);assert.equal(wrong.inverted,false);assert.equal(wrong.deck.length,g.deck.length);
 const ambiguous={...g,dictionary:[{ko:'집',ru:'дом'},{ko:'주택',ru:'дом'}]};
 assert.equal(reduceGame(ambiguous,a),ambiguous);
 assert.equal(g.hands[0].length,2); // Generating/cancelling a quiz never reduces the game.
 makeMagicQuiz(g.dictionary!);assert.equal(g.hands[0].length,2);
});
test('bot saves magic on opening draw and while waiting; uses selected Fate before defense',()=>{
 const g=createGame();g.attacker=1;g.trump=3;g.baseTrump=3;
 const fate=card('fate',0,0,'fate');g.hands[1]=[fate,card('s1',1,0),card('s2',2,0),card('s3',3,0)];
 assert.equal(chooseBotMagic(g,()=>0),undefined);assert.equal(botAction(g)?.type,'attack');
 g.table=[{attack:card('attack',8,1)}];assert.equal(chooseBotMagic(g,()=>0),undefined);
 g.attacker=0;
 const action=chooseBotMagic(g,()=>0)!;assert.equal(action.type,'magic');
 if(action.type!=='magic')throw Error('Expected magic');assert.equal(action.trump,0);
 const next=reduceGame(g,action);assert.equal(next.trump,0);assert.equal(reduceGame(next,action),next);
 assert.equal(botAction(next)?.type,'defend');
 assert.equal(evaluateMagic({...g,inverted:true},card('mirror',0,0,'mirror')).utility,0);
});
test('Chance is saved near victory and used to extend a losing late game',()=>{
 const g=createGame();g.attacker=0;g.deck=[];g.table=[{attack:card('attack')}];g.discard=Array.from({length:12},(_,i)=>card('d'+i));
 const chance=card('chance',0,0,'chance');g.hands[1]=[chance,card('close')];
 assert.equal(evaluateMagic(g,chance).utility,0);
 g.hands[1]=[chance,...Array.from({length:7},(_,i)=>card('b'+i))];g.hands[0]=[card('p')];
 assert.ok(evaluateMagic(g,chance).utility>=2);
});
