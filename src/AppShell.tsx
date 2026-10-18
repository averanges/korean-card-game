import {useEffect,useRef,useState,type ComponentType} from 'react';
import {ProfileProvider} from './ProfileContext';
import {MainMenu} from './MainMenu';
import {RoomLobby} from './rooms/RoomLobby';
import {navigate,allowNavigation} from './navigation';
function Routes({Solo}:{Solo:ComponentType<{active:boolean}>}){
 const [path,setPath]=useState(location.pathname),[soloRun,setSoloRun]=useState(()=>location.pathname==='/singleplayer'?1:0);
 const previousPath=useRef(path);
 useEffect(()=>{const change=()=>{if(!allowNavigation()){history.pushState(null,'',previousPath.current);return;}previousPath.current=location.pathname;setPath(location.pathname);if(location.pathname==='/singleplayer')setSoloRun(n=>n||1);};window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
 const single=path==='/singleplayer',room=path==='/multiplayer'||path.startsWith('/room/');
 return <>{soloRun>0&&<div hidden={!single} className="single-session-cache"><Solo key={soloRun} active={single}/></div>}{room?<RoomLobby key={path}/>:!single?<MainMenu resumable={soloRun>0} onSolo={()=>{setSoloRun(n=>n+1);navigate('/singleplayer');}}/>:null}</>;
}
export function AppShell({Solo}:{Solo:ComponentType<{active:boolean}>}){return <ProfileProvider><Routes Solo={Solo}/></ProfileProvider>;}
