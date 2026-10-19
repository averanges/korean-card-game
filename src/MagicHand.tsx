import {useAnimationEntries} from './useGameAnimations';
import type {CSSProperties} from 'react';
import {useSwipeGuard} from './useHandScroll';
import {useEffect,useRef,useState} from 'react';
import type {Card} from './engine';

import {spellNames as names} from './spells';
export function MagicHand({cards,onOpen,onPanelChange,unavailable,selectedId}:{selectedId?:string;cards:readonly Card[];onOpen:(card:Card)=>void;onPanelChange?:(open:boolean)=>void;unavailable?:(card:Card)=>string|undefined}){
  const entries=useAnimationEntries();
  const swipe=useSwipeGuard();
  const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{onPanelChange?.(open);return()=>onPanelChange?.(false);},[open,onPanelChange]);
  useEffect(()=>{if(!open)return;const before=document.activeElement as HTMLElement;panel.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);e.stopPropagation();}if(e.key==='Tab'&&panel.current){const buttons=Array.from(panel.current.querySelectorAll<HTMLButtonElement>('button'));const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);(trigger.current||before)?.focus();};},[open]);
  useEffect(()=>{if(!cards.length)setOpen(false);},[cards.length]);
  if(!cards.length)return null;
  const thumbnail=(c:Card)=><button key={c.id} data-magic-card-id={c.id} className={'magic-mini hand-spell spell-'+c.spell+(selectedId===c.id?' magic-selected':'')+(entries.some(e=>e.type==='magic_received'&&e.player===0&&e.cards[0]?.id===c.id)?' card-arrival':'')} disabled={!!unavailable?.(c)||entries.some(e=>e.type==='magic_received'&&e.player===0&&e.cards[0]?.id===c.id)} style={(()=>{const e=entries.find(e=>e.type==='magic_received'&&e.player===0&&e.cards[0]?.id===c.id);return e?({'--arrival-delay':e.delay+'ms','--arrival-duration':e.duration+'ms'} as CSSProperties):undefined;})()} aria-label={names[c.spell!]||'Магическая карта'} title={unavailable?.(c)||names[c.spell!]} onClick={()=>{setOpen(false);onOpen(c);}}><span className="sr-only">{names[c.spell!]}</span></button>;
  return <>
    <section className={'magic-hand '+(cards.length>=4?'stacked':'')+(entries.some(e=>e.type==='magic_received'&&e.player===0)?' receiving-magic':'')+(entries.some(e=>e.type==='magic_received'&&e.player===0&&e.cards[0]?.id===cards[0].id)?' receiving-first':'')} style={{'--hand-glow-delay':Math.max(0,...entries.filter(e=>e.type==='magic_received'&&e.player===0).map(e=>e.delay+e.duration-250))+'ms'} as CSSProperties} aria-label={`Магическая экстра-рука: ${cards.length} карт`}>
      <div className="magic-direct">{cards.length<4&&cards.map(thumbnail)}</div>
      <button ref={trigger} className="magic-stack" aria-label={`Магические карты: ${cards.length}. Открыть`} aria-expanded={open} onClick={()=>setOpen(true)}><span className={'stack-art spell-'+cards[0].spell}/><span className="magic-stack-label">Магия </span><b>✦ {cards.length}</b></button>
    </section>
    {open&&<div className="magic-picker-backdrop" onClick={()=>setOpen(false)}><div ref={panel} className="magic-picker" role="dialog" aria-modal="true" aria-label="Выберите магическую карту" onClick={e=>e.stopPropagation()}><div className="magic-picker-heading"><h2>Магические карты · {cards.length}</h2><button onClick={()=>setOpen(false)}>Закрыть</button></div><div className="magic-gallery" {...swipe}>{cards.map(c=><div className="magic-gallery-item" key={c.id}>{thumbnail(c)}<strong>{names[c.spell!]}</strong><small>{unavailable?.(c)||'Можно активировать'}</small></div>)}</div><p>Выберите карту для задания. Закрытие панели не расходует карты.</p></div></div>}
  </>;
}
