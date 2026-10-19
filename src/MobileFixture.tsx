// Development-only presentation samples. This entry is absent from the production build.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ProfileProvider} from './ProfileContext';
import {NetworkTable,type Intent} from './rooms/NetworkTable';
import {createGame,type Card} from './engine';
import {ordinaryView} from './game-core/ordinary';
import type {GameSnapshot,PublicRoom} from './rooms/protocol';
import './style.css';import './hand.css';import './animations.css';import './boardImpacts.css';import './legendary.css';import './tableLayout.css';import './tricks.css';import './academy.css';import './rooms/room.css';import './mobile.css';
const q=new URLSearchParams(location.search),count=Number(q.get('n')||6),mode=q.get('mode');
const card=(id:string,i:number):Card=>({id,rank:i%9,suit:i%4,word:q.has('long')?{ko:'국제공항도서관대학교',ru:'международный образовательный аэропорт'}:{ko:'학교',ru:'школа'}});
function Fixture(){
 const [snapshot,setSnapshot]=useState<GameSnapshot>(()=>{
  const state:GameSnapshot=ordinaryView(createGame(()=>.4),0,10);state.view.attacker=mode==='defense'?1:0;state.view.trump=Number(q.get('trump')||0);state.view.hand={blind:false,cards:Array.from({length:count},(_,i)=>card('own-'+i,i))};
  state.view.table=Array.from({length:Number(q.get('pairs')||1)},(_,i)=>({attack:card('attack-'+i,i),...(mode==='defense'?{}:{defense:card('defense-'+i,i+1)})}));
  state.view.magic=Array.from({length:Number(q.get('magic')||3)},(_,i)=>({...card('magic-'+i,i),spell:['mirror','chance','fate','ghost_thief','magicians_hat'][i%5]}));
  state.allowed={attack:state.view.hand.cards.map(c=>c.id),defend:state.view.table.map((_,target)=>({target,cardRefs:['own-0']})),end:true,take:true,magic:state.view.magic.filter((_,i)=>i!==1).map(c=>c.id)};
  state.view.effects=[{id:'mirror',kind:'mirror',duration:{type:'permanent'}},{id:'monkey',kind:'monkey_prank',target:0,duration:{type:'rounds',remaining:2}}];
  if(mode==='ghost'){state.view.locked=[card('locked',8)];state.view.blockedCount=1;}
  if(mode==='blind'){state.view.hand={blind:true,cards:Array.from({length:count},(_,i)=>({ref:'opaque-'+i,hidden:true}))};state.allowed.attack=state.view.hand.cards.map(c=>c.ref);}
  if(mode==='quiz')state.challenge={challengeId:'quiz',magicRef:'magic-0',magicKind:'mirror',phase:'question',quiz:{challengeId:'quiz',direction:'ko-ru',prompt:'학교',options:['школа','длинный русский перевод ответа','парк','дом']}};
  if(mode==='fate')state.challenge={challengeId:'fate',magicRef:'magic-2',magicKind:'fate',phase:'target',target:{kind:'trump',suits:[1,2,3]}};
  if(mode==='hat')state.challenge={challengeId:'hat',magicRef:'magic-4',magicKind:'magicians_hat',phase:'target',target:{kind:'hat',cardRefs:['own-0','own-1']}};
  return state;
 });
 const [connected,setConnected]=useState(!q.has('offline')),[command,setCommand]=useState('');
 const room:PublicRoom={roomId:'sample',status:'playing',players:[{name:'Вы',connected:true},{name:'Соперник с длинным именем',connected:true}],createdAt:0,lastActiveAt:0,expiresAt:9999999999999,version:1};
 function act(intent:Intent){setCommand(JSON.stringify(intent));if(intent.type==='cancel_quiz')setSnapshot(s=>({...s,challenge:undefined}));}
 return <><NetworkTable snapshot={snapshot} events={[]} positions={[]} room={room} connected={connected} busy={q.has('busy')} error="" onCommand={act} onReconnect={()=>setConnected(true)}/><output className="sr-only" data-last-command={command}/></>;
}
createRoot(document.getElementById('root')!).render(<ProfileProvider><Fixture/></ProfileProvider>);
