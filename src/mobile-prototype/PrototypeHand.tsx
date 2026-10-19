import {MobileFan} from '../mobile/MobileFan';
import type {Card} from '../engine';
type DemoCard=Card&{locked?:boolean};
export function PrototypeHand({cards,selected,blind,onSelect,onOverview}:{cards:DemoCard[];selected?:string;blind:boolean;onSelect:(card:DemoCard)=>void;onOverview:()=>void}){return <MobileFan cards={cards.map(c=>({id:c.id,face:blind?undefined:c,locked:!blind&&c.locked}))} selected={selected} blind={blind} onSelect={e=>{const c=cards.find(c=>c.id===e.id);if(c)onSelect(c);}} onOverview={onOverview}/>;}
