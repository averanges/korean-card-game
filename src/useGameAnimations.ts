import {createContext,useContext,useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {animationEvents,boundTimeline,initialDrawEvents,legendaryTimings,type AnimationEntry,type CardPosition,type GameAnimationEvent} from './animationModel';
import type {Action,Game} from './engine';

export const AnimationContext=createContext<AnimationEntry[]>([]);
export const useAnimationEntries=()=>useContext(AnimationContext);
export function useCardArrival(id:string){
  const entries=useAnimationEntries();
  const entry=[...entries].reverse().find(e=>(e.type==='cards_drawn'||e.type==='magic_received'||e.type==='cards_taken')&&e.cards.some(c=>c.id===id));
  return entry?{className:'card-arrival',style:{'--arrival-delay':`${entry.type==='cards_taken'?entry.duration:entry.delay}ms`,'--arrival-duration':`${entry.type==='cards_taken'?160:entry.duration}ms`} as CSSProperties}:undefined;
}
export function captureBoard():CardPosition[]{
  return Array.from(document.querySelectorAll<HTMLElement>('[data-board-card]')).flatMap(el=>{
    const rect=el.getBoundingClientRect(),raw=el.dataset.boardCard;
    if(!raw)return [];
    try{return [{card:JSON.parse(raw),x:rect.x+(rect.width-el.offsetWidth)/2,y:rect.y+(rect.height-el.offsetHeight)/2,width:el.offsetWidth,height:el.offsetHeight,rotation:el.closest('.cover')?-9:-3}];}catch{return [];}
  });
}
export function useGameAnimations(simple:boolean){
  const [entries,setEntries]=useState<AnimationEntry[]>([]),serial=useRef(0),epoch=useRef(0),initial=useRef<Game>();
  const seen=useRef(new Set<string>());
  function enqueue(events:GameAnimationEvent[],key?:string){
    if(key&&seen.current.has(key))return;
    if(key)seen.current.add(key);
    if(seen.current.size>256)seen.current.delete(seen.current.values().next().value!);
    const now=Date.now();
    const prepared=boundTimeline(events,simple).map(e=>({...e,id:`${epoch.current}-${++serial.current}`}));
    setEntries(old=>{
      const live=old.filter(e=>e.ends>now);
      let magicEnd=Math.max(now,...live.filter(e=>e.type==='magic_activated'||(e.type==='magic_received'&&e.player===0&&!e.compact)).map(e=>e.created+e.delay+e.duration));
      let receiptEnd=Math.max(now,...live.filter(e=>e.type==='magic_received'&&e.player===0).map(e=>e.ends));
      let castShift=0;
      const next=prepared.map(e=>{
        if(e.type==='magic_received'&&e.player===0&&!simple){const delay=Math.max(e.delay,receiptEnd-now,magicEnd-now);const compact=delay>4000;e={...e,delay:Math.min(delay,4800),duration:compact?500:e.duration,compact};receiptEnd=now+e.delay+e.duration;if(!compact)magicEnd=receiptEnd;}
        if(e.type==='magic_activated'&&!simple){const wait=Math.max(e.delay,magicEnd-now);castShift=wait-e.delay;e={...e,delay:wait};magicEnd=now+e.delay+e.duration;}
        if(e.type==='cards_drawn'&&castShift)e={...e,delay:e.delay+castShift};
        const notice=e.type==='magic_activated'&&['mirror','fate'].includes(e.magicId||'')?Math.max(0,legendaryTimings.notice-e.duration):0;
        return {...e,created:now,ends:now+e.delay+e.duration+(e.type==='cards_taken'?180:notice)};
      });
      return [...live,...next].slice(-48);
    });
  }
  function start(g:Game){if(initial.current===g)return;initial.current=g;epoch.current++;seen.current.clear();setEntries([]);enqueue(initialDrawEvents(g),'initial-'+epoch.current);}
  function transition(before:Game,after:Game,action:Action,positions:CardPosition[],eventId?:string){
    setEntries(old=>old.filter(e=>!['cards_drawn','magic_received'].includes(e.type)||e.cards.some(c=>after.hands[e.player].some(current=>current.id===c.id))));
    const events=animationEvents(before,after,action).map(e=>e.type==='round_defended'||e.type==='cards_taken'?{...e,positions}:e);
    enqueue(events,eventId);
  }
  useEffect(()=>{
    if(!entries.length)return;
    const prune=()=>setEntries(current=>current.filter(e=>e.ends>Date.now()));
    const timer=setTimeout(prune,Math.max(0,Math.min(...entries.map(e=>e.ends))-Date.now())+16);
    const visibility=()=>{if(document.visibilityState==='visible')prune();};
    document.addEventListener('visibilitychange',visibility);
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[entries]);
  useEffect(()=>{if(simple)setEntries([]);},[simple]);
  return {entries,start,transition,enqueue};
}
