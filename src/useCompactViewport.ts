import {useEffect,useState} from 'react';

export const compactViewportQuery='(max-width: 600px), (max-width: 1000px) and (max-height: 500px)';
/** Shared presentation breakpoint; never changes game state or legal actions. */
export function useCompactViewport(){
 const [compact,setCompact]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia(compactViewportQuery).matches);
 useEffect(()=>{const query=matchMedia(compactViewportQuery),change=()=>setCompact(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 return compact;
}
