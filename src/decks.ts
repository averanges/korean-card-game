import {words,type Word} from './words';
export const BASIC_DECK='builtin-basic',RANDOM_DECK='random',MAX_WORDS=200;
export interface DeckWord extends Word {id:string}
export interface WordDeck {id:string;name:string;words:DeckWord[];createdAt:string;updatedAt:string;builtin:boolean}
export interface DeckSnapshot {name:string;words:Word[]}
export interface DeckInfo {name:string;wordCount:number;sourceCount:number}
export const basicDeck:WordDeck={id:BASIC_DECK,name:'Базовые слова',words:words.map((w,i)=>({...w,id:`basic-${i}`})),createdAt:'2026-10-17T00:00:00.000Z',updatedAt:'2026-10-17T00:00:00.000Z',builtin:true};
export const normalized=(text:string)=>text.normalize('NFC').trim().replace(/\s+/g,' ');
const key=(text:string)=>normalized(text).toLocaleLowerCase('ru');
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validateDeck(value:unknown):DeckSnapshot {
 if(!object(value)||typeof value.name!=='string'||!Array.isArray(value.words))throw Error('Некорректный формат колоды.');
 const name=normalized(value.name);if(!name||name.length>60)throw Error('Название должно содержать от 1 до 60 символов.');
 const rows:Word[]=[];
 for(const entry of value.words){
  if(!object(entry)||typeof entry.ko!=='string'||typeof entry.ru!=='string')throw Error('В каждой строке нужны корейское слово и перевод.');
  const ko=normalized(entry.ko),ru=normalized(entry.ru);if(!ko&&!ru)continue;
  if(!ko||!ru)throw Error('Заполните обе ячейки или удалите незавершённую строку.');
  if(ko.length>80||ru.length>120)throw Error('Корейское слово — до 80 символов, перевод — до 120.');
  if(/[\p{Cc}\p{Cf}]/u.test(ko+ru+name))throw Error('Уберите управляющие символы из текста.');
  rows.push({ko,ru});
 }
 if(rows.length<9)throw Error(`Нужно минимум 9 слов. Добавьте ещё ${9-rows.length}.`);
 if(rows.length>MAX_WORDS)throw Error(`В колоде может быть не более ${MAX_WORDS} слов.`);
 const pairs=new Set<string>(),ko=new Set<string>(),ru=new Set<string>();
 for(const w of rows){const pair=JSON.stringify([key(w.ko),key(w.ru)]);if(pairs.has(pair))throw Error('Удалите повторяющиеся пары слов.');pairs.add(pair);ko.add(key(w.ko));ru.add(key(w.ru));}
 // One-to-one values ensure every sampled 36-word subset can form unambiguous quizzes in both directions.
 if(ko.size!==rows.length||ru.size!==rows.length)throw Error('Корейские слова и русские переводы должны различаться: одинаковые значения делают задания неоднозначными.');
 return {name,words:rows};
}
export function snapshotDeck(deck:WordDeck):DeckSnapshot{return validateDeck(deck);}
export function mix<T>(items:readonly T[],random:()=>number){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function distributeWords(input:readonly Word[],random:()=>number){
 const pool=mix(input,random).slice(0,36).map(w=>({...w}));
 if(pool.length<9)throw Error('Для партии нужно не менее 9 слов.');
 const assigned=Array.from({length:36},(_,i)=>({...pool[i%pool.length]}));
 return {dictionary:pool,assigned:mix(assigned,random)};
}
export function resolveDeck(selectedId:string,decks:readonly WordDeck[],random=Math.random):DeckSnapshot {
 const valid=[basicDeck,...decks].flatMap(d=>{try{return [snapshotDeck(d)];}catch{return [];}});
 return selectedId===RANDOM_DECK?valid[Math.floor(random()*valid.length)]:snapshotDeck([basicDeck,...decks].find(d=>d.id===selectedId)??basicDeck);
}
