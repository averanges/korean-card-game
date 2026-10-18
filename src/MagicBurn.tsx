import {legendaryTimings} from './animationModel';
import type {CSSProperties} from 'react';

/** Fixed handful of decorative fragments; no particle simulation. */
export function MagicBurn({delay=0,duration=legendaryTimings.burn}:{delay?:number;duration?:number}){
 return <span className="burn-decoration" aria-hidden="true" style={{'--burn-delay':delay+'ms','--burn-duration':duration+'ms'} as CSSProperties}>
  <span className="burn-edges"/>
  {[0,1,2,3,4,5].map(i=><i key={i} className="burn-spark" style={{'--spark-x':(12+i*15)+'%','--spark-dx':(i%2?12:-12)+'px','--spark-turn':(i*19-40)+'deg'} as CSSProperties}/>)}
 </span>;
}
