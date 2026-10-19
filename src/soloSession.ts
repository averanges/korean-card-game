import type {Game,Card} from './engine';
import type {ChallengeBook} from './game-core/challenges';
import type {BotMemory} from './bot';
import type {QuizDirection} from './magicQuiz';
export interface SoloSession {version:1;game:Game;book:ChallengeBook;memory:BotMemory;recent:string[];spell?:string;result?:{card:Card;correct:boolean;simple:boolean;question:number;direction:QuizDirection;answer:string};fate?:{card:Card;question:number;direction:QuizDirection;answer:string;current:number;selected?:number};hat?:{card:Card;question:number;direction:QuizDirection;answer:string}}
const key=(guest:string)=>'hangul-solo:v1:'+guest;
function valid(value:unknown):value is SoloSession {
 const s=value as SoloSession,g=s?.game;if(s?.version!==1||!g||![0,1].includes(g.attacker)||!Array.isArray(g.hands)||g.hands.length!==2||!g.hands.every(Array.isArray)||![g.deck,g.discard,g.table,g.effects,g.magic].every(Array.isArray)||!s.book||!Array.isArray(s.book.attempts)||s.book.attempts.length!==2||!Array.isArray(s.book.usedIds)||!Array.isArray(s.recent)||!s.memory)return false;
 const card=(c:Card)=>c&&typeof c.id==='string'&&typeof c.word?.ko==='string'&&typeof c.word?.ru==='string'&&Number.isInteger(c.rank)&&Number.isInteger(c.suit)&&(c.spell?['mirror','chance','fate','ghost_thief','trick_gift','monkey_prank','magicians_hat'].includes(c.spell):c.rank>=0&&c.rank<=8&&c.suit>=0&&c.suit<=3);
 const all=[...g.hands.flat(),...g.deck,...g.discard,...g.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack]),...(g.magicPool||[])];
 if(!all.every(card)||new Set(all.map(c=>c.id)).size!==all.length)return false;
 if(!g.effects.every(e=>e&&typeof e.kind==='string'&&e.duration&&typeof e.duration.type==='string'&&e.modifier&&typeof e.modifier==='object'))return false;
 if(g.learning){if(g.learning.version!==1||!g.learning.seals||!Array.isArray(g.learning.attempts)||g.learning.attempts.length!==2)return false;for(const seal of Object.values(g.learning.seals))if(!seal||typeof seal.ref!=='string'||typeof seal.locked!=='boolean'||typeof seal.rewardChecked!=='boolean'||!Number.isInteger(seal.errors))return false;}
 const quiz=(q:any)=>q&&Number.isInteger(q.index)&&['ko-ru','ru-ko'].includes(q.direction)&&typeof q.prompt==='string'&&typeof q.correct==='string'&&Array.isArray(q.options)&&q.options.every((o:unknown)=>typeof o==='string');
 for(const c of [...s.book.attempts,...Object.values(s.book.sessions||{}),...(g.learning?.attempts||[])])if(c&&(!quiz(c.quiz)||typeof c.id!=='string'||typeof c.cardId!=='string'))return false;
 if((s.result&&!card(s.result.card))||(s.fate&&!card(s.fate.card))||(s.hat&&!card(s.hat.card)))return false;
 return true;
}
export function readSoloSession(guest:string,storage:Pick<Storage,'getItem'>=localStorage):SoloSession|undefined {try{const raw=storage.getItem(key(guest));if(!raw)return;const saved=JSON.parse(raw);return valid(saved)?saved:undefined;}catch{return;}}
export function writeSoloSession(guest:string,value:SoloSession,storage:Pick<Storage,'setItem'>=localStorage):boolean {try{storage.setItem(key(guest),JSON.stringify(value));return true;}catch{return false;}}
