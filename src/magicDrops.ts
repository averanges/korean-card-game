import type {Game,Player} from './engine';
import {spells} from './spells';

export const magicDropSettings={legendaryWeight:.35,majorWeight:1};
/** Weighted finite-pool selection shared by learning rewards. No drop probability here. */
export function awardMagic(g:Game,p:Player,random=Math.random){
 if(!g.magicPool?.length||g.winner)return;
 const weights=g.magicPool.map(c=>spells.find(s=>s.id===c.spell)?.tier==='legendary'?magicDropSettings.legendaryWeight:magicDropSettings.majorWeight);
 let pick=random()*weights.reduce((sum,w)=>sum+w,0),index=weights.length-1;
 for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<0){index=i;break;}}
 g.hands[p].push(g.magicPool.splice(index,1)[0]);
}
