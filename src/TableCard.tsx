import type {CSSProperties} from 'react';
import {BoardImpact} from './BoardImpact';
import {ranks,suits,type Card} from './engine';
import type {AnimationEntry} from './animationModel';
export function TableCard({card:c,cue,selected=false,translation,onClick,onReveal,onSpeak}:{card:Card;cue?:AnimationEntry;selected?:boolean;translation:string;onClick:()=>void;onReveal:()=>void;onSpeak:()=>void}) {
 return <>{cue&&<BoardImpact cue={cue}/>}<div className={`card ${[1,2].includes(c.suit)?'red':''} ${selected?'selected':''} ${cue?'board-motion motion-'+cue.type:''}`} data-board-card={JSON.stringify(c)} style={{'--ko-length':[...c.word.ko].length,'--ru-length':[...c.word.ru].length,...(cue?{'--duration':cue.duration+'ms','--delay':cue.delay+'ms'}:{})} as CSSProperties}>
 <button className="face" onClick={onClick} aria-label={`${ranks[c.rank]} ${suits[c.suit]} ${c.word.ko}`}><span className="corner">{ranks[c.rank]}<small>{suits[c.suit]}</small></span><span className="korean" lang="ko">{c.word.ko}</span><span className="translation">{translation}</span><span className="bottom">{suits[c.suit]} {ranks[c.rank]}</span></button><div className="cardtools"><button onClick={onReveal} title="Показать перевод">가 / А</button><button onClick={onSpeak} aria-label={`Озвучить ${c.word.ko}`}>♪</button></div></div></>;
}
