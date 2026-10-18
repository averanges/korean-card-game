import type {Card,Game,GameResult,Player,Pair} from '../engine';
import type {SpellKind,Duration} from '../effects';
export type GameState=Game;
export interface PublicEffect {id:string;kind:SpellKind;duration:Duration;target?:Player;status?:'pending'|'active'}
export type HandView={blind:false;cards:Card[]}|{blind:true;cards:{ref:string;hidden:true}[]};
export interface PlayerView {
 player:Player;hand:HandView;magic:Card[];blockedCount:number;
 opponent:{ordinaryCount:number;magicCount:number;blockedCount:number};
 table:Pair[];deckCount:number;trump:number;inverted:boolean;round:number;
 attacker:Player;actors:Player[];phase:'attack'|'defense'|'taking'|'finished';limit:number;
 effects:PublicEffect[];result?:GameResult;
}
type Envelope={requestId:string;expectedRevision:number};
export type ClientCommand=Envelope&(
 {type:'attack';cardRefs:string[]}|{type:'defend';cardRef:string;target:number}|
 {type:'end'|'take'|'pass'}|{type:'begin_magic';magicRef:string}|
 {type:'answer_quiz';challengeId:string;option:number}|{type:'cancel_quiz';challengeId:string}|
 {type:'choose_trump';challengeId:string;trump:number}|{type:'choose_hat_card';challengeId:string;cardRef:string}
);
// Internal semantic events accept the existing animation event structure, but do not
// depend on its DOM positions, timeouts, or visual timing configuration.
export interface DomainEvent {type:'card_attack'|'card_defend'|'card_throw_in'|'cards_drawn'|'magic_received'|'magic_activated'|'magic_failed'|'magic_expired'|'round_defended'|'cards_taken';player:Player;cards:readonly Card[];magicId?:string;targetPlayer?:Player;trump?:number;exchange?:{oldCard:Card;newCard:Card}}
export interface PlayerEvent {type:DomainEvent['type'];player:Player;count:number;cards?:Card[];magicId?:string;targetPlayer?:Player;trump?:number;exchange?:{oldCard:Card;newCard?:Card}}
