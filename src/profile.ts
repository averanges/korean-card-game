import {basicDeck,BASIC_DECK,RANDOM_DECK,validateDeck,normalized,type WordDeck} from './decks';
export const PROFILE_KEY='hangul-profile:v1';
export interface Preferences {translations:boolean;speech:boolean;reducedMotion:boolean}
export interface GuestProfile {version:1;guestPlayerId:string;name:string;selectedDeckId:string;decks:WordDeck[];settings:Preferences}
export const defaultPreferences:Preferences={translations:true,speech:true,reducedMotion:false};
const id=(v:unknown):v is string=>typeof v==='string'&&/^[\w-]{1,80}$/.test(v);
export function newProfile():GuestProfile{return {version:1,guestPlayerId:crypto.randomUUID(),name:'Гость',selectedDeckId:BASIC_DECK,decks:[],settings:{...defaultPreferences}};}
export function checkProfile(value:unknown):GuestProfile {
 const p=value as GuestProfile;
 if(!p||p.version!==1||!id(p.guestPlayerId)||typeof p.name!=='string'||!normalized(p.name)||normalized(p.name).length>32||!Array.isArray(p.decks)||p.decks.length>30||!p.settings||!Object.keys(defaultPreferences).every(k=>typeof p.settings[k as keyof Preferences]==='boolean'))throw Error('Некорректный профиль.');
 const ids=new Set<string>();
 const decks=p.decks.map(d=>{if(!d||!id(d.id)||d.id===BASIC_DECK||d.id===RANDOM_DECK||ids.has(d.id)||d.builtin!==false||typeof d.createdAt!=='string'||typeof d.updatedAt!=='string'||!Number.isFinite(Date.parse(d.createdAt))||!Number.isFinite(Date.parse(d.updatedAt)))throw Error('Некорректная сохранённая колода.');ids.add(d.id);const safe=validateDeck(d);if(safe.words.length!==d.words.length||!d.words.every(w=>id(w.id))||new Set(d.words.map(w=>w.id)).size!==d.words.length)throw Error('Некорректные строки колоды.');return {...safe,id:d.id,builtin:false,createdAt:d.createdAt,updatedAt:d.updatedAt,words:safe.words.map((w,i)=>({...w,id:d.words[i].id}))};});
 return {version:1,guestPlayerId:p.guestPlayerId,name:normalized(p.name),selectedDeckId:p.selectedDeckId===RANDOM_DECK||ids.has(p.selectedDeckId)?p.selectedDeckId:BASIC_DECK,decks,settings:{translations:p.settings.translations,speech:p.settings.speech,reducedMotion:p.settings.reducedMotion}};
}
export function readProfile():{profile:GuestProfile;error?:string}{
 try{const raw=localStorage.getItem(PROFILE_KEY);if(raw)return {profile:checkProfile(JSON.parse(raw))};const profile=newProfile();localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));return {profile};}
 catch{return {profile:newProfile(),error:'Не удалось прочитать или сохранить профиль. Существующая запись не перезаписана; сохраните нужные данные перед закрытием браузера.'};}
}
export function writeProfile(profile:GuestProfile){const safe=checkProfile(profile);try{localStorage.setItem(PROFILE_KEY,JSON.stringify(safe));}catch{throw Error('Браузер не сохранил изменения. Освободите место или разрешите локальное хранилище. Прежние данные сохранены.');}return safe;}
export function putDeck(profile:GuestProfile,draft:WordDeck){
 if(draft.builtin||draft.id===BASIC_DECK)throw Error('Создайте копию встроенной колоды.');
 const next={...profile,decks:[...profile.decks.filter(d=>d.id!==draft.id),draft]};return checkProfile(next);
}
export function deleteDeck(profile:GuestProfile,deckId:string){if(deckId===BASIC_DECK)throw Error('Нельзя удалить встроенную колоду.');return {...profile,decks:profile.decks.filter(d=>d.id!==deckId),selectedDeckId:profile.selectedDeckId===deckId?BASIC_DECK:profile.selectedDeckId};}
export function duplicateDeck(deck:WordDeck=basicDeck):WordDeck{const date=new Date().toISOString();return {...deck,id:crypto.randomUUID(),name:(deck.name+' — копия').slice(0,60),builtin:false,words:deck.words.map(w=>({...w,id:crypto.randomUUID()})),createdAt:date,updatedAt:date};}
