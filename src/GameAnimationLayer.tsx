import {SealedCard} from './SealedCard';
import {spellNames} from './spells';
import {MagicBurn} from './MagicBurn';
import {TrickAnimation} from './TrickAnimation';
import {useLayoutEffect,useState} from 'react';
import type {CSSProperties} from 'react';
import {ranks,suits,type Card} from './engine';
import {magicAnimations,legendaryTimings,type AnimationEntry} from './animationModel';

export function AnimationCard({card,magicId}:{card?:Card;magicId?:string}){
  const spell=card?.spell||magicId;return <div className={'animation-card '+(spell?'animation-art spell-'+spell:!card?'network-card-back':'')}>
    {card&&!spell&&<><span className={'animation-rank '+([1,2].includes(card.suit)?'red':'')}>{ranks[card.rank]}<small>{suits[card.suit]}</small></span><span className="animation-word" lang="ko">{card.word.ko}</span></>}
  </div>;
}
function Flight({entry}:{entry:AnimationEntry}){
  const card=entry.player===0?entry.cards[0]:undefined;
  const [position,setPosition]=useState<CSSProperties>();
  useLayoutEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      const sealed=entry.sealed?.[0];
      const candidates=Array.from(document.querySelectorAll<HTMLElement>(card?.spell?'[data-magic-card-id]':'[data-card-id]'));
      let target=sealed?Array.from(document.querySelectorAll<HTMLElement>('[data-sealed-ref]')).find(el=>el.dataset.sealedRef===sealed.ref):card?candidates.find(el=>(card?.spell?el.dataset.magicCardId:el.dataset.cardId)===card?.id&&el.offsetWidth>0):undefined;
      if(!target&&sealed)target=document.querySelector<HTMLElement>('.ux-large-stack')||undefined;
      target??=document.querySelector<HTMLElement>(entry.player===1?'.bot-hand,.mobile-opponent':card?.spell?'.magic-stack':'.normal-hand-viewport,.ux-fan')||undefined;
      if(!target)return;
      let rect=target.getBoundingClientRect();
      if(rect.width===0)rect=(document.querySelector<HTMLElement>('.magic-hand')||target).getBoundingClientRect();
      const viewport=target.closest('.normal-hand-viewport')?.getBoundingClientRect();
      const x=Math.max(viewport?.left||8,Math.min(rect.x,(viewport?.right||innerWidth-8)-rect.width));
      const origin=entry.source|| (entry.sourceRef?{x:rect.x,y:rect.y}:undefined);const startX=origin?.x??Math.max(14,innerWidth*.025),startY=origin?.y??(innerHeight-Math.min(160,innerHeight*.2));
      const centralWidth=Math.min(210,innerWidth*.32,innerHeight*.32);
      const centralScale=centralWidth/72;
      const centerX=innerWidth/2-36*centralScale,centerY=innerHeight*.44-53.5*centralScale;
      setPosition({'--center-dx':(centerX-startX)+'px','--center-dy':(centerY-startY)+'px','--center-scale':centralScale,'--accent':magicAnimations[card?.spell||'']?.accentColor||'#d9b8ff',left:startX,top:startY,'--dx':`${x-startX}px`,'--dy':`${rect.y-startY}px`,'--landing-scale':Math.min(4,Math.max(.3,(card||sealed?rect.width:72)/72)),'--duration':`${entry.duration}ms`,'--delay':`${entry.delay}ms`} as CSSProperties);
    });
    return()=>cancelAnimationFrame(frame);
  },[card?.id,card?.spell,entry.player,entry.duration,entry.delay]);
  return position?<div className={'draw-flight '+(card?.spell&&!entry.compact?(magicAnimations[card.spell]?.intensity==='legendary'?'magic-flight legendary-receipt':'magic-flight major-receipt'):'')} style={position}><div className="flight-flip"><div className="flight-back"/><div className="flight-front"><>{entry.sealed?.[0]?<SealedCard ko={entry.sealed[0].ko}/>:<AnimationCard card={card}/>}</></div></div>{card?.spell&&entry.sourceRef&&<span className="reward-name">{spellNames[card.spell]}</span>}</div>:null;
}
function MagicBurst({entry}:{entry:AnimationEntry}){
  const config=magicAnimations[entry.magicId!]||{intensity:'minor',animationId:'spark',accentColor:'#d9b8ff'};
  if(config.intensity==='major')return <TrickAnimation entry={entry}/>;
  return <div className={`magic-burst intensity-${config.intensity} burst-${config.animationId}`} style={{'--accent':config.accentColor,'--duration':`${entry.duration}ms`,'--delay':`${entry.delay}ms`} as CSSProperties}>
    <div className="magic-dim"/>
    {config.intensity==='legendary'&&<div className="legendary-card"><AnimationCard card={entry.cards[0]} magicId={entry.magicId}/></div>}
    <div className="magic-table-wave"/>
    <div className="spell-symbol">
      {config.animationId==='mirror-wave'?<span>A ↔ 6</span>:config.animationId==='reverse-hourglass'?<div className="reverse-time"><svg viewBox="0 0 100 130" aria-hidden="true"><path d="M18 8h64M18 122h64M24 12c0 30 0 40 26 53-26 13-26 23-26 53h52c0-30 0-40-26-53 26-13 26-23 26-53Z" fill="#142f4899" stroke="currentColor" strokeWidth="3"/><path className="hourglass-sand" d="m30 109 20-20 20 20Zm2-87h36L50 43Z" fill="currentColor"/><path className="sand-stream" d="M50 88V44" stroke="currentColor" strokeWidth="2" strokeDasharray="3 5"/></svg>{[0,1,2].map(i=><i key={i} className="returning-silhouette" style={{'--i':i} as CSSProperties}/>)}</div>:config.animationId==='suit-wheel'?<div className="suit-wheel">{suits.map((s,i)=><span className={i===entry.trump?'chosen-suit':''} style={{'--i':i} as CSSProperties} key={s}>{s}</span>)}</div>:<span>✧</span>}
    </div>
    <span className="cast-credit">{entry.player===1?'Магия соперника':'Магия активирована'}</span>
  </div>;
}
export function GameAnimationLayer({entries,simple,suppressFailure=false,network=false}:{entries:AnimationEntry[];simple:boolean;suppressFailure?:boolean;network?:boolean}){
  return <><div className="game-animation-layer" aria-hidden="true">
    {entries.map(entry=>{
      if(entry.type==='cards_drawn'||entry.type==='magic_received')return (entry.player===0||network)&&!simple?<Flight key={entry.id} entry={entry}/>:null;
      if(entry.type==='round_defended'||entry.type==='cards_taken')return <div key={entry.id} className={'round-ghosts '+entry.type} style={{'--duration':`${simple?100:entry.duration}ms`} as CSSProperties}>{entry.positions?.map((p,i)=>{const center=entry.positions!.reduce((sum,p)=>sum+p.x,0)/entry.positions!.length;return <div className="round-ghost" key={p.card.id} style={{left:p.x,top:p.y,width:p.width,height:p.height,'--gdx':`${(center-p.x)*.12}px`,'--rotation':`${p.rotation}deg`,'--stagger':`${Math.min(i*12,70)}ms`} as CSSProperties}><AnimationCard card={p.card}/></div>;})}</div>;
      if(entry.type==='card_unlocked'){const source=entry.source;if(entry.player!==0||!entry.cards[0]||!source||simple)return null;return <div key={entry.id} className="unseal-effect" style={{left:source.x,top:source.y,width:source.width,height:source.height,'--duration':entry.duration+'ms','--delay':entry.delay+'ms'} as CSSProperties}><AnimationCard card={entry.cards[0]}/><div className="unseal-cover"><SealedCard ko={entry.cards[0].word.ko}/></div></div>;}
      if(entry.type==='magic_expired')return simple?null:<TrickAnimation key={entry.id} entry={entry}/>;
      if(entry.type==='magic_activated')return simple?<div key={entry.id} className="simple-magic-flash"/>:<MagicBurst key={entry.id} entry={entry}/>;
      if(entry.type==='magic_failed')return suppressFailure&&(!network||entry.player===0)?null:<div key={entry.id} className="failed-magic" style={{'--duration':`${simple?120:entry.duration}ms`,'--delay':entry.delay+'ms','--burn-duration':`${simple?120:entry.duration}ms`,'--burn-delay':entry.delay+'ms'} as CSSProperties}><div className="burn-face"><AnimationCard card={entry.cards[0]} magicId={entry.magicId}/></div><MagicBurn delay={entry.delay} duration={simple?120:entry.duration}/></div>;
      return null;
    })}
  </div><div className="magic-confirmations">{entries.filter(e=>e.type==='magic_activated'&&['mirror','fate'].includes(e.magicId||'')).map(e=><div key={e.id} className={'mirror-confirmation '+(e.magicId==='fate'?'fate-confirmation':'')} role="status" style={{'--notice-delay':(e.delay+legendaryTimings.indicatorStart)+'ms'} as CSSProperties}>{e.magicId==='fate'?<>Козырь изменён: {suits[e.previousTrump??0]} → <strong>{suits[e.trump??0]}</strong><small>{e.player===0?'Вы выбрали новую масть.':'Соперник изменил масть.'} Действует до конца партии.</small></>:'Зеркальный мир активен — порядок рангов изменён'}</div>)}</div></>;
}
