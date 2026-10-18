import type {CSSProperties} from 'react';
import type {AnimationEntry} from './animationModel';
import {AnimationCard} from './GameAnimationLayer';

export function TrickAnimation({entry}:{entry:AnimationEntry}){
 const kind=entry.magicId,returning=entry.type==='magic_expired';
 const style={'--duration':entry.duration+'ms','--delay':entry.delay+'ms','--destination-y':(entry.targetPlayer===1||returning&&entry.player===1?'-30vh':'30vh')} as CSSProperties;
 return <div className={'trick-animation trick-'+kind+(returning?' trick-return':'')} style={style}>
  <div className="trick-orbit"/>
  {kind==='ghost_thief'?<><svg className="little-ghost" viewBox="0 0 100 110"><path d="M15 99V46a35 35 0 0 1 70 0v53L72 87 59 101 46 88 32 102Z" fill="#d3ebffe6" stroke="#b393ff" strokeWidth="3"/><path d="M32 47q6-12 12 0m13 0q6-12 12 0M40 68q10 14 20 0" fill="none" stroke="#49366b" strokeWidth="5"/></svg><div className="trick-card-back"/></>:
   kind==='trick_gift'?<><div className="gift-box"><div className="gift-lid">✧</div><span>✦</span></div><div className="trick-card-back"/>{Array.from({length:6},(_,i)=><i className="trick-confetti" key={i} style={{'--i':i} as CSSProperties}/>)}</>:
   kind==='monkey_prank'?<><div className="trick-portrait spell-monkey_prank"/><div className="monkey-fan">{[0,1,2].map(i=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div></>:
   <><div className="hat-illustration"><svg viewBox="0 0 150 110"><ellipse cx="75" cy="86" rx="68" ry="17" fill="#261436" stroke="#edc16e" strokeWidth="2"/><path d="m35 16 12 68q27 15 56 0l12-68q-40-17-80 0Z" fill="#321849" stroke="#d0a26d" strokeWidth="2"/><path d="m43 61 4 23q28 15 56 0l4-23q-33 12-64 0Z" fill="#8a4caa"/><ellipse cx="75" cy="16" rx="40" ry="10" fill="#120c20" stroke="#e3b66e" strokeWidth="2"/><path d="m75 38 4 11 12 1-9 8 2 12-9-6-10 6 3-12-9-8 12-1Z" fill="#f6d78c"/></svg></div>{entry.exchange&&<><div className="hat-input"><AnimationCard card={entry.exchange.oldCard}/></div><div className="hat-output">{entry.player===0?<AnimationCard card={entry.exchange.newCard}/>:<div className="trick-card-back"/>}</div></>}</>}
 </div>;
}
