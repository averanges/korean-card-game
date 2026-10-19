import {SealedCard} from '../SealedCard';
import type {SealedCardView} from '../learning';
import {useCompactViewport} from '../useCompactViewport';
import {useLayoutEffect,useState,type CSSProperties} from 'react';
import {handLayout} from '../handModel';
import {useHandScroll} from '../useHandScroll';
/** Server order and opaque references are preserved; only geometry is computed here. */
export function BlindHand({cards,disabled,onChoose,sealed=[],onUnlock}:{cards:readonly {ref:string;hidden:true}[];disabled:boolean;sealed?:SealedCardView[];onUnlock?:(ref:string)=>void;onChoose:(ref:string)=>void}) {
 const compact=useCompactViewport();
 const [size,setSize]=useState({width:700,cardWidth:115,cardHeight:171});
 const layout=handLayout(cards.length+sealed.length,size.width,size.cardWidth,size.cardHeight,compact);
 const {viewport,handlers}=useHandScroll([...cards.map(c=>c.ref),...sealed.map(c=>c.ref)],[],layout);
 useLayoutEffect(()=>{const el=viewport.current;if(!el)return;const measure=()=>{const card=el.querySelector<HTMLElement>('.card');setSize(old=>{const next={width:el.clientWidth,cardWidth:card?.offsetWidth||115,cardHeight:card?.offsetHeight||171};return JSON.stringify(old)===JSON.stringify(next)?old:next;});};measure();const observer=new ResizeObserver(measure);observer.observe(el);window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure);};},[viewport,cards.length,sealed.length]);
 return <section className="normal-hand blind-hand" aria-label="Слепая атака"><div className="normal-hand-viewport" ref={viewport} {...handlers} data-mode={layout.mode} data-scroll={layout.scroll} tabIndex={layout.scroll?0:undefined}><div className="normal-hand-track" style={{width:layout.width,height:layout.height}}>{cards.map((card,i)=>{const pos=layout.positions[i];return <div key={card.ref} className="hand-item" style={{'--hand-x':pos.x+'px','--hand-y':pos.y+'px','--angle':pos.angle+'deg','--layer':i+1,width:layout.cardWidth,height:layout.cardHeight} as CSSProperties}><div className="card monkey-card" style={{'--blind-i':i} as CSSProperties}><button className="face" aria-label={'Закрытая карта '+(i+1)} disabled={disabled} onClick={()=>onChoose(card.ref)}/></div></div>;})}{sealed.map((seal,i)=>{const pos=layout.positions[cards.length+i];return <div key={seal.ref} data-sealed-ref={seal.ref} className="hand-item sealed-hand-item" style={{'--hand-x':pos.x+'px','--hand-y':pos.y+'px','--angle':pos.angle+'deg','--layer':cards.length+i+1,width:layout.cardWidth,height:layout.cardHeight} as CSSProperties}><button className="sealed-hit" aria-label={'Открыть замок: '+seal.ko} onClick={()=>onUnlock?.(seal.ref)}><SealedCard ko={seal.ko}/></button></div>;})}</div></div>{layout.scroll&&<span className="hand-scroll-hint">‹ Прокрутите руку ›</span>}</section>;
}
