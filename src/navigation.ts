import {withBase} from './hosting';
export function navigate(path:string){const target=withBase(path);if(location.pathname!==target){history.pushState(null,'',target);window.dispatchEvent(new PopStateEvent('popstate'));}}
let guard:(()=>boolean)|undefined;
export const allowNavigation=()=>guard?.()??true;
export function guardNavigation(check:()=>boolean){guard=check;return()=>{if(guard===check)guard=undefined;};}
