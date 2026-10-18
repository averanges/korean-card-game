import {useId,type CSSProperties} from 'react';
import type {AnimationEntry} from './animationModel';

/** A sibling of the physical card, so the barrier can precede its appearance. */
export function BoardImpact({cue}:{cue:AnimationEntry}){
  const id=useId().replace(/:/g,'');
  const defense=cue.type==='card_defend';
  return <div className={'board-impact '+(defense?'defense-impact':'attack-impact')+(cue.type==='card_throw_in'?' light-impact':'')} aria-hidden="true" style={{'--duration':cue.duration+'ms','--delay':cue.delay+'ms'} as CSSProperties}>
    <svg viewBox="0 0 200 300" preserveAspectRatio="none" focusable="false">
      <defs><radialGradient id={'ground-'+id}><stop stopColor={defense?'#bd8df8':'#ffdc86'} stopOpacity=".65"/><stop offset="1" stopColor={defense?'#8451ce':'#e6a942'} stopOpacity="0"/></radialGradient></defs>
      {defense?<>
        <ellipse className="barrier-ground" cx="100" cy="258" rx="130" ry="43" fill={`url(#ground-${id})`}/>
        <g className="barrier-shell"><path d="M-8 14 100-20 208 14 208 222 100 322-8 222Z" fill="#b594e8" fillOpacity=".1" stroke="#c6a6ff" strokeWidth="2" vectorEffect="non-scaling-stroke"/><path d="M0 22 100-10 200 22 200 218 100 311 0 218Z" fill="none" stroke="#e1cbff" strokeOpacity=".55" strokeWidth=".7" vectorEffect="non-scaling-stroke"/></g>
        <path className="barrier-cracks" d="m100-20-7 23 15 18M208 90l-17 12 14 20M166 260l-12-4-7 21M38 265l11-22-15-2M-8 98l17 14-15 15" fill="none" stroke="#f0dfff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
        {[{x:25,y:0,dx:-18,dy:-22,r:-18},{x:175,y:0,dx:18,dy:-22,r:18},{x:208,y:126,dx:26,dy:-2,r:24},{x:162,y:273,dx:18,dy:23,r:18},{x:38,y:273,dx:-18,dy:23,r:-20},{x:-8,y:126,dx:-26,dy:-2,r:-24}].map((p,i)=><g key={i} className="barrier-fragment" style={{'--fx':p.dx+'px','--fy':p.dy+'px','--fr':p.r+'deg'} as CSSProperties}><path d={`M${p.x-4} ${p.y-12}l9 5-3 22-8-10Z`} fill="#c5a1fb" fillOpacity=".4" stroke="#e4cdff" strokeWidth="1" vectorEffect="non-scaling-stroke"/></g>)}
      </>:<>
        <path className="strike-contact" d="M-28 300 18 285 38 298 62 282 88 295 112 283 141 299 165 285 228 302 184 316 150 310 120 322 90 310 56 324 22 309Z" fill="#fff0bb"/>
        <path className="strike-flash" d="M-22 220 2 236-10 242 5 270-30 246-12 241ZM222 220 198 236 210 242 195 270 230 246 212 241Z" fill="#fff0b6"/>
        <ellipse className="strike-ground" cx="100" cy="298" rx="142" ry="52" fill={`url(#ground-${id})`}/>
        <ellipse className="strike-ring" cx="100" cy="255" rx="116" ry="58" fill="none" stroke="#ffe6a2" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
        {Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return <g className="strike-ray" key={i} style={{'--rx':Math.cos(a)*35+'px','--ry':Math.sin(a)*40+'px'} as CSSProperties}><path d="M-3 3 0-20 5-5 3 10Z" transform={`translate(${100+Math.cos(a)*116} ${150+Math.sin(a)*163}) rotate(${i*45+90})`} fill={i%2?'#ffd269':'#fff3c7'} stroke="#ffeab1" strokeWidth=".7" vectorEffect="non-scaling-stroke"/></g>;})}
      </>}
    </svg>
  </div>;
}
