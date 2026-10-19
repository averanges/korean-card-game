import {SealedCard} from './SealedCard';
import type {SealedCardView} from './learning';
import {MobileHand} from './MobileHand';
import {useCompactViewport} from './useCompactViewport';
import {useAnimationEntries} from './useGameAnimations';
import {useLayoutEffect,useMemo,useState} from 'react';
import {MenuDialog} from './MenuDialog';
import type {CSSProperties} from 'react';
import {ranks,suits,type Card} from './engine';
import {handLayout,sortOrdinaryCards} from './handModel';
import {useHandScroll} from './useHandScroll';

interface Props {cards:readonly Card[];selected:readonly string[];translations:boolean;onSelect:(card:Card)=>void;onSpeak:(card:Card)=>void;blind?:boolean;eligibleIds?:readonly string[];lockedIds?:readonly string[];sealed?:SealedCardView[];onUnlock?:(ref:string)=>void;onClear?:()=>void;onPanelChange?:(open:boolean)=>void}
export function OrdinaryHand({cards,selected,translations,onSelect,onSpeak,blind=false,eligibleIds,lockedIds=[],sealed=[],onUnlock,onClear,onPanelChange}:Props){
  const compact=useCompactViewport();
  const entries=useAnimationEntries();
  const [detail,setDetail]=useState<Card>();
  const sorted=useMemo(()=>sortOrdinaryCards(cards),[cards]);
  const arrivals=useMemo(()=>{const map=new Map<string,(typeof entries)[number]>();for(const entry of entries){if(entry.player!==0)continue;if(['cards_drawn','cards_taken','magic_expired'].includes(entry.type))for(const card of entry.cards)map.set(card.id,entry);if(entry.exchange?.newCard)map.set(entry.exchange.newCard.id,{...entry,type:'cards_drawn',delay:entry.delay+entry.duration-140,duration:140});}return map;},[entries]);
  const [size,setSize]=useState({width:700,cardWidth:115,cardHeight:171});
  const layout=handLayout(sorted.length+sealed.length,size.width,size.cardWidth,size.cardHeight,compact);
  const {viewport,handlers}=useHandScroll([...sorted.map(c=>c.id),...sealed.map(s=>s.ref)],selected,layout);
  useLayoutEffect(()=>{
    const el=viewport.current;if(!el)return;
    const measure=()=>{const card=el.querySelector<HTMLElement>('.card');const next={width:el.clientWidth,cardWidth:card?.offsetWidth||115,cardHeight:card?.offsetHeight||171};setSize(old=>old.width===next.width&&old.cardWidth===next.cardWidth&&old.cardHeight===next.cardHeight?old:next);};
    measure();const observer=new ResizeObserver(measure);observer.observe(el);window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[sorted.length,sealed.length,viewport,compact]);
  if(compact)return <MobileHand entries={[...(blind?cards:sorted).map(c=>({id:c.id,...(!blind?{card:c}:{}),locked:lockedIds.includes(c.id)||!!eligibleIds&&!eligibleIds.includes(c.id)})),...sealed.map(seal=>({id:seal.ref,sealed:seal}))]} selected={selected} translations={translations} onSelect={id=>{if(sealed.some(s=>s.ref===id)){onUnlock?.(id);return;}const c=cards.find(c=>c.id===id);if(c)onSelect(c);}} onSpeak={onSpeak} onClear={()=>onClear?.()} onPanelChange={onPanelChange}/>;
  return <><section className={'normal-hand '+(blind?'blind-hand ':'')+(eligibleIds?'hat-picking':'')} aria-label={blind?'Атака вслепую: выберите одну закрытую карту':`Ваша рука: ${sorted.length} обычных карт`}>
    {compact&&<span className="hand-caption">Ваша рука · {sorted.length}</span>}<div className="normal-hand-viewport" ref={viewport} {...handlers} tabIndex={layout.scroll?0:undefined} aria-label={layout.scroll?'Рука: прокрутите влево или вправо':undefined} data-mode={layout.mode} data-scroll={layout.scroll}>
      <div className="normal-hand-track" style={{width:layout.width,height:layout.height}}>
        {sorted.map((c,i)=>{const locked=lockedIds.includes(c.id),pos=layout.positions[i],chosen=selected.includes(c.id),arrival=arrivals.get(c.id);return <div key={c.id} data-card-id={blind?'blind-'+i:c.id} className={`hand-item ${chosen?'chosen':''} ${selected.at(-1)===c.id?'active-chosen':''}`} style={{'--hand-x':pos.x+'px','--hand-y':pos.y+'px',width:layout.cardWidth,height:layout.cardHeight,'--angle':`${pos.angle}deg`,'--layer':i+1} as CSSProperties}>
          {blind&&<div className="card monkey-card" style={{'--blind-i':i} as CSSProperties}><button className="face" aria-label={'Закрытая карта '+(i+1)} onClick={()=>onSelect(c)}/></div>}{!blind&&<div className={`card ${locked?'ghost-locked':''} ${[...c.word.ko].length>6||[...c.word.ru].length>24?'long-word':''} ${eligibleIds?(eligibleIds.includes(c.id)?'hat-eligible':'hat-ineligible'):''} ${c.suit===1||c.suit===2?'red':''} ${chosen?'selected':''} ${arrival?'card-arrival':''}`} style={{'--ko-length':[...c.word.ko].length,'--ru-length':[...c.word.ru].length,...(arrival?{'--arrival-delay':(arrival.type==='cards_taken'?arrival.duration:arrival.delay)+'ms','--arrival-duration':(arrival.type==='cards_taken'?160:arrival.duration)+'ms'}:{})} as CSSProperties}>
            <button disabled={locked||!!eligibleIds&&!eligibleIds.includes(c.id)} title={locked?'Карта заблокирована':`${c.word.ko} — ${c.word.ru}`} className="face" aria-label={`${ranks[c.rank]} ${suits[c.suit]} ${c.word.ko}`} aria-pressed={chosen} onClick={()=>onSelect(c)}>
              <span className="corner">{ranks[c.rank]}<small>{suits[c.suit]}</small></span>
              <span className="korean" lang="ko">{c.word.ko}</span>
              <span className={`translation ${translations||chosen?'shown':''}`}>{c.word.ru}</span>
            </button>
            {locked&&<span className="ghost-lock-seal" aria-label="Карта заблокирована">♧<small>Заблокирована</small></span>}<div className="cardtools">{compact&&<button className="word-detail-button" aria-label={`Слово и перевод: ${c.word.ko}`} onClick={()=>setDetail(c)}>⋯</button>}<button disabled={!!eligibleIds&&!eligibleIds.includes(c.id)} onClick={()=>onSpeak(c)} aria-label={`Озвучить ${c.word.ko}`}>♪</button></div>
          </div>}
        </div>;})}
        {sealed.map((seal,index)=>{const i=sorted.length+index,pos=layout.positions[i];return <div key={seal.ref} data-sealed-ref={seal.ref} className="hand-item sealed-hand-item" style={{'--hand-x':pos.x+'px','--hand-y':pos.y+'px',width:layout.cardWidth,height:layout.cardHeight,'--angle':pos.angle+'deg','--layer':i+1} as CSSProperties}><button className="sealed-hit" aria-label={'Открыть замок: '+seal.ko} onClick={()=>onUnlock?.(seal.ref)}><SealedCard ko={seal.ko}/></button></div>;})}
      </div>
    </div>
    {layout.scroll&&<span className="hand-scroll-hint" aria-hidden="true">‹ Прокрутите руку ›</span>}
  </section>{detail&&!blind&&<MenuDialog title="Слово на карте" onClose={()=>setDetail(undefined)}><div className="word-detail"><strong lang="ko">{detail.word.ko}</strong><p>{detail.word.ru}</p><button onClick={()=>onSpeak(detail)}>♪ Озвучить</button></div></MenuDialog>}</>;
}
