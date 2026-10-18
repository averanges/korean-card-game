import {record,ROOM_ID,SECRET,type RoomCredential} from './protocol';

// Browser storage is already scoped to the frontend Origin; each room has its own key.
export const storageKey=(roomId:string)=>`hangul-room:${roomId}`;
const memory=new Map<string,string>();
function read(kind:'localStorage'|'sessionStorage',key:string){try{return globalThis[kind].getItem(key);}catch{return null;}}
function write(kind:'localStorage'|'sessionStorage',key:string,value:string){try{globalThis[kind].setItem(key,value);return globalThis[kind].getItem(key)===value;}catch{return false;}}
export function credential(value:unknown,roomId?:string):RoomCredential|undefined {
 if(!record(value)||typeof value.roomId!=='string'||!ROOM_ID.test(value.roomId)||roomId!==undefined&&value.roomId!==roomId||(value.seat!==0&&value.seat!==1)||typeof value.recoverySecret!=='string'||!SECRET.test(value.recoverySecret))return;
 return {roomId:value.roomId,seat:value.seat,recoverySecret:value.recoverySecret};
}
export function saveCredential(value:RoomCredential):boolean {
 const safe=credential(value);if(!safe)throw Error('Некорректные данные восстановления.');
 const key=storageKey(safe.roomId),json=JSON.stringify(safe);memory.set(key,json);
 const persistent=write('localStorage',key,json);write('sessionStorage',key,json);return persistent;
}
export function loadCredential(roomId:string):RoomCredential|undefined {
 for(const json of [read('sessionStorage',storageKey(roomId)),read('localStorage',storageKey(roomId)),memory.get(storageKey(roomId))]){
  try{const safe=credential(JSON.parse(json||'null'),roomId);if(safe){saveCredential(safe);return safe;}}catch{/* Try the legacy session if persistent storage is unavailable or malformed. */}
 }
}
export function hasPersistentCredential(value:RoomCredential){try{return credential(JSON.parse(read('localStorage',storageKey(value.roomId))||'null'),value.roomId)?.recoverySecret===value.recoverySecret;}catch{return false;}}
export function forgetCredential(value:RoomCredential){
 const key=storageKey(value.roomId);
 for(const kind of ['localStorage','sessionStorage'] as const)try{if(credential(JSON.parse(read(kind,key)||'null'))?.recoverySecret===value.recoverySecret)globalThis[kind].removeItem(key);}catch{/* Do not erase a newer credential written by another tab. */}
 if(memory.get(key)===JSON.stringify(value))memory.delete(key);
}
export function getJoinKey(roomId?:string){
 const key=`hangul-join:${roomId||'new'}`;
 let proof=[read('sessionStorage',key),read('localStorage',key),memory.get(key)].find(v=>typeof v==='string'&&SECRET.test(v));
 if(!proof){const bytes=crypto.getRandomValues(new Uint8Array(32));proof=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 memory.set(key,proof);write('localStorage',key,proof);write('sessionStorage',key,proof);return proof;
}
// This is an access credential, never an invitation or URL. The server determines the seat.
export const recoveryCode=(value:RoomCredential)=>`HD1.${value.roomId}.${value.recoverySecret}`;
export function parseRecoveryCode(text:string){
 const parts=text.trim().split('.');
 if(parts.length===3&&parts[0]==='HD1'&&ROOM_ID.test(parts[1])&&SECRET.test(parts[2]))return {roomId:parts[1],secret:parts[2]};
}
