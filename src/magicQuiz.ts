import type {Word} from './words';

export type QuizDirection='ko-ru'|'ru-ko';
export interface MagicQuiz {index:number;direction:QuizDirection;prompt:string;correct:string;options:string[]}
const key=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const fields=(direction:QuizDirection)=>direction==='ko-ru'?['ko','ru'] as const:['ru','ko'] as const;
export function quizAnswer(dictionary:Word[],index:number,direction:QuizDirection='ko-ru'):string|undefined {
 const word=dictionary[index];if(!word)return;
 const [from,to]=fields(direction),prompt=key(word[from]);
 if(!prompt||!key(word[to]))return;
 const matches=new Set(dictionary.filter(w=>key(w[from])===prompt).map(w=>key(w[to])));
 return matches.size===1?word[to]:undefined;
}
export function makeMagicQuiz(dictionary:Word[],recent:string[]=[],random=Math.random):MagicQuiz|undefined {
 const preferred:QuizDirection=random()<.5?'ko-ru':'ru-ko';
 for(const direction of [preferred,preferred==='ko-ru'?'ru-ko':'ko-ru'] as QuizDirection[]){
  const [from,to]=fields(direction);
  const candidates=dictionary.map((word,index)=>({word,index,correct:quizAnswer(dictionary,index,direction)})).filter(c=>c.correct!==undefined);
  const fresh=candidates.filter(c=>!recent.includes(key(c.word.ko)));
  const pool=fresh.length?fresh:candidates;if(!pool.length)continue;
  const {word,index,correct}=pool[Math.floor(random()*pool.length)];
  const alternatives=[...new Map(dictionary.filter(w=>key(w[to])&&key(w[to])!==key(correct!)).map(w=>[key(w[to]),w[to]])).values()];
  const mix=<T,>(values:T[])=>{const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
  return {index,direction,prompt:word[from],correct:correct!,options:mix([correct!,...mix(alternatives).slice(0,3)])};
 }
}
export const quizWordKey=(word:Word)=>key(word.ko);
