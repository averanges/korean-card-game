export type Seat=0|1;
export type RoomStatus='waiting'|'ready'|'playing'|'finished'|'expired';
export interface PublicRoom {roomId:string;status:RoomStatus;players:[{name:string;connected:boolean}|null,{name:string;connected:boolean}|null];createdAt:number;lastActiveAt:number;expiresAt:number;version:number}
export interface RoomCredential {roomId:string;seat:Seat;recoverySecret:string}
export type RoomEventType='room_snapshot'|'player_joined'|'player_left'|'player_reconnected'|'room_ready';
export type ServerMessage={v:1;type:RoomEventType;room:PublicRoom;self:Seat}|{v:1;type:'error';code:string};
export type RoomMessage={v:1;type:'authenticate';secret:string}|{v:1;type:'get_snapshot'};
export const ROOM_ID=/^[A-Za-z0-9_-]{43}$/;
export const SECRET=/^[A-Za-z0-9_-]{43}$/;
export function record(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
export function parseRoomMessage(text:string):RoomMessage|undefined {
 let value:unknown;try{value=JSON.parse(text);}catch{return;}
 if(!record(value)||value.v!==1)return;
 if(value.type==='authenticate'&&Object.keys(value).sort().join(',')==='secret,type,v'&&typeof value.secret==='string'&&SECRET.test(value.secret))return {v:1,type:'authenticate',secret:value.secret};
 if(value.type==='get_snapshot'&&Object.keys(value).sort().join(',')==='type,v')return {v:1,type:'get_snapshot'};
}
