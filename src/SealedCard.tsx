import type {CSSProperties} from 'react';
export function SealedCard({ko,mini=false}:{ko:string;mini?:boolean}){return <div className={'sealed-card '+(mini?'sealed-mini':'')} style={{'--ko-length':[...ko].length} as CSSProperties}><span lang="ko" className="sealed-word">{ko}</span></div>;}
