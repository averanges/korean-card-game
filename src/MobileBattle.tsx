import {useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import type {Card,Pair} from './engine';
import {MobileSheet} from './mobile/MobileSheet';
import {MobileCardFace} from './mobile/MobileCardFace';

/** Public table only. Callers supply authoritative legal targets and commands. */
export function MobileBattle({pairs,face,allowed,selectedTarget,onTarget,translations,onSpeak}:{pairs:Pair[];face:(card:Card)=>ReactNode;allowed:number[];selectedTarget?:number;onTarget:(target:number)=>void;translations:boolean;onSpeak?:(card:Card)=>void}){
 const [detail,setDetail]=useState<string>(),[showTranslation,setShowTranslation]=useState(false);
 const pair=pairs.find(p=>p.attack.id===detail);
 return <>{pairs.map((p,i)=><div className={'pair mobile-pair '+(allowed.includes(i)?'can-block ':'')+(selectedTarget===i?'is-target':'')} key={p.attack.id}>{face(p.attack)}{p.defense&&<div className="cover">{face(p.defense)}</div>}<button className="mobile-pair-hit" aria-label={allowed.includes(i)?`Защитить атаку ${i+1}`:`Рассмотреть пару ${i+1}`} aria-pressed={selectedTarget===i} onClick={()=>allowed.includes(i)?onTarget(i):setDetail(p.attack.id)}/><span className="mobile-pair-caption">{selectedTarget===i?'Цель выбрана':p.defense?'Отбита':allowed.includes(i)?'Выбрать цель':'Атака'}</span></div>)}{pair&&createPortal(<MobileSheet title="Карты на столе" onClose={()=>setDetail(undefined)}><div className="ux-pair-detail">{[pair.attack,pair.defense].map((c,i)=>c&&<figure key={c.id}><MobileCardFace card={c} translation={translations||showTranslation}/><figcaption>{i?'Защита':'Атака'}{onSpeak&&<button className="ux-pair-audio" onClick={()=>onSpeak(c)} aria-label={'Озвучить '+c.word.ko}>♪</button>}</figcaption></figure>)}</div>{!translations&&<button className="ux-quiet" onClick={()=>setShowTranslation(value=>!value)}>Показать / скрыть перевод</button>}</MobileSheet>,document.body)}</>;
}
