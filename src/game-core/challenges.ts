import {gameDictionary,reduceGame,type Game,type Player,type Action} from '../engine';
import {magicUnavailable,hatTargets} from '../trickRules';
import {makeMagicQuiz,type MagicQuiz} from '../magicQuiz';

export interface PublicQuiz {challengeId:string;direction:MagicQuiz['direction'];prompt:string;options:string[]}
export interface MagicChallenge {id:string;player:Player;cardId:string;magicKind?:string;quiz:MagicQuiz;phase:'question'|'target'|'resolved'|'cancelled';outcome?:'correct'|'wrong'|'unavailable'}
export interface ChallengeBook {attempts:[MagicChallenge|undefined,MagicChallenge|undefined];usedIds:string[]}
export const createChallengeBook=():ChallengeBook=>({attempts:[undefined,undefined],usedIds:[]});
const validPlayer=(p:Player)=>p===0||p===1;
export function publicQuiz(c:MagicChallenge):PublicQuiz{return {challengeId:c.id,direction:c.quiz.direction,prompt:c.quiz.prompt,options:[...c.quiz.options]};}
export function beginMagicChallenge(g:Game,book:ChallengeBook,p:Player,cardId:string,id:string,recent:string[]=[],random=Math.random):ChallengeBook {
 if(!validPlayer(p)||!id||book.usedIds.includes(id))return book;
 const pending=book.attempts[p],c=g.hands[p].find(c=>c.id===cardId);
 if(pending&&['question','target'].includes(pending.phase)||!c?.spell||magicUnavailable(g,p,c.spell))return book;
 const quiz=makeMagicQuiz(gameDictionary(g),recent,random);if(!quiz)return book;
 const next=structuredClone(book);next.usedIds.push(id);next.attempts[p]={id,player:p,cardId,magicKind:c.spell,quiz,phase:'question'};return next;
}
export function cancelMagicChallenge(book:ChallengeBook,p:Player,id:string):ChallengeBook {
 if(!validPlayer(p))return book;const c=book.attempts[p];if(!c||c.id!==id||c.phase!=='question')return book;
 const next=structuredClone(book);next.attempts[p]!.phase='cancelled';return next;
}
export interface ChallengeTransition {game:Game;book:ChallengeBook;action?:Action}
/** Pure transition: the caller owns and persists the current book; no room-wide pause. */
export function answerMagicChallenge(g:Game,book:ChallengeBook,p:Player,id:string,option:number,random=Math.random):ChallengeTransition {
 const unchanged={game:g,book};if(!validPlayer(p))return unchanged;
 const c=book.attempts[p];if(!c||c.id!==id||c.phase!=='question'||!Number.isInteger(option)||option<0||option>=c.quiz.options.length)return unchanged;
 const next=structuredClone(book),attempt=next.attempts[p]!,card=g.hands[p].find(card=>card.id===c.cardId);
 // Another player's legal move may have invalidated the opportunity meanwhile.
 if(!card?.spell||magicUnavailable(g,p,card.spell)){attempt.phase='resolved';attempt.outcome='unavailable';return {game:g,book:next};}
 const answer=c.quiz.options[option],correct=answer===c.quiz.correct;
 attempt.outcome=correct?'correct':'wrong';
 if(correct&&['fate','magicians_hat'].includes(card.spell)){attempt.phase='target';return {game:g,book:next};}
 const action:Action={type:'magic',player:p,id:c.cardId,question:c.quiz.index,direction:c.quiz.direction,answer};
 const game=reduceGame(g,action,random);attempt.phase='resolved';if(game===g)attempt.outcome='unavailable';
 return {game,book:next,action:game===g?undefined:action};
}
export function chooseMagicTarget(g:Game,book:ChallengeBook,p:Player,id:string,target:{trump?:number;cardId?:string},random=Math.random):ChallengeTransition {
 const unchanged={game:g,book};if(!validPlayer(p))return unchanged;
 const c=book.attempts[p];if(!c||c.id!==id||c.phase!=='target')return unchanged;
 const next=structuredClone(book),attempt=next.attempts[p]!,card=g.hands[p].find(card=>card.id===c.cardId);
 if(!card?.spell||magicUnavailable(g,p,card.spell)){attempt.phase='resolved';attempt.outcome='unavailable';return {game:g,book:next};}
 if(card.spell==='magicians_hat'&&!hatTargets(g,p).some(c=>c.id===target.cardId))return unchanged;
 const action:Action={type:'magic',player:p,id:c.cardId,question:c.quiz.index,direction:c.quiz.direction,answer:c.quiz.correct,trump:target.trump,targetId:target.cardId};
 const game=reduceGame(g,action,random);if(game===g)return unchanged;
 attempt.phase='resolved';return {game,book:next,action};
}
