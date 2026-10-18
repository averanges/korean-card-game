import type {ClientCommand,PlayerView,PlayerEvent} from '../game-core/types';
import type {PublicQuiz} from '../game-core/challenges';
import type {DeckInfo} from '../decks';
export type NetworkCommand=ClientCommand;
export type Seat=0|1;
export type OrdinaryCommand=Extract<ClientCommand,{type:'start_game'|'attack'|'defend'|'end'|'take'|'pass'}>;
export interface PublicChallenge {challengeId:string;magicRef:string;magicKind?:string;phase:'question'|'target'|'resolved'|'cancelled';outcome?:'correct'|'wrong'|'unavailable';quiz?:PublicQuiz;target?:{kind:'trump';suits:number[]}|{kind:'hat';cardRefs:string[]}}
export interface GameSnapshot {revision:number;view:PlayerView;challenge?:PublicChallenge;allowed:{attack:string[];defend:{target:number;cardRefs:string[]}[];take:boolean;end:boolean;magic?:string[];pass?:boolean}}
export interface CommandResult {requestId:string;ok:boolean;revision:number;code?:string}
export type RoomStatus='waiting'|'ready'|'playing'|'finished'|'expired';
export interface PublicRoom {roomId:string;status:RoomStatus;players:[{name:string;connected:boolean}|null,{name:string;connected:boolean}|null];createdAt:number;lastActiveAt:number;expiresAt:number;version:number;deck?:DeckInfo}
export interface RoomCredential {roomId:string;seat:Seat;recoverySecret:string}
export type RoomEventType='room_snapshot'|'player_joined'|'player_left'|'player_reconnected'|'room_ready';
export type ServerMessage={v:1;type:RoomEventType;room:PublicRoom;self:Seat;game?:GameSnapshot;events?:PlayerEvent[]}|({v:1;type:'command_result'}&CommandResult)|{v:1;type:'error';code:string};
export type RoomMessage={v:1;type:'authenticate';secret:string}|{v:1;type:'get_snapshot'}|{v:1;type:'command';command:NetworkCommand};
export const ROOM_ID=/^[A-Za-z0-9_-]{43}$/;
export const SECRET=/^[A-Za-z0-9_-]{43}$/;
export function record(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
export function parseRoomMessage(text:string):RoomMessage|undefined {
 let value:unknown;try{value=JSON.parse(text);}catch{return;}
 if(!record(value)||value.v!==1)return;
 if(value.type==='authenticate'&&Object.keys(value).sort().join(',')==='secret,type,v'&&typeof value.secret==='string'&&SECRET.test(value.secret))return {v:1,type:'authenticate',secret:value.secret};
 if(value.type==='get_snapshot'&&Object.keys(value).sort().join(',')==='type,v')return {v:1,type:'get_snapshot'};
 if(value.type==='command'&&Object.keys(value).sort().join(',')==='command,type,v'&&validCommand(value.command))return {v:1,type:'command',command:value.command};
}
export function validCommand(c:unknown):c is NetworkCommand {
 if(!record(c)||typeof c.requestId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(c.requestId)||!Number.isSafeInteger(c.expectedRevision)||Number(c.expectedRevision)<0)return false;
 const keys=Object.keys(c).sort().join(',');
 if(['start_game','end','take','pass'].includes(String(c.type)))return keys==='expectedRevision,requestId,type';
 if(c.type==='attack')return keys==='cardRefs,expectedRevision,requestId,type'&&Array.isArray(c.cardRefs)&&c.cardRefs.length>0&&c.cardRefs.length<=6&&c.cardRefs.every(x=>typeof x==='string'&&x.length<=80)&&new Set(c.cardRefs).size===c.cardRefs.length;
 if(c.type==='defend')return keys==='cardRef,expectedRevision,requestId,target,type'&&typeof c.cardRef==='string'&&c.cardRef.length<=80&&Number.isInteger(c.target)&&Number(c.target)>=0&&Number(c.target)<6;
 const ref=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value);
 if(c.type==='begin_magic')return keys==='expectedRevision,magicRef,requestId,type'&&ref(c.magicRef);
 if(c.type==='cancel_quiz')return keys==='challengeId,expectedRevision,requestId,type'&&ref(c.challengeId);
 if(c.type==='answer_quiz')return keys==='challengeId,expectedRevision,option,requestId,type'&&ref(c.challengeId)&&Number.isInteger(c.option)&&Number(c.option)>=0&&Number(c.option)<4;
 if(c.type==='choose_trump')return keys==='challengeId,expectedRevision,requestId,trump,type'&&ref(c.challengeId)&&Number.isInteger(c.trump)&&Number(c.trump)>=0&&Number(c.trump)<4;
 if(c.type==='choose_hat_card')return keys==='cardRef,challengeId,expectedRevision,requestId,type'&&ref(c.challengeId)&&ref(c.cardRef);
 return false;
}
