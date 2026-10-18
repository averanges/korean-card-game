import { useLayoutEffect, useRef } from 'react';
import type { handLayout } from './handModel';

export function useHandScroll(ids: string[], selected: readonly string[], layout: ReturnType<typeof handLayout>) {
  const viewport = useRef<HTMLDivElement>(null);
  const snapshot = useRef<{ids:string[];positions:typeof layout.positions;scroll:number}>();
  const swipe=useSwipeGuard();
  const updateEdges=()=>{const el=viewport.current;if(el){el.dataset.edgeLeft=String(el.scrollLeft>4);el.dataset.edgeRight=String(el.scrollLeft+el.clientWidth<el.scrollWidth-4);}};
  const previousSelection = useRef('');
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const old = snapshot.current;
    if (old && ids.join('|') !== old.ids.join('|')) {
      const anchor = old.ids.find((id,i) => ids.includes(id) && old.positions[i].x >= old.scroll);
      if (anchor) {
        const oldIndex = old.ids.indexOf(anchor), newIndex = ids.indexOf(anchor);
        el.scrollLeft = Math.max(0, old.scroll + layout.positions[newIndex].x - old.positions[oldIndex].x);
      }
    }
    const selectedId = selected.at(-1) || '';
    if (selectedId && (selectedId !== previousSelection.current || ids.join('|') !== old?.ids.join('|') || old?.positions[ids.indexOf(selectedId)]?.x !== layout.positions[ids.indexOf(selectedId)]?.x)) {
      const index = ids.indexOf(selectedId), pos = layout.positions[index];
      if (pos) {
        if (pos.x < el.scrollLeft+18) el.scrollLeft = Math.max(0,pos.x-18);
        else if (pos.x+layout.cardWidth > el.scrollLeft+el.clientWidth-18) el.scrollLeft = pos.x+layout.cardWidth-el.clientWidth+18;
      }
    }
    updateEdges();
    previousSelection.current = selectedId;
    snapshot.current = {ids:[...ids],positions:layout.positions,scroll:el.scrollLeft};
  });
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e:WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX)>Math.abs(e.deltaY) || el.scrollWidth<=el.clientWidth+1) return;
      const page = document.scrollingElement;
      const pageNeedsScroll = page && (e.deltaY>0 ? page.scrollTop+page.clientHeight<page.scrollHeight-1 : page.scrollTop>0);
      if (pageNeedsScroll) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * (e.deltaMode===1?18:e.deltaMode===2?el.clientWidth:1);
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return () => el.removeEventListener('wheel',wheel);
  },[]);
  return { viewport, handlers: {...swipe,
    onScroll: () => {updateEdges();if(snapshot.current&&viewport.current)snapshot.current.scroll=viewport.current.scrollLeft;}
  }};
}

export function useSwipeGuard(){
 const gesture=useRef({x:0,y:0,active:false,moved:false,until:0});
 return {
  onPointerDownCapture:(e:React.PointerEvent)=>{gesture.current={x:e.clientX,y:e.clientY,active:true,moved:false,until:0};},
  onPointerMoveCapture:(e:React.PointerEvent)=>{const g=gesture.current;if(g.active&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)g.moved=true;},
  onPointerUpCapture:()=>{const g=gesture.current;g.active=false;if(g.moved)g.until=Date.now()+400;},
  onPointerCancel:()=>{gesture.current.active=false;gesture.current.until=Date.now()+400;},
  onClickCapture:(e:React.MouseEvent)=>{if(e.detail!==0&&(gesture.current.moved||Date.now()<gesture.current.until)){e.preventDefault();e.stopPropagation();}}
 };
}
