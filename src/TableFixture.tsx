// Read-only layout samples using production components; never changes real deals.
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useTableLayout} from './useTableLayout';
import {TurnIndicator} from './TurnIndicator';
import {MagicStatus} from './MagicStatus';
import {OrdinaryHand} from './OrdinaryHand';
import {MagicHand} from './MagicHand';
import {EffectIndicators} from './EffectIndicators';
import {TrumpChoice} from './TrumpChoice';
import {makeEffect,type ActiveEffect} from './effects';
import {ranks,suits,type Card} from './engine';
import {words} from './words';
import './style.css';import './hand.css';import './animations.css';import './boardImpacts.css';import './legendary.css';import './tableLayout.css';
const q=new URLSearchParams(location.search),n=Number(q.get('n')||6),status=q.get('status')||'defense',effectsCount=Number(q.get('effects')||3);
const cards:Card[]=Array.from({length:n},(_,i)=>({id:'layout-'+i,rank:i%9,suit:i%4,word:words[i%36]}));
const magic:Card[]=['mirror','chance','fate'].map(spell=>({id:spell,spell,rank:-1,suit:-1,word:words[0]}));
const effects:ActiveEffect[]=Array.from({length:effectsCount},(_,i)=>i%3===0?{...makeEffect('mirror','sample-'+i)!,duration:{type:'rounds',remaining:2}}:makeEffect(i%3===1?'mirror':'fate','sample-'+i,2)!);
function Fixture(){
 const ref=useTableLayout(),[selected,setSelected]=useState([cards[Math.floor(n/2)].id]),[translations,setTranslations]=useState(false),[choice,setChoice]=useState(q.has('choice'));
 useEffect(()=>{
  const check=()=>{
   const root=ref.current;if(!root)return;
   const rect=(s:string)=>root.querySelector<HTMLElement>(s)?.getBoundingClientRect();
   const field=rect('.battle'),hand=rect('.normal-hand-viewport'),actions=rect('.actions'),footer=rect('header'),selectedCard=rect('.hand-item.chosen .card');
   const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
   const issues:string[]=[];
   for(const el of Array.from(root.querySelectorAll<HTMLElement>('.magic-confirmations'))){if(actions&&overlap(el.getBoundingClientRect(),actions))issues.push('Уведомление пересекает кнопки');}
   for(const el of Array.from(root.querySelectorAll<HTMLElement>('.battle .card'))){const card=el.getBoundingClientRect();if(hand&&overlap(card,hand))issues.push('Стол пересекает руку');if(actions&&overlap(card,actions))issues.push('Стол пересекает кнопки');if(field&&(card.top<field.top-1||card.bottom>field.bottom+1||card.left<field.left-1||card.right>field.right+1))issues.push('Карта стола обрезана');}
   if(selectedCard&&hand&&(selectedCard.top<hand.top-1||selectedCard.bottom>hand.bottom+1))issues.push('Выбранная карта обрезана');
   if(footer&&footer.bottom>innerHeight+1)issues.push('Нижние элементы вне экрана');
   for(const el of Array.from(root.querySelectorAll<HTMLElement>('.turn-copy small,.turn-copy strong')))if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)issues.push('Текст статуса: '+el.tagName+' '+el.scrollWidth+'/'+el.clientWidth+' × '+el.scrollHeight+'/'+el.clientHeight);
   for(const el of Array.from(root.querySelectorAll<HTMLElement>('.effect-zone'))){const r=el.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1)issues.push('Эффекты вне экрана');}
   const data={type:'table-layout-report',size:innerWidth+'×'+innerHeight,cards:n,status,issues:[...new Set(issues)],cardWidth:root.style.getPropertyValue('--board-card-width'),field:field?Math.round(field.height):0};
   parent.postMessage(data,location.origin);
  };
  const timer=setTimeout(check,550);window.addEventListener('resize',check);const interval=setInterval(check,1000);
  return()=>{clearTimeout(timer);clearInterval(interval);window.removeEventListener('resize',check);};
 },[n,selected,choice]);
 const sampleWord=(i:number)=>q.has('long')?{ko:i?'국제도서관':'국제공항도서관',ru:i?'библиотека':'международный аэропорт'}:words[i];
 const face=(i:number)=><div className={'card '+(i?'red':'')} style={{'--ko-length':Array.from(sampleWord(i).ko).length,'--ru-length':Array.from(sampleWord(i).ru).length} as React.CSSProperties}><button className="face"><span className="corner">{ranks[i+1]}<small>{suits[i]}</small></span><span className="korean">{sampleWord(i).ko}</span><span className="translation">{sampleWord(i).ru}</span></button></div>;
 return <main ref={ref} className="game-table simple-motion"><header><a className="brand">✧ ХАНГЫЛЬ</a><div className="header-actions"><label><input type="checkbox" checked={translations} onChange={e=>setTranslations(e.target.checked)}/> Переводы</label><label><input type="checkbox"/> Меньше движения</label><button>Правила</button><button>Новая игра</button></div></header>
  <section className="statusbar"><TurnIndicator attacking={status==='attack'} winner={status==='win'?'Вы победили!':status==='lose'?'Бот победил':undefined}/><div className="opponent"><span>♟</span><div><strong>6 карт</strong></div></div><MagicStatus trump={0} count={24} simple/></section>
  <div className="bot-hand">{Array.from({length:6},(_,i)=><div key={i} className="back" style={{'--i':i,'--n':6} as React.CSSProperties}/>)}</div>
  <section className="arena"><div className="battle"><div className="pair">{face(0)}<div className="cover">{face(1)}</div></div></div><aside className="actions"><button className="action-button defense-button"><span className="action-label">Завершить защиту</span></button><button className="action-button take-button"><span className="action-label">Взять карты</span></button></aside></section>
  <EffectIndicators effects={effects}/><OrdinaryHand cards={cards} selected={selected} translations={translations} onSelect={c=>setSelected([c.id])} onSpeak={()=>{}}/><MagicHand cards={magic} onOpen={()=>setChoice(true)}/>
  {choice&&<TrumpChoice current={0} onCancel={()=>setChoice(false)} onChoose={()=>setChoice(false)}/>}
  {q.has('notice')&&<div className="magic-confirmations"><div className="mirror-confirmation" style={{animation:'none'}}>Зеркальный мир активен — порядок рангов изменён</div><div className="mirror-confirmation fate-confirmation" style={{animation:'none'}}>Козырь изменён: ♥ → <strong>♠</strong><small>Вы выбрали новую масть. Действует до конца партии.</small></div></div>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
