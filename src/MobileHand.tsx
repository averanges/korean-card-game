import {SealedCard} from './SealedCard';
import type {SealedCardView} from './learning';
import {useAnimationEntries} from './useGameAnimations';
import {useEffect,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {ranks,suits,type Card} from './engine';
import {MobileFan} from './mobile/MobileFan';
import {MobileSheet} from './mobile/MobileSheet';
import {MobileCardFace} from './mobile/MobileCardFace';
import {useSwipeGuard} from './useHandScroll';

/** A blind entry carries only an opaque reference. Its face is never constructed. */
export type MobileHandEntry={id:string;card?:Card;sealed?:SealedCardView;locked?:boolean};
export function MobileHand({entries,selected,translations,onSelect,onSpeak,onClear,onPanelChange}:{entries:MobileHandEntry[];selected:readonly string[];translations:boolean;onSelect:(id:string)=>void;onSpeak:(card:Card)=>void;onClear:()=>void;onPanelChange?:(open:boolean)=>void}){
 const [overview,setOverview]=useState(false),guard=useSwipeGuard();
 const chosen=entries.find(c=>c.id===selected.at(-1)),blind=entries.some(e=>!e.card&&!e.sealed);
 useEffect(()=>{onPanelChange?.(overview);return()=>onPanelChange?.(false);},[overview,onPanelChange]);
 const pick=(id:string)=>{onSelect(id);if(!entries.some(e=>e.id===id&&e.sealed))setOverview(false);};
 const animationEntries=useAnimationEntries(),arrivals=new Map<string,CSSProperties>();
 for(const entry of animationEntries){if(entry.player!==0)continue;const cards=['cards_drawn','cards_taken','magic_expired'].includes(entry.type)?entry.cards:entry.exchange?.newCard?[entry.exchange.newCard]:[];for(const card of cards)arrivals.set(card.id,{'--arrival-delay':(entry.type==='cards_taken'?entry.duration:entry.exchange?entry.delay+entry.duration-140:entry.delay)+'ms','--arrival-duration':(entry.type==='cards_taken'?160:entry.exchange?140:entry.duration)+'ms'} as CSSProperties);}
 const visuals=entries.map(e=>({id:e.id,face:e.card,sealedKo:e.sealed?.ko,locked:e.locked}));
 return <>
  <MobileFan arrivals={arrivals} cards={visuals} selected={selected.at(-1)} selectedIds={selected} blind={blind} onSelect={c=>pick(c.id)} onOverview={()=>setOverview(true)}/>
  {chosen&&<section className="ux-selection" aria-label="Выбранная карта"><div className="ux-selection-art">{chosen.card?<MobileCardFace card={chosen.card} translation={translations}/>:<div className="ux-card ux-back"/>}</div><div className="ux-selection-copy"><small>{chosen.card?`${ranks[chosen.card.rank]} ${suits[chosen.card.suit]}`:'Закрытая карта'}{selected.length>1?` · Выбрано ${selected.length}`:''}</small><strong lang="ko">{chosen.card?.word.ko||'Атака вслепую'}</strong>{translations&&chosen.card&&<p>{chosen.card.word.ru}</p>}<span>Выберите действие. Повторное касание снимает выбор.</span></div><div className="ux-selection-tools"><button className="ux-icon" onClick={onClear} aria-label="Снять выбор">×</button>{chosen.card&&<button className="ux-icon" onClick={()=>onSpeak(chosen.card!)} aria-label="Озвучить выбранную карту">♪</button>}</div></section>}
  {overview&&createPortal(<MobileSheet title={`Ваша рука · ${entries.length}`} onClose={()=>setOverview(false)}><div className="ux-hand-gallery" {...guard}>{entries.map((e,i)=><button key={e.id} disabled={e.locked} data-hand-ref={e.id} data-sealed-ref={e.sealed?e.id:undefined} className={selected.includes(e.id)?'is-picked':''} aria-label={e.sealed?'Открыть замок: '+e.sealed.ko:e.card?`${ranks[e.card.rank]} ${suits[e.card.suit]} ${e.card.word.ko}`:`Закрытая карта ${i+1}`} onClick={()=>pick(e.id)}>{e.sealed?<SealedCard ko={e.sealed.ko}/>:e.card?<MobileCardFace card={e.card} translation={translations}/>:<div className="ux-card ux-back"/>}{e.locked&&<span className="ux-gallery-lock">Заблокирована</span>}</button>)}</div></MobileSheet>,document.body)}
 </>;
}
