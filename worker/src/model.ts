import type {PublicRoom, Seat} from '../../src/rooms/protocol';

interface Player {name:string; secretHash:string; joinHash:string; connectionId:string|null}
export interface StoredRoom {
 roomId:string; seed:string; players:[Player|null,Player|null];
 createdAt:number;lastActiveAt:number;expiresAt:number;version:number;expired:boolean;
}
export interface Policy {waitingMs:number;roomMs:number;retentionMs:number}
export class RoomError extends Error {constructor(public code:string,public status=400){super(code);}}
export function randomSecret():string {
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function hash(value:string):Promise<string> {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
async function recovery(seed:string,seat:Seat,proof:string):Promise<string> {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(seed),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${seat}:${proof}`)));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function displayName(value:unknown):string {
 if(typeof value!=='string')throw new RoomError('invalid_name');
 const name=value.normalize('NFC').trim();
 if(!name||[...name].length>32||/[\p{Cc}\p{Cf}]/u.test(name))throw new RoomError('invalid_name');
 return name;
}
export function touch(room:StoredRoom,now:number,policy:Policy):void {
 room.lastActiveAt=now;room.expiresAt=now+(room.players[1]?policy.roomMs:policy.waitingMs);room.version++;
}
export function publicRoom(room:StoredRoom):PublicRoom {
 return {roomId:room.roomId,status:room.expired?'expired':room.players.every(p=>p?.connectionId)?'ready':'waiting',
 players:room.players.map(p=>p?{name:p.name,connected:p.connectionId!==null}:null) as PublicRoom['players'],
 createdAt:room.createdAt,lastActiveAt:room.lastActiveAt,expiresAt:room.expiresAt,version:room.version};
}
export async function createRoom(id:string,name:string,proof:string,now:number,policy:Policy) {
 const room:StoredRoom={roomId:id,seed:randomSecret(),players:[null,null],createdAt:now,lastActiveAt:now,expiresAt:now+policy.waitingMs,version:0,expired:false};
 const credential=await joinRoom(room,name,proof,now,policy);
 return {room,credential};
}
export async function joinRoom(room:StoredRoom,name:string,proof:string,now:number,policy:Policy) {
 if(room.expired||now>=room.expiresAt)throw new RoomError('room_expired',410);
 const joinHash=await hash(proof);
 let seat=room.players.findIndex(p=>p?.joinHash===joinHash);
 if(seat<0) {
  seat=room.players.findIndex(p=>p===null);
  if(seat<0)throw new RoomError('room_full',409);
  const secret=await recovery(room.seed,seat as Seat,proof);
  room.players[seat]={name:displayName(name),secretHash:await hash(secret),joinHash,connectionId:null};
  touch(room,now,policy);
 }
 return {roomId:room.roomId,seat:seat as Seat,recoverySecret:await recovery(room.seed,seat as Seat,proof)};
}
export async function authenticate(room:StoredRoom,secret:string):Promise<Seat|undefined> {
 const digest=await hash(secret);
 const seat=room.players.findIndex(p=>p?.secretHash===digest);
 return seat<0?undefined:seat as Seat;
}
