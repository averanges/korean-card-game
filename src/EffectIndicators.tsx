import {useAnimationEntries} from './useGameAnimations';
import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {durationText,type ActiveEffect} from './effects';
export function EffectIndicators({effects,opponentLabel="Бот"}:{effects:ActiveEffect[];opponentLabel?:string}){
 const entries=useAnimationEntries();
 const [popup,setPopup]=useState<{id:string;left:number;top:number}>();
 const active=effects.find(e=>e.id===popup?.id);
 const show=(effect:ActiveEffect,el:HTMLElement)=>{const box=el.getBoundingClientRect(),width=Math.min(240,innerWidth-24);setPopup({id:effect.id,left:Math.min(innerWidth-width-12,Math.max(12,box.left+box.width/2-width/2)),top:Math.min(innerHeight-190,box.bottom+10)});};
 useEffect(()=>{if(!popup)return;const close=()=>setPopup(undefined);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};},[popup?.id]);
 return <><section className="effect-zones" aria-label="Активные эффекты">{(['temporary','permanent'] as const).map(group=>{
 const items=effects.filter(e=>(e.duration.type==='permanent')===(group==='permanent'));
 return <div className={'effect-zone '+group} key={group}><span className="effect-zone-label">{group==='temporary'?'Временные':'Постоянные'}</span><div className="effect-icons">{items.length===0?<span className="effects-empty" aria-label="Нет эффектов">—</span>:items.map(e=>{
 const cue=entries.find(a=>a.type==='magic_activated'&&(a.cards[0]?.id===e.id||a.effectId===e.id));
 return <div key={e.id} className={'effect-item '+(cue?'effect-born':'')} style={cue?({'--effect-delay':Math.max(0,cue.delay+cue.duration-140)+'ms'} as CSSProperties):undefined}><button className={'effect-thumbnail spell-'+e.kind} aria-label={(e.kind==='mirror'?'Зеркальный мир активен':e.name)+(e.target===undefined?'':e.target===0?' · На вас':' · На сопернике')+', '+durationText(e.duration)} aria-expanded={popup?.id===e.id} aria-describedby={popup?.id===e.id?'effect-'+e.id:undefined} onMouseEnter={event=>show(e,event.currentTarget)} onMouseLeave={()=>setPopup(undefined)} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))show(e,event.currentTarget);}} onBlur={()=>setPopup(undefined)} onClick={event=>{if(event.detail===0||event.nativeEvent instanceof PointerEvent&&event.nativeEvent.pointerType==='mouse')show(e,event.currentTarget);else if(popup?.id===e.id)setPopup(undefined);else show(e,event.currentTarget);}} onKeyDown={event=>{if(event.key==='Escape')setPopup(undefined);}}>{e.target!==undefined&&<span className="effect-target">{e.target===0?'Вы':opponentLabel}</span>}{e.duration.type==='event'&&<b className="effect-count">{e.status==='pending'?'…':e.kind==='ghost_thief'?'1':'•'}</b>}{e.duration.type==='permanent'&&<b className="effect-infinity">∞</b>}{(e.duration.type==='rounds'||e.duration.type==='turns')&&<b className="effect-count">{e.duration.remaining}</b>}</button></div>;
 })}</div></div>;
 })}</section>{active&&popup&&createPortal(<div role="tooltip" id={'effect-'+active.id} className="effect-tooltip effect-popup" style={{left:popup.left,top:popup.top}}><strong>{active.kind==='mirror'?'Зеркальный мир активен':active.name}</strong><p>{active.target===undefined?'':active.target===0?'На вас. ':'На сопернике. '}{active.description}</p><small>{durationText(active.duration)}</small></div>,document.body)}</>;
}
