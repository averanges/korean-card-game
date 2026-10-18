import {useEffect,useRef,useState} from 'react';
import {suits} from './engine';
import {SuitJewel,ChoiceFrame} from './SuitJewel';
import './trumpChoice.css';

const suitNames=['Пики','Червы','Бубны','Трефы'];
export function TrumpChoice({current,onChoose,onCancel,cancellable=true}:{current:number;onChoose:(suit:number)=>void;onCancel:()=>void;cancellable?:boolean}){
 const [selected,setSelected]=useState<number>();
 const dialog=useRef<HTMLElement>(null),confirmed=useRef(false),cancel=useRef(onCancel);
 cancel.current=()=>{if(cancellable&&!confirmed.current)onCancel();};
 useEffect(()=>{
  const before=document.activeElement as HTMLElement;
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();cancel.current();}
   if(event.key==='Tab'){
    const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
    const first=buttons[0],last=buttons.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('keydown',key);before?.focus();};
 },[]);
 return <div className="overlay trump-choice-overlay" onClick={()=>cancel.current()}>
  <section ref={dialog} className="trump-choice celestial-choice" role="dialog" aria-modal="true" aria-labelledby="trump-choice-heading" onClick={e=>e.stopPropagation()}>
   <ChoiceFrame/>
   <h2 id="trump-choice-heading">Выберите новый козырь</h2>
   <div className="trump-options" role="group" aria-label="Новая козырная масть">
    {suits.map((suit,i)=>i===current?null:<button key={suit} type="button" aria-label={suitNames[i]} disabled={confirmed.current} aria-pressed={selected===i} className={'suit-option '+([1,2].includes(i)?'red-suit ':'')+(selected===i?'chosen-suit':'')} onClick={()=>{if(confirmed.current)return;confirmed.current=true;setSelected(i);onChoose(i);}}><SuitJewel suit={i}/></button>)}
   </div>
   {cancellable&&<button className="choice-dismiss" aria-label="Отменить выбор и сохранить карту" title="Отмена" onClick={()=>cancel.current()}>×</button>}
  </section>
 </div>;
}
