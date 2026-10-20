import {Component,useEffect,type ReactNode} from 'react';
interface StartupWatch {ready:()=>void;fail:(code:string)=>void}
const watch=()=> (window as Window&{HangulStartup?:StartupWatch}).HangulStartup;
function Ready(){useEffect(()=>watch()?.ready(),[]);return null;}
/** Only startup/render reporting. Never serializes errors, props or room state. */
export class StartupBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){watch()?.fail('react-render');}
 render(){return this.state.failed?null:<>{this.props.children}<Ready/></>;}
}
