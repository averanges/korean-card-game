import type {Action,Card,Game,Player} from './engine';
import {gameDictionary} from './engine';
import {quizAnswer} from './magicQuiz';

export type MagicAnimationIntensity='minor'|'major'|'legendary';
export interface MagicAnimationConfig {intensity:MagicAnimationIntensity;animationId:string;accentColor:string}
export const magicAnimations:Record<string,MagicAnimationConfig>={
  mirror:{intensity:'legendary',animationId:'mirror-wave',accentColor:'#d3b8ff'},
  chance:{intensity:'legendary',animationId:'reverse-hourglass',accentColor:'#6eddd3'},
  fate:{intensity:'legendary',animationId:'suit-wheel',accentColor:'#f6c773'},
  ghost_thief:{intensity:'major',animationId:'ghost-steal',accentColor:'#a6d8ff'},
  trick_gift:{intensity:'major',animationId:'gift-surprise',accentColor:'#ffc476'},
  monkey_prank:{intensity:'major',animationId:'monkey-trick',accentColor:'#f6b96c'},
  magicians_hat:{intensity:'major',animationId:'hat-exchange',accentColor:'#d7a6ff'}
};
export const intensityDuration={minor:250,major:900,legendary:2400};
export const legendaryTimings={receive:1600,answer:850,wrongAnswer:1200,burn:1100,indicatorStart:900,indicator:1000,counter:850,notice:5200};
export type AnimationType='card_attack'|'card_defend'|'card_throw_in'|'cards_drawn'|'magic_received'|'magic_activated'|'magic_failed'|'magic_expired'|'round_defended'|'cards_taken';
export interface CardPosition {card:Card;x:number;y:number;width:number;height:number;rotation:number}
export interface GameAnimationEvent {type:AnimationType;player:Player;cards:Card[];delay:number;duration:number;magicId?:string;trump?:number;previousTrump?:number;previousDeck?:number;nextDeck?:number;compact?:boolean;correctAnswer?:string;positions?:CardPosition[];targetPlayer?:Player;exchange?:{oldCard:Card;newCard:Card}}
export interface AnimationEntry extends GameAnimationEvent {id:string;created:number;ends:number}

export function initialDrawEvents(g:Game):GameAnimationEvent[]{
  return ([0,1] as const).flatMap(p=>drawEvents(g.hands[p],p,0));
}
function drawEvents(cards:Card[],player:Player,baseDelay:number):GameAnimationEvent[]{
  return cards.map((card,i)=>({type:card.spell?'magic_received':'cards_drawn',player,cards:[card],delay:baseDelay+Math.min(i*75,350),duration:player===1?230:card.spell?(magicAnimations[card.spell]?.intensity==='legendary'?legendaryTimings.receive:700):320}));
}
// Only confirmed transitions produce events. The engine does not depend on this module.
export function animationEvents(before:Game,after:Game,action:Action):GameAnimationEvent[]{
  if(before===after)return [];
  const events:GameAnimationEvent[]=[];
  if(action.type==='attack'){
    action.ids.forEach((id,i)=>{const c=after.table.find(p=>p.attack.id===id)?.attack;if(c)events.push({type:before.table.length?'card_throw_in':'card_attack',player:action.player,cards:[c],delay:Math.min(i*100,350),duration:before.table.length?210:520});});
  }else if(action.type==='defend'){
    const c=after.table[action.target]?.defense;if(c)events.push({type:'card_defend',player:action.player,cards:[c],delay:0,duration:780});
  }else if(action.type==='end'&&before.table.length&&!after.table.length){
    events.push({type:before.taking?'cards_taken':'round_defended',player:(1-before.attacker) as Player,cards:before.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack]),delay:0,duration:before.taking?350:280});
  }else if(action.type==='magic'){
    const c=before.hands[action.player].find(c=>c.id===action.id);
    if(c?.spell&&after.magic.includes(c.id)&&!before.magic.includes(c.id)){
      const correct=quizAnswer(gameDictionary(before),action.question,action.direction)===action.answer;
      events.push({type:correct?'magic_activated':'magic_failed',player:action.player,cards:[c],targetPlayer:(c.spell==='magicians_hat'?action.player:1-action.player) as Player,exchange:c.spell==='magicians_hat'&&correct?{oldCard:before.hands[action.player].find(x=>x.id===action.targetId)!,newCard:after.hands[action.player].find(x=>!before.hands[action.player].some(old=>old.id===x.id))!}:undefined,magicId:c.spell,trump:after.trump,previousTrump:before.trump,previousDeck:before.deck.length,nextDeck:after.deck.length,correctAnswer:quizAnswer(gameDictionary(before),action.question,action.direction),delay:action.player===0?(correct?(c.spell==='fate'&&action.trump!==undefined?140:legendaryTimings.answer):legendaryTimings.wrongAnswer):0,duration:correct?intensityDuration[magicAnimations[c.spell]?.intensity||'minor']:legendaryTimings.burn});
    }
  }
  for(const effect of before.effects.filter(e=>['ghost_thief','monkey_prank'].includes(e.kind)&&!after.effects.some(next=>next.id===e.id))){const card=effect.target===0?after.hands[0].find(c=>c.id===effect.lockedCardId):undefined;events.push({type:'magic_expired',player:effect.target??0,cards:card?[card]:[],magicId:effect.kind,delay:0,duration:650});}
  const deckIds=new Set(before.deck.map(c=>c.id));
  for(const player of [0,1] as const){
    // Cards taken from the table are not new draws; shuffled discard is not a draw either.
    const added=after.hands[player].filter(c=>(deckIds.has(c.id)||c.spell&&before.magicPool?.some(m=>m.id===c.id))&&!before.hands[player].some(old=>old.id===c.id));
    if(action.type==='magic'&&events.some(e=>e.magicId==='magicians_hat'&&e.type==='magic_activated'))continue;const cast=events.find(e=>e.type==='magic_activated'&&e.magicId==='trick_gift');events.push(...drawEvents(added,player,action.type==='end'?320:cast?cast.delay+650:0));
  }
  return events;
}

export function boundTimeline(events:GameAnimationEvent[],simple:boolean):GameAnimationEvent[]{
  return events.slice(0,30).map(e=>simple?{...e,delay:0,duration:120}:e);
}
