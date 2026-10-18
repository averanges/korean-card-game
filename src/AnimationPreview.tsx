import {availableCards,blindAttack} from './trickRules';
import {MagicStatus} from './MagicStatus';
import {BoardImpact} from './BoardImpact';
import {useEffect,useState,type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {createGame,reduceGame,ranks,suits,type Game,type Card,type Action} from './engine';
import {AnimationContext,captureBoard,useGameAnimations} from './useGameAnimations';
import {GameAnimationLayer} from './GameAnimationLayer';
import {OrdinaryHand} from './OrdinaryHand';
import {MagicHand} from './MagicHand';
import {EffectIndicators} from './EffectIndicators';
import './style.css';import './hand.css';import './animations.css';import './boardImpacts.css';import './legendary.css';import './tricks.css';
const card=(id:string,rank=0,suit=0):Card=>({id,rank,suit,word:{ko:'학교',ru:'школа'}});
const cases=['Атака тремя картами','Подкидывание','Защита','Отбой и добор 6','Взятие','Добор магии','Зеркальный мир','Второй шанс','Переворот судьбы','Магия бота','Неверный ответ','Защита: шесть пар','Призрачный вор','Подарок с подвохом','Обезьянья проделка','Шляпа фокусника','Слепая атака игрока','Возврат заблокированной карты'];
function scenario(index:number):{game:Game;action:Action}{
 const g=createGame();g.attacker=0;g.hands=[[card('a'),card('b',0,1),card('c',0,2),card('keep',5)],[card('d',2),card('keep2',5)]];g.table=[];g.deck=[];g.limit=6;g.discard=[card('discard',4)];
 let action:Action={type:'attack',player:0,ids:['a','b','c']};
 if(index===1){g.table=[{attack:card('previous')}];action={type:'attack',player:0,ids:['b']};}
 if(index===2){g.table=[{attack:card('previous')}];action={type:'defend',player:1,id:'d',target:0};}
 if(index>=3&&index<=5){g.table=[{attack:card('previous'),defense:card('defended',2)}];g.taking=index===4;g.hands[0]=[card('keep',5)];g.deck=Array.from({length:12},(_,i)=>card('draw-'+i,i%9,i%4));if(index===5)g.deck.push({...card('m1'),spell:'mirror'},{...card('m2'),spell:'fate'});action={type:'end',player:0};}
 if(index===11){g.table=Array.from({length:6},(_,i)=>({attack:card(`crowded-${i}`,0,i%4),...(i<5?{defense:card(`covered-${i}`,1,i%4)}:{})}));g.hands[1]=[card('d',2,1),card('keep2',5)];return {game:g,action:{type:'defend',player:1,id:'d',target:5}};}
 if(index>=12){const kind=['ghost_thief','trick_gift','monkey_prank','magicians_hat'][Math.min(3,index-12)];g.hands[0].push({...card('magic'),spell:kind});g.deck=[card('higher',8,1),card('draw',5,2)];if(index===16){g.hands[0]=[card('a'),card('b',3,1),card('c',6,2)];g.effects=[{id:'monkey',kind:'monkey_prank',name:'Обезьянья проделка',description:'Слепая атака одной картой',target:0,status:'pending',duration:{type:'event',event:'monkey-resolved',label:'Ожидает атаки'},modifier:{}}];return {game:g,action:{type:'attack',player:0,ids:['b']}};}if(index===17){g.effects=[{id:'ghost',kind:'ghost_thief',name:'Призрачный вор',description:'Одна карта временно скрыта',target:0,status:'active',lockedCardId:'b',expiresRound:1,duration:{type:'event',event:'ghost-release',label:'До конца раунда'},modifier:{}}];g.table=[{attack:card('at'),defense:card('def',2)}];return {game:g,action:{type:'end',player:0}};}return {game:g,action:{type:'magic',player:0,id:'magic',question:0,answer:'яблоко',targetId:kind==='magicians_hat'?'a':undefined}};}
 if(index>=6){const kind=index===7?'chance':index===8?'fate':'mirror';const p=index===9?1:0;g.attacker=p;g.hands[p].push({...card('magic'),spell:kind});action={type:'magic',player:p,id:'magic',question:0,answer:index===10?'ошибка':'яблоко',...(kind==='fate'?{trump:(g.trump+1)%4}:{})};}
 return {game:g,action};
}
function Preview(){
 const [chosen,setChosen]=useState(0),[sample,setSample]=useState(()=>scenario(0)),[simple,setSimple]=useState(false),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[selected,setSelected]=useState<string[]>([]);
 const g=sample.game,motion=useGameAnimations(simple||reduced);
 useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(q.matches);q.addEventListener('change',change);return()=>q.removeEventListener('change',change);},[]);
 function prepare(index:number){const next=scenario(index);setChosen(index);setSample(next);setSelected([]);motion.start(next.game);}
 function play(){const next=reduceGame(g,sample.action);motion.transition(g,next,sample.action,captureBoard());setSample({...sample,game:next});}
 function board(c:Card){const e=motion.entries.find(e=>['card_attack','card_throw_in','card_defend'].includes(e.type)&&e.cards[0]?.id===c.id);return <>{e&&<BoardImpact cue={e}/>}<div data-board-card={JSON.stringify(c)} className={'card '+(e?'board-motion motion-'+e.type:'')} style={e?{'--duration':e.duration+'ms','--delay':e.delay+'ms'} as CSSProperties:undefined}><button className="face"><span className="corner">{ranks[c.rank]}<small>{suits[c.suit]}</small></span><span className="korean">{c.word.ko}</span><span className="translation">{c.word.ru}</span></button></div></>;}
 return <AnimationContext.Provider value={motion.entries}><main className={(simple||reduced?'simple-motion':'full-motion')+(motion.entries.some(e=>e.magicId==='mirror'&&e.type==='magic_activated')?' rank-flash':'')}><div style={{position:'absolute',top:20,left:20,right:20,zIndex:75,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',fontSize:13}}><label>Сценарий <select value={chosen} onChange={e=>prepare(+e.target.value)}>{cases.map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label><button onClick={play}>Выполнить</button><button onClick={()=>prepare(chosen)}>Новый розыгрыш</button><label><input type="checkbox" checked={simple} onChange={e=>setSimple(e.target.checked)}/> Меньше движения</label><span>Тестовый экран · состояние игры не зависит от анимаций</span></div><section className="statusbar legendary-preview-status"><MagicStatus trump={g.trump} count={g.deck.length} simple={simple||reduced}/></section><section className="arena"><div className="battle">{g.table.map(p=><div className="pair" key={p.attack.id}>{board(p.attack)}{p.defense&&<div className="cover">{board(p.defense)}</div>}</div>)}</div></section><EffectIndicators effects={g.effects}/><OrdinaryHand blind={blindAttack(g,0)} cards={availableCards(g,0)} selected={selected} translations onSelect={c=>setSelected(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id])} onSpeak={()=>{}}/><MagicHand cards={g.hands[0].filter(c=>c.spell)} onOpen={()=>{}}/><div style={{position:'absolute',left:20,bottom:15,fontSize:12}} role="status">{g.log.at(-1)} · В руке {g.hands[0].length} · В сбросе {g.discard.length} · Колода {g.deck.length}</div><GameAnimationLayer entries={motion.entries} simple={simple||reduced}/></main></AnimationContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
