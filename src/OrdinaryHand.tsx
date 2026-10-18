import {useAnimationEntries} from './useGameAnimations';
import {useLayoutEffect,useMemo,useState} from 'react';
import type {CSSProperties} from 'react';
import {ranks,suits,type Card} from './engine';
import {handLayout,sortOrdinaryCards} from './handModel';
import {useHandScroll} from './useHandScroll';

interface Props {cards:readonly Card[];selected:readonly string[];translations:boolean;onSelect:(card:Card)=>void;onSpeak:(card:Card)=>void;blind?:boolean;eligibleIds?:readonly string[]}
export function OrdinaryHand({cards,selected,translations,onSelect,onSpeak,blind=false,eligibleIds}:Props){
  const entries=useAnimationEntries();
  const sorted=useMemo(()=>sortOrdinaryCards(cards),[cards]);
  const [size,setSize]=useState({width:700,cardWidth:115,cardHeight:171});
  const layout=handLayout(sorted.length,size.width,size.cardWidth,size.cardHeight);
  const {viewport,handlers}=useHandScroll(sorted.map(c=>c.id),selected,layout);
  useLayoutEffect(()=>{
    const el=viewport.current;if(!el)return;
    const measure=()=>{const card=el.querySelector<HTMLElement>('.card');const next={width:el.clientWidth,cardWidth:card?.offsetWidth||115,cardHeight:card?.offsetHeight||171};setSize(old=>old.width===next.width&&old.cardWidth===next.cardWidth&&old.cardHeight===next.cardHeight?old:next);};
    measure();const observer=new ResizeObserver(measure);observer.observe(el);window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[sorted.length,viewport]);
  return <section className={'normal-hand '+(blind?'blind-hand ':'')+(eligibleIds?'hat-picking':'')} aria-label={blind?'Атака вслепую: выберите одну закрытую карту':`Ваша рука: ${sorted.length} обычных карт`}>
    <div className="normal-hand-viewport" ref={viewport} {...handlers} tabIndex={layout.scroll?0:undefined} aria-label={layout.scroll?'Рука: прокрутите влево или вправо':undefined} data-mode={layout.mode} data-scroll={layout.scroll}>
      <div className="normal-hand-track" style={{width:layout.width,height:layout.height}}>
        {sorted.map((c,i)=>{const pos=layout.positions[i],chosen=selected.includes(c.id),exchange=entries.find(e=>e.player===0&&e.exchange?.newCard.id===c.id),arrival=exchange?{...exchange,type:'cards_drawn',delay:exchange.delay+exchange.duration-140,duration:140}:[...entries].reverse().find(e=>['cards_drawn','cards_taken','magic_expired'].includes(e.type)&&e.player===0&&e.cards.some(x=>x.id===c.id));return <div key={c.id} data-card-id={blind?'blind-'+i:c.id} className={`hand-item ${chosen?'chosen':''} ${selected.at(-1)===c.id?'active-chosen':''}`} style={{'--hand-x':pos.x+'px','--hand-y':pos.y+'px',width:layout.cardWidth,height:layout.cardHeight,'--angle':`${pos.angle}deg`,'--layer':i+1} as CSSProperties}>
          {blind&&<div className="card monkey-card" style={{'--blind-i':i} as CSSProperties}><button className="face" aria-label={'Закрытая карта '+(i+1)} onClick={()=>onSelect(c)}/></div>}{!blind&&<div className={`card ${eligibleIds?(eligibleIds.includes(c.id)?'hat-eligible':'hat-ineligible'):''} ${c.suit===1||c.suit===2?'red':''} ${chosen?'selected':''} ${arrival?'card-arrival':''}`} style={arrival?({'--arrival-delay':(arrival.type==='cards_taken'?arrival.duration:arrival.delay)+'ms','--arrival-duration':(arrival.type==='cards_taken'?160:arrival.duration)+'ms'} as CSSProperties):undefined}>
            <button disabled={!!eligibleIds&&!eligibleIds.includes(c.id)} className="face" aria-label={`${ranks[c.rank]} ${suits[c.suit]} ${c.word.ko}`} aria-pressed={chosen} onClick={()=>onSelect(c)}>
              <span className="corner">{ranks[c.rank]}<small>{suits[c.suit]}</small></span>
              <span className="korean" lang="ko">{c.word.ko}</span>
              <span className={`translation ${translations||chosen?'shown':''}`}>{c.word.ru}</span>
            </button>
            <div className="cardtools"><button disabled={!!eligibleIds&&!eligibleIds.includes(c.id)} onClick={()=>onSpeak(c)} aria-label={`Озвучить ${c.word.ko}`}>♪</button></div>
          </div>}
        </div>;})}
      </div>
    </div>
    {layout.scroll&&<span className="hand-scroll-hint" aria-hidden="true">‹ Прокрутите руку ›</span>}
  </section>;
}
