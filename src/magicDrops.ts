import type {Game,Player} from './engine';
import {spells} from './spells';

export const magicDropSettings={chance:.22,repeatMultiplier:.8,minimumMultiplier:.65,legendaryWeight:.35,majorWeight:1};
export function magicDropChance(g:Game,p:Player){
 const round=g.round??0;
 const recent=(g.magicDropHistory?.[p]??[]).filter(r=>r>=round-1&&r<=round).length;
 return magicDropSettings.chance*Math.max(magicDropSettings.minimumMultiplier,magicDropSettings.repeatMultiplier**recent);
}
/** Called only after a real ordinary refill, never by the initial deal or Gift/Hat. */
export function rollMagicDrop(g:Game,p:Player,random=Math.random){
 if(!g.magicPool?.length||g.winner||random()>=magicDropChance(g,p))return;
 const weights=g.magicPool.map(c=>spells.find(s=>s.id===c.spell)?.tier==='legendary'?magicDropSettings.legendaryWeight:magicDropSettings.majorWeight);
 let pick=random()*weights.reduce((sum,w)=>sum+w,0),index=weights.length-1;
 for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<0){index=i;break;}}
 g.hands[p].push(g.magicPool.splice(index,1)[0]);
 const round=g.round??0;
 g.magicDropHistory??=[[],[]];
 g.magicDropHistory[p]=[...g.magicDropHistory[p].filter(r=>r>=round-1),round];
}
