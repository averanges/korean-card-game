import {useLayoutEffect,useRef} from 'react';

/** Measure only on layout changes, never on scroll pixels or animation frames. */
export function useTableLayout(){
 const root=useRef<HTMLElement>(null),request=useRef<()=>void>(()=>{});
 useLayoutEffect(()=>{
  const table=root.current;if(!table)return;
  let frame=0,disposed=false;
  const px=(name:string,value:number)=>{const next=Math.round(value)+'px';if(table.style.getPropertyValue(name)!==next)table.style.setProperty(name,next);};
  const measure=()=>{
   frame=0;if(disposed)return;
   const bounds=table.getBoundingClientRect(),header=table.querySelector<HTMLElement>('header'),hand=table.querySelector<HTMLElement>('.normal-hand');
   if(!header||!hand)return;
   const footer=header.getBoundingClientRect();
   px('--footer-reserve',bounds.bottom-footer.top+10);
   const turn=table.querySelector<HTMLElement>('.turn-status')?.getBoundingClientRect(),trump=table.querySelector<HTMLElement>('.magic-status')?.getBoundingClientRect();
   if(turn){px('--temporary-top',turn.bottom-bounds.top+7);px('--temporary-left',turn.left-bounds.left);}
   if(trump){px('--permanent-top',trump.bottom-bounds.top+7);px('--permanent-right',bounds.right-trump.right);}
   let upper=bounds.top;
   for(const el of Array.from(table.querySelectorAll<HTMLElement>('.statusbar>.status,.statusbar>.opponent,.bot-hand .back,.effect-zone'))){
    if(el.offsetWidth&&el.offsetHeight)upper=Math.max(upper,el.getBoundingClientRect().bottom);
   }
   // The viewport includes the full selection lift and rotation clearance.
   const handTop=hand.getBoundingClientRect().top;
   const compact=bounds.height<800,gap=compact?8:16;
   const top=upper-bounds.top+gap,bottom=bounds.bottom-handTop+gap;
   px('--arena-top',top);px('--arena-bottom',bottom);
   const actions=table.querySelector<HTMLElement>('.actions')?.getBoundingClientRect();
   if(actions){
    // Keep notices above the actual button group at every viewport size.
    px('--notice-bottom',bounds.bottom-actions.top+12);
    px('--notice-right',bounds.right-actions.right);
    const permanent=table.querySelector<HTMLElement>('.effect-zone.permanent')?.getBoundingClientRect();
    const noticeTop=Math.max(trump?.bottom??bounds.top,permanent?.bottom??bounds.top)+12;
    px('--notice-space',Math.max(56,actions.top-noticeTop-12));
   }
   const battle=table.querySelector<HTMLElement>('.battle');
   if(battle){
    const height=Math.max(0,bounds.height-top-bottom-24);
    const desired=bounds.width<=500?96:Math.min(180,Math.max(112,bounds.width*.092));
    // Includes the existing .48-height defense offset and both card rotations.
    px('--board-card-width',Math.max(60,Math.min(desired,height/2.43,(battle.clientWidth-24)/1.94)));
   }
  };
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(measure);};
  request.current=schedule;
  const observer=new ResizeObserver(schedule);
  for(const el of [table,...Array.from(table.querySelectorAll<HTMLElement>('header,.normal-hand,.statusbar,.bot-hand,.effect-icons,.actions'))])observer.observe(el);
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  document.fonts.ready.then(schedule);measure();
  return()=>{disposed=true;request.current=()=>{};cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};
 },[]);
 useLayoutEffect(()=>{request.current();});
 return root;
}
