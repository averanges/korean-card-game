import {legendaryTimings} from './animationModel';
import {useEffect,useState,useId,type CSSProperties} from 'react';
import {suits} from './engine';
import {useAnimationEntries} from './useGameAnimations';

/** Only the displayed number changes; the deck is always the engine's snapshot. */
export function MagicStatus({trump,count,simple}:{trump:number;count:number;simple:boolean}){
 const entries=useAnimationEntries(),pulseId='trump-pulse-'+useId().replace(/:/g,'');
 const fate=[...entries].reverse().find(e=>e.type==='magic_activated'&&e.magicId==='fate'&&e.trump===trump);
 const chance=[...entries].reverse().find(e=>e.type==='magic_activated'&&e.magicId==='chance'&&e.nextDeck===count&&(e.previousDeck??count)<count);
 const [shown,setShown]=useState(count);
 useEffect(()=>{
  if(simple||!chance){setShown(count);return;}
  const from=chance.previousDeck!,start=chance.created+chance.delay+legendaryTimings.indicatorStart;
  let timer:ReturnType<typeof setTimeout>;
  const tick=()=>{const progress=Math.max(0,Math.min(1,(Date.now()-start)/legendaryTimings.counter));setShown(Math.round(from+(count-from)*progress));if(progress<1)timer=setTimeout(tick,30);};
  tick();return()=>clearTimeout(timer);
 },[count,chance?.id,simple]);
 const delay=fate?fate.delay+legendaryTimings.indicatorStart:0;
 return <div className={'status magic-status'+(chance&&!simple?' counting-deck':'')+(fate&&!simple?' fate-changing':'')} style={{'--count-delay':(chance?chance.delay+legendaryTimings.indicatorStart:0)+'ms','--indicator-delay':delay+'ms'} as CSSProperties}>
  <span className="trump" aria-label={'Козырь: '+suits[trump]}>
   {fate&&!simple?<span key={fate.id} className="trump-swap" style={{'--indicator-delay':delay+'ms'} as CSSProperties}><svg className="trump-pulse" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><defs><radialGradient id={pulseId}><stop stopColor="#fffbe6" stopOpacity="1"/><stop offset=".35" stopColor="#fff0af" stopOpacity=".95"/><stop offset=".7" stopColor="#ffd063" stopOpacity=".65"/><stop offset="1" stopColor="#ffc33e" stopOpacity="0"/></radialGradient></defs><circle className="pulse-core" cx="100" cy="100" r="51" fill={'url(#'+pulseId+')'}/><circle className="pulse-halo" cx="100" cy="100" r="43" fill="none" stroke="#ffe6a1" strokeWidth="1.5"/><circle className="pulse-wave" cx="100" cy="100" r="49" fill="none" stroke="#fff4ce" strokeWidth=".8"/><g className="pulse-rays" fill="#ffebad">{Array.from({length:8},(_,i)=><path key={i} d="M97 39 100 12 103 39 100 48Z" transform={'rotate('+i*45+' 100 100)'}/>)}</g></svg><span className="old-suit" aria-hidden="true">{suits[fate.previousTrump??trump]}</span><span className="new-suit" aria-hidden="true">{suits[trump]}</span></span>:<span className="current-suit" aria-hidden="true">{suits[trump]}</span>}
  </span>
  <div><small>КОЗЫРЬ · КОЛОДА</small><strong><span className="deck-glyph">✧</span> <span className="deck-value" aria-label={'Карт в колоде: '+count}>{simple||!chance?count:shown}</span></strong></div>
 </div>;
}
