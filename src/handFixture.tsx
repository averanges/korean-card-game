// Manual verification surface, not imported by the production game.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OrdinaryHand} from './OrdinaryHand';
import {MagicHand} from './MagicHand';
import {toggleHandSelection} from './handModel';
import {words} from './words';
import type {Card} from './engine';
import './style.css';
import './hand.css';
const query=new URLSearchParams(location.search),n=Number(query.get('normal')||6),m=Number(query.get('magic')||0);
function Fixture(){
 const [cards,setCards]=useState<Card[]>(Array.from({length:n},(_,i)=>({id:`normal-${i}`,rank:Math.floor(i/4),suit:i%4,word:words[i%36]}))),[selected,setSelected]=useState<string[]>([]),[translations,setTranslations]=useState(false),[reverse,setReverse]=useState(false),[opened,setOpened]=useState('');
 const magic:Card[]=Array.from({length:m},(_,i)=>({id:`magic-${i}`,spell:['mirror','chance','fate'][i%3],rank:-1,suit:-1,word:words[0]}));
 return <main><div style={{position:'absolute',left:20,right:20,top:30,zIndex:10,display:'flex',gap:12,flexWrap:'wrap',fontSize:13}}><label><input type="checkbox" checked={translations} onChange={e=>setTranslations(e.target.checked)}/> Переводы</label><button onClick={()=>setReverse(!reverse)}>Зеркальный мир: {reverse?'вкл':'выкл'}</button><button onClick={()=>setCards(old=>[...old,{id:'draw-'+old.length,rank:8,suit:0,word:words[35]}])}>Добрать карту</button><button onClick={()=>{setCards(old=>old.filter(c=>!selected.includes(c.id)));setSelected([]);}}>Убрать выбранные</button><span role="status">Выбрано: {selected.length}{opened?' · Магия: '+opened:''}</span></div><OrdinaryHand cards={cards} selected={selected} translations={translations} onSpeak={()=>{}} onSelect={c=>setSelected(old=>toggleHandSelection(old,c,cards,true))}/><MagicHand cards={magic} onOpen={c=>setOpened(c.id)}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
