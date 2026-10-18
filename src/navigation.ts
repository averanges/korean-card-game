export function navigate(path:string){if(location.pathname!==path){history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'));}}
let guard:(()=>boolean)|undefined;
export const allowNavigation=()=>guard?.()??true;
export function guardNavigation(check:()=>boolean){guard=check;return()=>{if(guard===check)guard=undefined;};}
