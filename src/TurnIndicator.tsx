import {useId} from 'react';

export function TurnIndicator({attacking,winner}:{attacking:boolean;winner?:string}){
 const id=useId().replace(/:/g,'');
 return <div className={'status turn-status '+(attacking?'is-attack':'is-defense')}>
  <svg className="phase-tint" viewBox="0 0 374 112" preserveAspectRatio="none" aria-hidden="true" focusable="false">
   <defs>
    <clipPath id={'phase-clip-'+id}><path d="M50 21H310L316 27Q332 29 333 45L340 56 333 67Q332 83 316 85L310 91H50Z"/></clipPath>
    <linearGradient id={'phase-color-'+id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--phase-fill)" stopOpacity="0"/><stop offset="1" stopColor="var(--phase-fill)"/></linearGradient>
   </defs>
   <rect x="0" y="56" width="374" height="36" fill={'url(#phase-color-'+id+')'} clipPath={'url(#phase-clip-'+id+')'}/>
  </svg>
  <span className="status-icon" aria-hidden="true">♟</span>
  <div className="turn-copy"><small>{winner?'Партия завершена':attacking?'Ваш ход':'Ход соперника'}</small><strong><span className={'phase-icon '+(attacking?'attack':'defense')} aria-hidden="true">{attacking?'⚔':'♢'}</span><span>{winner||(attacking?'Атака':'Защита')}</span></strong></div>
 </div>;
}
