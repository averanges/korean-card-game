import type {Card,Game,Player} from './engine';
import {awardMagic} from './magicDrops';
import {quizAnswer,type MagicQuiz} from './magicQuiz';

export const learningSettings={LOCK_CHANCE:.40,MAGIC_REWARD_CHANCE:.25,LISTENING_ATTEMPTS:3};
export interface LearningSeal {ref:string;locked:boolean;rewardChecked:boolean;errors:number;firstCorrect?:boolean;unlocked:boolean}
export interface UnlockAttempt {id:string;cardId:string;ref:string;quiz:MagicQuiz;phase:'question'|'feedback'|'success';closed:boolean;picked?:string}
export interface LearningState {version:1;serial:number;seals:Record<string,LearningSeal>;attempts:[UnlockAttempt|undefined,UnlockAttempt|undefined]}
export interface SealedCardView {ref:string;ko:string}
export interface UnlockView {id:string;ref:string;ko:string;options:string[];phase:UnlockAttempt['phase'];closed:boolean;picked?:string;correct?:string;errors:number;firstCorrect?:boolean}
export type LearningAction={type:'unlock_begin';player:Player;ref:string}|{type:'unlock_answer';player:Player;challengeId:string;option:number}|{type:'unlock_continue'|'unlock_close';player:Player;challengeId:string}|{type:'unlock_bot';player:Player;ref:string};
export const createLearningState=():LearningState=>({version:1,serial:0,seals:{},attempts:[undefined,undefined]});
export const isStudyLocked=(g:Game,c:Card)=>!!g.learning?.seals[c.id]?.locked;
export function sealedCards(g:Game,p:Player):SealedCardView[]{return g.hands[p].filter(c=>!c.spell&&isStudyLocked(g,c)).map(c=>({ref:g.learning!.seals[c.id].ref,ko:c.word.ko}));}
const token=(state:LearningState,random:()=>number)=>'study-'+(++state.serial)+'-'+Array.from({length:4},()=>Math.floor(random()*4294967296).toString(36)).join('-');
function mix<T>(values:T[],random:()=>number){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function readingQuiz(dictionary:readonly Card['word'][],card:Card,random=Math.random):MagicQuiz|undefined {
 const index=dictionary.findIndex(w=>w.ko===card.word.ko&&w.ru===card.word.ru);
 if(index<0||quizAnswer([...dictionary],index,'ko-ru')===undefined)return;
 const alternatives=[...new Set(dictionary.map(w=>w.ru))].filter(s=>s!==card.word.ru);
 if(alternatives.length<3)return;
 return {index,direction:'ko-ru',prompt:card.word.ko,correct:card.word.ru,options:mix([card.word.ru,...mix(alternatives,random).slice(0,3)],random)};
}
/** Called only for post-deal ordinary replenishment, never for taken/Gift/Hat cards. */
export function sealDraw(g:Game,c:Card,random=Math.random){
 const state=g.learning;if(!state||c.spell||random()>=learningSettings.LOCK_CHANCE)return;
 if(!readingQuiz(g.dictionary||[],c,()=>.5))return;
 const previous=state.seals[c.id];state.seals[c.id]={ref:token(state,random),locked:true,rewardChecked:previous?.rewardChecked??false,errors:previous?.errors??0,firstCorrect:previous?.firstCorrect,unlocked:previous?.unlocked??false};
}
function unlock(g:Game,p:Player,c:Card,random:()=>number){
 const seal=g.learning!.seals[c.id];if(!seal.locked)return;
 seal.locked=false;seal.unlocked=true;
 if(!seal.rewardChecked){seal.rewardChecked=true;if(random()<learningSettings.MAGIC_REWARD_CHANCE)awardMagic(g,p,random);}
}
/** Same pure reducer for local play and the Durable Object transaction. */
export function reduceLearning(state:Game,action:LearningAction,random=Math.random):Game {
 if(!state.learning||state.winner||![0,1].includes(action.player))return state;
 const g=structuredClone(state),learning=g.learning!,p=action.player;
 if(action.type==='unlock_begin'||action.type==='unlock_bot'){
  const card=g.hands[p].find(c=>learning.seals[c.id]?.ref===action.ref&&isStudyLocked(g,c));if(!card)return state;
  if(action.type==='unlock_bot'){unlock(g,p,card,random);return g;}
  const previous=learning.attempts[p];if(previous?.cardId===card.id&&previous.phase!=='success'){previous.closed=false;return g;}
  const quiz=readingQuiz(g.dictionary||[],card,random);if(!quiz)return state;
  learning.attempts[p]={id:token(learning,random),cardId:card.id,ref:action.ref,quiz,phase:'question',closed:false};return g;
 }
 const attempt=learning.attempts[p];if(!attempt||attempt.id!==action.challengeId)return state;
 if(action.type==='unlock_close'){attempt.closed=true;return g;}
 const card=g.hands[p].find(c=>c.id===attempt.cardId);if(!card||!isStudyLocked(g,card)||attempt.closed)return state;
 const seal=learning.seals[card.id];
 if(action.type==='unlock_continue'){
  if(attempt.phase!=='feedback')return state;const old=attempt.quiz.options;attempt.quiz.options=mix(old,random);if(attempt.quiz.options.every((s,i)=>s===old[i]))attempt.quiz.options=[...old.slice(1),old[0]];attempt.phase='question';delete attempt.picked;return g;
 }
 if(action.type!=='unlock_answer'||attempt.phase!=='question'||!Number.isInteger(action.option)||action.option<0||action.option>=4)return state;
 const answer=attempt.quiz.options[action.option],correct=answer===attempt.quiz.correct;
 if(seal.firstCorrect===undefined)seal.firstCorrect=correct;
 attempt.picked=answer;
 if(correct){attempt.phase='success';unlock(g,p,card,random);}else{seal.errors++;attempt.phase='feedback';}
 return g;
}
export function unlockView(g:Game,p:Player):UnlockView|undefined {
 const attempt=g.learning?.attempts[p];if(!attempt)return;
 const seal=g.learning!.seals[attempt.cardId];
 return {id:attempt.id,ref:attempt.ref,ko:attempt.quiz.prompt,options:[...attempt.quiz.options],phase:attempt.phase,closed:attempt.closed,errors:seal.errors,...(seal.firstCorrect===undefined?{}:{firstCorrect:seal.firstCorrect}),...(attempt.phase!=='question'?{picked:attempt.picked,correct:attempt.quiz.correct}:{})};
}
