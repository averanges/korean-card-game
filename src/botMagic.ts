import {beats,canUseMagic,normalCount,type Game,type Card,type Action} from './engine';
import {quizAnswer} from './magicQuiz';
import {gameDictionary} from './engine';
import {availableCards,hatTargets,magicUnavailable} from './trickRules';

// Deliberately modest: only clearly useful candidates reach the random choice.
export const botMagicSettings={minimumUtility:2,randomSpread:.7,activationProbability:.85};
type Evaluation={utility:number;trump?:number;targetId?:string};
type Evaluator=(g:Game)=>Evaluation;
const ordinary=(g:Game)=>availableCards(g,1);
const strength=(c:Card,g:Game)=>(g.inverted?8-c.rank:c.rank)+(c.suit===g.trump?10:0);
function defenseValue(g:Game){
 if(g.attacker===1)return 0;
 const hand=ordinary(g),pending=g.table.filter(p=>!p.defense);
 let value=0;
 for(const pair of pending){
  const choices=hand.filter(c=>beats(c,pair.attack,g)).sort((a,b)=>strength(a,g)-strength(b,g));
  const c=choices[0];if(c){value+=5-strength(c,g)*.08;hand.splice(hand.indexOf(c),1);}else value-=5;
 }
 return value;
}
const evaluators:Record<string,Evaluator>={
 mirror:g=>{
  if(g.inverted||g.effects.some(e=>e.modifier.inverted))return {utility:0};
  const hand=ordinary(g);if(!hand.length)return {utility:0};
  const reversed={...g,inverted:true};
  const gain=hand.reduce((sum,c)=>sum+(strength(c,reversed)-strength(c,g))*(c.suit===g.trump?1.2:1),0)/hand.length;
  const late=g.deck.length<8?1.2:1;
  return {utility:gain*late+(defenseValue(reversed)-defenseValue(g))*.7};
 },
 fate:g=>{
  const hand=ordinary(g),current=hand.reduce((sum,c)=>sum+(c.suit===g.trump?1+.08*(g.inverted?8-c.rank:c.rank):0),0);
  let best:Evaluation={utility:0};
  for(let trump=0;trump<4;trump++)if(trump!==g.trump){
   const next={...g,trump},potential=hand.reduce((sum,c)=>sum+(c.suit===trump?1+.08*(g.inverted?8-c.rank:c.rank):0),0);
   // Existing trump holdings are a cost, including when no defense is pending.
   const utility=(potential-current)*1.8+(defenseValue(next)-defenseValue(g))*.8;
   if(utility>best.utility)best={utility,trump};
  }
  return best;
 },
 ghost_thief:g=>({utility:availableCards(g,0).length?2+Math.max(0,5-normalCount(g.hands[0]))*.7:0}),
 trick_gift:g=>({utility:g.deck.some(c=>!c.spell)?Math.max(0,5-normalCount(g.hands[0]))*.9:0}),
 monkey_prank:g=>({utility:normalCount(g.hands[0])>=3?2+(g.attacker===1?1:0)+Math.min(1,normalCount(g.hands[0])*.1):0}),
 magicians_hat:g=>{
  // Publicly unseen cards include the opponent's hand: no hidden deck inspection.
  const seen=[...g.hands[1],...g.discard,...g.table.flatMap(p=>p.defense?[p.attack,p.defense]:[p.attack])];
  const unseen=Array.from({length:36},(_,i)=>({rank:i%9,suit:Math.floor(i/9),id:'potential-'+i,word:{ko:'',ru:''}})).filter(c=>!seen.some(s=>!s.spell&&s.rank===c.rank&&s.suit===c.suit));
  let best:Evaluation={utility:0};
  for(const card of hatTargets(g,1)){
   const higher=unseen.filter(c=>c.rank>card.rank);if(!higher.length)continue;
   const utility=higher.reduce((sum,c)=>sum+strength(c,g),0)/higher.length-strength(card,g);
   if(utility>best.utility)best={utility,targetId:card.id};
  }
  return best;
 },
 chance:g=>{
  const own=normalCount(g.hands[1]),opponent=normalCount(g.hands[0]);
  if(g.discard.length<6||g.deck.length>8||own<=2||own<=opponent)return {utility:0};
  const urgency=(8-g.deck.length)/8,behind=own-opponent;
  const average=ordinary(g).reduce((sum,c)=>sum+strength(c,g),0)/Math.max(1,own);
  return {utility:urgency*(behind*.9+(opponent<=2?2:0)+Math.min(2,g.discard.length/12))-(average>9?1:0)};
 }
};
export function evaluateMagic(g:Game,card:Card):Evaluation {
 // A new round opens with an ordinary attack. No casting while waiting or drawing.
 if(!canUseMagic(g,1)||!g.table.length||g.attacker!==1&&!g.table.some(p=>!p.defense))return {utility:0};
 if(g.attacker===1&&g.table.some(p=>!p.defense))return {utility:0};
 if(g.botMagicUsed||magicUnavailable(g,1,card.spell||''))return {utility:0};
 return evaluators[card.spell||'']?.(g)??{utility:0};
}
export function chooseBotMagic(g:Game,random=Math.random):Action|undefined {
 const candidates=g.hands[1].filter(c=>c.spell).map(card=>({card,...evaluateMagic(g,card)})).filter(c=>c.utility>=botMagicSettings.minimumUtility);
 if(!candidates.length)return;
 const dictionary=gameDictionary(g),question=dictionary.findIndex((_,i)=>quizAnswer(dictionary,i)!==undefined);
 if(question<0||random()>botMagicSettings.activationProbability)return;
 const best=candidates.map(c=>({...c,score:c.utility+(random()-.5)*botMagicSettings.randomSpread})).sort((a,b)=>b.score-a.score)[0];
 return {type:'magic',player:1,id:best.card.id,question,answer:quizAnswer(dictionary,question)!,trump:best.trump,targetId:best.targetId};
}
