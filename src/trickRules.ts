import {isStudyLocked} from './learning';
import type {Card,Game,Player} from './engine';
import {spellNames} from './spells';

export const isGhostLocked=(g:Game,c:Card)=>g.effects.some(e=>e.kind==='ghost_thief'&&e.lockedCardId===c.id);
export const isLocked=(g:Game,c:Card)=>isStudyLocked(g,c)||isGhostLocked(g,c);
export const availableCards=(g:Game,p:Player)=>g.hands[p].filter(c=>!c.spell&&!isLocked(g,c));
export const blindAttack=(g:Game,p:Player)=>g.attacker===p&&!g.table.length&&g.effects.some(e=>e.kind==='monkey_prank'&&e.target===p&&e.status==='pending');
export const singleAttack=(g:Game,p:Player)=>g.effects.some(e=>e.kind==='monkey_prank'&&e.target===p&&(e.status==='active'||blindAttack(g,p)));
export const hatTargets=(g:Game,p:Player)=>availableCards(g,p).filter(c=>g.deck.some(next=>!next.spell&&next.rank>c.rank));
export function magicUnavailable(g:Game,p:Player,spell:string):string|undefined {
 if(g.winner)return 'Партия завершена';
 if(g.taking||g.attacker!==p&&!g.table.length)return 'Дождитесь своей атаки или защиты';
 if(blindAttack(g,p))return 'Сначала выберите карту для атаки вслепую';
 if(spell==='ghost_thief'&&!availableCards(g,(1-p) as Player).length)return 'У соперника нет доступных обычных карт';
 if(spell==='trick_gift'&&!g.deck.some(c=>!c.spell))return 'В колоде нет обычных карт';
 if(spell==='monkey_prank'&&g.effects.some(e=>e.kind==='monkey_prank'&&e.target===1-p))return 'На сопернике уже действует Обезьянья проделка';
 if(spell==='magicians_hat'&&!hatTargets(g,p).length)return 'Нет доступного обмена на более высокий номинал';
}
export function applyTrick(g:Game,p:Player,magic:Card,targetId?:string,random=Math.random){
 const target=(1-p) as Player,round=g.round??0;
 if(magic.spell==='ghost_thief'){
  const choices=availableCards(g,target),c=choices[Math.floor(random()*choices.length)];
  g.effects.push({id:magic.id,kind:'ghost_thief',name:spellNames.ghost_thief,description:'Одна обычная карта временно недоступна. Её достоинство и масть скрыты.',target,status:'active',lockedCardId:c.id,expiresRound:round+(g.table.length?2:1),duration:{type:'event',event:'ghost-release',label:'До конца следующего полного раунда'},modifier:{}});
 }else if(magic.spell==='trick_gift'){
  const index=g.deck.map(c=>!c.spell).lastIndexOf(true);g.hands[target].push(g.deck.splice(index,1)[0]);
 }else if(magic.spell==='monkey_prank'){
  g.effects.push({id:magic.id,kind:'monkey_prank',name:spellNames.monkey_prank,description:'Следующая атака — одной картой вслепую; подкидывание запрещено до конца её раунда.',target,status:'pending',duration:{type:'event',event:'monkey-resolved',label:'Ожидает следующей атаки'},modifier:{}});
 }else if(magic.spell==='magicians_hat'){
  const c=g.hands[p].find(c=>c.id===targetId)!;
  const choices=g.deck.filter(next=>!next.spell&&next.rank>c.rank),next=choices[Math.floor(random()*choices.length)];
  g.deck=g.deck.filter(c=>c.id!==next.id);g.hands[p]=g.hands[p].filter(x=>x.id!==c.id);g.hands[p].push(next);g.discard.push(c);
 }
}
export function advanceTricks(g:Game){
 g.round=(g.round??0)+1;
 g.effects=g.effects.filter(e=>e.expiresRound===undefined||e.expiresRound>g.round!);
}
