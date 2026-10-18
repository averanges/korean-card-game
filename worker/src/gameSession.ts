import {createOrdinaryGame,ordinaryTransition,ordinaryView} from '../../src/game-core/ordinary';
import {projectEventsForPlayer,projectGameForPlayer,resolveBlindReference} from '../../src/game-core/projection';
import {createGame,type Action,type Game} from '../../src/engine';
import {beginMagicChallenge,answerMagicChallenge,cancelMagicChallenge,chooseMagicTarget,createChallengeBook} from '../../src/game-core/challenges';
import {quizWordKey} from '../../src/magicQuiz';
import {availableCards,blindAttack,singleAttack} from '../../src/trickRules';
import type {DomainEvent,PlayerEvent} from '../../src/game-core/types';
import type {CommandResult,NetworkCommand,Seat,GameSnapshot} from '../../src/rooms/protocol';
import type {StoredRoom} from './model';
import {migrateRoom,refreshBlind,restoreProjection,canStartMagic,pendingChallenge,publicChallenge,extraMagicEvents} from './magicSession';
export function serverRandom():number {return crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}
export function applyCommand(room:StoredRoom,p:Seat,c:NetworkCommand,random=serverRandom):{result:CommandResult;game?:Game;events:DomainEvent[];state?:StoredRoom} {
 const revision=room.gameRevision??0;
 const reject=(code:string)=>({result:{requestId:c.requestId,ok:false,revision,code},events:[]});
 if(c.expectedRevision!==revision)return reject('stale_revision');
 const state=structuredClone(room);migrateRoom(state,random);state.challenges??=createChallengeBook();
 const complete=(game:Game,events:DomainEvent[]=[])=>{
  state.game=game;state.gameRevision=revision+1;
  // Resolve lost opportunities in the same commit as the opponent's action. In
  // particular, an empty Hat target list must never leave its owner stuck.
  for(const seat of [0,1] as const){const pending=pendingChallenge(state,seat);if(pending){const card=game.hands[seat].find(c=>c.id===pending.cardId);if(!card?.spell||!canStartMagic(game,seat,card.spell)){pending.phase='resolved';pending.outcome='unavailable';}}}
  refreshBlind(state,random);return {result:{requestId:c.requestId,ok:true,revision:revision+1},game,events,state};
 };
 if(c.type==='start_game'){
  if(room.game)return reject('already_started');
  if(p!==0)return reject('host_only');
  if(!room.players.every(player=>player?.connectionId))return reject('players_not_ready');
  const game=state.gameMode==='ordinary'?createOrdinaryGame(random):createGame(random);
  return complete(game,([0,1] as const).map(player=>({type:'cards_drawn',player,cards:game.hands[player]})));
 }
 if(!room.game)return reject('game_not_started');
 if(room.game.winner)return reject('game_finished');
 const book=state.challenges!,g=room.game;
 if(c.type==='begin_magic') {
  if(pendingChallenge(state,p))return reject('challenge_pending');
  const card=g.hands[p].find(card=>card.id===c.magicRef);
  if(state.gameMode!=='magic'||!card?.spell||!canStartMagic(g,p,card.spell))return reject('magic_unavailable');
  let id=crypto.randomUUID();while(book.usedIds.includes(id))id=crypto.randomUUID();
  const next=beginMagicChallenge(g,book,p,c.magicRef,id,state.recentQuestions?.[p],random);
  if(next===book||next.attempts[p]?.quiz.options.length!==4)return reject('magic_unavailable');
  state.challenges=next;state.recentQuestions??=[[],[]];const question=next.attempts[p]!.quiz;
  if(g.dictionary?.[question.index])state.recentQuestions[p]=[...state.recentQuestions[p],quizWordKey(g.dictionary[question.index])].slice(-8);
  return complete(g);
 }
 if(['answer_quiz','cancel_quiz','choose_trump','choose_hat_card'].includes(c.type)) {
  if(!('challengeId' in c))return reject('invalid_challenge');
  const attempt=book.attempts[p];
  if(!attempt||attempt.id!==c.challengeId||!['question','target'].includes(attempt.phase))return reject('invalid_challenge');
  if(c.type==='cancel_quiz'){const next=cancelMagicChallenge(book,p,c.challengeId);if(next===book)return reject('answer_committed');state.challenges=next;return complete(g);}
  if(c.type==='answer_quiz'&&attempt.phase!=='question'||c.type!=='answer_quiz'&&attempt.phase!=='target')return reject('invalid_challenge');
  const card=g.hands[p].find(card=>card.id===attempt.cardId);
  if(!card?.spell||!canStartMagic(g,p,card.spell)){attempt.phase='resolved';attempt.outcome='unavailable';return complete(g);}
  if(c.type==='choose_trump'&&card.spell!=='fate'||c.type==='choose_hat_card'&&card.spell!=='magicians_hat')return reject('invalid_target');
  const next=c.type==='answer_quiz'?answerMagicChallenge(g,book,p,c.challengeId,c.option,random):c.type==='choose_trump'?chooseMagicTarget(g,book,p,c.challengeId,{trump:c.trump},random):c.type==='choose_hat_card'?chooseMagicTarget(g,book,p,c.challengeId,{cardId:c.cardRef},random):undefined;
  if(!next||next.book===book)return reject('invalid_target');
  state.challenges=next.book;return complete(next.game,extraMagicEvents(g,next.game,next.action));
 }
 if(pendingChallenge(state,p))return reject('challenge_pending');
 let action:Action;
 if(c.type==='attack') {
  let ids=c.cardRefs;
  if(blindAttack(g,p)) {if(ids.length!==1)return reject('illegal_move');const id=resolveBlindReference(g,p,ids[0],restoreProjection(state));if(!id)return reject('invalid_blind_reference');ids=[id];}
  action={type:'attack',player:p,ids};
 }else if(c.type==='defend')action={type:'defend',player:p,id:c.cardRef,target:c.target};
 else if(c.type==='end'||c.type==='take'||c.type==='pass')action={type:c.type,player:p};
 else return reject('illegal_move');
 const next=ordinaryTransition(room.game,action,random);
 if(next.game===room.game)return reject('illegal_move');
 return complete(next.game,[...next.events,...extraMagicEvents(g,next.game)]);
}
export function sessionSnapshot(room:StoredRoom,p:Seat):GameSnapshot|undefined {
 if(!room.game)return;
 const g=room.game,context=restoreProjection(room),snapshot:GameSnapshot=ordinaryView(g,p,room.gameRevision??0);
 snapshot.view=projectGameForPlayer(g,p,context);
 if(snapshot.view.hand.blind){const byRef=new Map(snapshot.view.hand.cards.map(c=>[c.ref,c]));snapshot.view.hand.cards=(room.blind?.orders[p]??[]).map(id=>byRef.get(context.references[p].get(id)!)!).filter(Boolean);snapshot.allowed.attack=snapshot.view.hand.cards.map(c=>c.ref);}
 if(singleAttack(g,p)&&g.table.length)snapshot.allowed.attack=[];
 snapshot.allowed.pass=!g.winner&&g.attacker===p&&!g.table.length&&!availableCards(g,p).length&&g.hands[p].some(c=>!c.spell);
 snapshot.allowed.magic=g.hands[p].filter(c=>c.spell&&canStartMagic(g,p,c.spell)).map(c=>c.id);
 snapshot.challenge=publicChallenge(room,p);
 if(pendingChallenge(room,p))snapshot.allowed={attack:[],defend:[],take:false,end:false,magic:[],pass:false};
 return snapshot;
}
export const sessionEvents=(events:DomainEvent[],p:Seat,room?:StoredRoom):PlayerEvent[]=>projectEventsForPlayer(events,p).map(e=>{
 // A Gift or an expiring lock must not reveal faces while the recipient's hand is blind.
 if(room?.game&&blindAttack(room.game,p)&&['cards_drawn','magic_expired'].includes(e.type)){const {cards,...publicEvent}=e;return publicEvent;}
 return e;
});
