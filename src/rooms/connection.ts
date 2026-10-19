import {record,ROOM_ID,type PublicRoom,type RoomCredential,type GameSnapshot,type NetworkCommand,type CommandResult} from './protocol';
import type {PlayerEvent} from '../game-core/types';
import {validateDeck,type DeckSnapshot} from '../decks';
import {credential as validCredential,saveCredential,getJoinKey,parseRecoveryCode} from './credentials';
export {loadCredential,storageKey} from './credentials';

export const endpoint=(import.meta.env?.VITE_ROOM_API_BASE as string|undefined)?.replace(/\/$/,'');
export class RoomAccessError extends Error {constructor(public code:string,operation?:'create'|'join'){super(code==='invalid_body'&&operation==='create'?'Сервер не принял формат создания комнаты. Возможно, сайт и сервер комнат разных версий. Обновите Cloudflare Worker вместе с сайтом: текущая версия передаёт выбранную колоду.':errors[code]||'Сервер отклонил запрос.');}}
export const errors:Record<string,string>={invalid_body:'Сервер не принял формат запроса. Проверьте совместимость версии сайта и сервера комнат.',body_too_large:'Данные колоды превышают допустимый размер запроса.',json_required:'Сервер ожидает запрос в формате JSON.',invalid_deck:'Проверьте колоду: от 9 до 200 уникальных слов и переводов, название до 60 символов.',room_full:'Оба места уже заняты.',room_not_found:'Комната не найдена.',room_expired:'Время жизни комнаты истекло.',invalid_name:'Введите имя от 1 до 32 символов.',origin_forbidden:'Этот адрес сайта не разрешён в настройках сервера.',unauthorized:'Не удалось восстановить место. Секрет сессии недействителен.'};
export function roomEntryPayload(name:string,joinKey:string,roomId?:string,deck?:DeckSnapshot){
 // Send only the wire schema, even if the selected local deck also has IDs, dates or UI fields.
 return {name:name.normalize('NFC').trim(),joinKey,...(!roomId&&deck?{deck:validateDeck(deck)}:{})};
}
export async function enterRoom(name:string,roomId?:string,deck?:DeckSnapshot):Promise<RoomCredential&{inviteUrl?:string}> {
 if(!endpoint)throw new Error('Адрес сервера комнат ещё не настроен.');
 const payload=roomEntryPayload(name,getJoinKey(roomId),roomId,deck);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try {
  const response=await fetch(`${endpoint}/api/rooms${roomId?`/${roomId}/join`:''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit'});
  const value:unknown=await response.json();
  if(!response.ok)throw new RoomAccessError(record(value)&&typeof value.error==='string'?value.error:'unknown',roomId?'join':'create');
  if(!record(value)||typeof value.roomId!=='string'||!ROOM_ID.test(value.roomId)||(value.seat!==0&&value.seat!==1)||typeof value.recoverySecret!=='string'||!ROOM_ID.test(value.recoverySecret))throw new Error('Некорректный ответ сервера.');
  // Verify storage before navigation, so a refresh can restore this seat.
  saveCredential(value as unknown as RoomCredential);
  return value as unknown as RoomCredential&{inviteUrl?:string};
 } finally {clearTimeout(timeout);}
}
export async function recoverRoom(code:string,roomId:string):Promise<RoomCredential>{
 const proof=parseRecoveryCode(code);if(!proof||proof.roomId!==roomId)throw Error('Введите персональный код именно этой комнаты.');
 if(!endpoint)throw Error('Адрес сервера комнат ещё не настроен.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(`${endpoint}/api/rooms/${roomId}/recover`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:proof.secret}),credentials:'omit',signal:controller.signal});
  const value:unknown=await response.json();
  if(!response.ok)throw new RoomAccessError(record(value)&&typeof value.error==='string'?value.error:'unknown');
  const safe=validCredential(value,roomId);if(!safe||safe.recoverySecret!==proof.secret)throw Error('Некорректный ответ сервера.');
  saveCredential(safe);return safe;
 }finally{clearTimeout(timer);}
}
export function readSnapshot(value:unknown,roomId:string):{room:PublicRoom;self:0|1}|undefined {
 if(!record(value)||value.v!==1||!['room_snapshot','player_joined','player_left','player_reconnected','room_ready'].includes(String(value.type))||(value.self!==0&&value.self!==1)||!record(value.room))return;
 const room=value.room;
 if(room.roomId!==roomId||!['waiting','ready','playing','finished','expired'].includes(String(room.status))||!Number.isSafeInteger(room.version)||!Array.isArray(room.players)||room.players.length!==2||!room.players.every(p=>p===null||record(p)&&typeof p.name==='string'&&typeof p.connected==='boolean')||!['createdAt','lastActiveAt','expiresAt'].every(k=>typeof room[k]==='number'))return;
 return {room:room as unknown as PublicRoom,self:value.self};
}

export type AccessIssue='unauthorized'|'replaced'|'expired';
export function connectRoom(credential:RoomCredential,onSnapshot:(room:PublicRoom)=>void,onStatus:(status:string)=>void,onGame?:(snapshot:GameSnapshot,events:PlayerEvent[])=>void,onResult?:(result:CommandResult)=>void,options:{onAccessIssue?:(issue:AccessIssue)=>void;apiBase?:string}={}) {
 const api=options.apiBase??endpoint;
 let disposed=false,suspended=false,authenticated=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,cleanupSocket=()=>{},attempts=0,latest=-1,terminal=false,lastPong=Date.now();
 function stop(issue:AccessIssue){if(terminal)return;terminal=true;onStatus(issue==='replaced'?'Место открыто в другой вкладке или на другом устройстве.':issue==='expired'?errors.room_expired:errors.unauthorized);options.onAccessIssue?.(issue);}
 function open() {
  if(disposed||terminal||suspended||!api)return;
  clearTimeout(retry);authenticated=false;
  onStatus(attempts?'Восстанавливаем связь…':'Подключаемся…');
  const url=new URL(`${api}/api/rooms/${credential.roomId}/ws`);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const current=new WebSocket(url);socket=current;
  const authTimeout=setTimeout(()=>{if(current.readyState!==WebSocket.CLOSED)current.close(4000,'authentication_timeout');},12000);
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  cleanupSocket=()=>{clearTimeout(authTimeout);clearInterval(heartbeat);};
  current.onopen=()=>{if(disposed||socket!==current)return current.close();current.send(JSON.stringify({v:1,type:'authenticate',secret:credential.recoverySecret}));lastPong=Date.now();heartbeat=setInterval(()=>{if(Date.now()-lastPong>45000)current.close(4000,'heartbeat_timeout');else if(current.readyState===WebSocket.OPEN)current.send('ping');},20000);};
  current.onmessage=event=>{
   if(disposed||socket!==current)return;
   if(event.data==='pong'){lastPong=Date.now();return;}
   let value:unknown;try{value=JSON.parse(event.data);}catch{return;}
   const snapshot=readSnapshot(value,credential.roomId);
   if(snapshot&&snapshot.self===credential.seat&&snapshot.room.version>=latest){clearTimeout(authTimeout);authenticated=true;lastPong=Date.now();latest=snapshot.room.version;attempts=0;onSnapshot(snapshot.room);onStatus('Связь установлена');if(record(value)&&record(value.game)&&Number.isSafeInteger(value.game.revision)&&record(value.game.view)&&value.game.view.player===credential.seat)onGame?.(value.game as unknown as GameSnapshot,Array.isArray(value.events)?value.events as PlayerEvent[]:[]);}
   else if(record(value)&&value.v===1&&value.type==='command_result'&&typeof value.requestId==='string'&&typeof value.ok==='boolean'&&Number.isSafeInteger(value.revision))onResult?.(value as unknown as CommandResult);
   else if(record(value)&&value.type==='error'&&value.code==='unauthorized')stop('unauthorized');
  };
  current.onclose=event=>{
   clearTimeout(authTimeout);clearInterval(heartbeat);if(disposed||socket!==current)return;authenticated=false;
   if(event.code===4009){stop('replaced');return;}
   if(event.code===4004){stop('expired');return;}
   if(event.code===4001&&event.reason==='unauthorized'){stop('unauthorized');return;}
   if(terminal||suspended)return;
   if(attempts>=8){onStatus('Связь потеряна. Попробуйте подключиться снова.');return;}
   const delay=Math.min(15000,500*2**attempts++)+Math.random()*250;
   onStatus('Связь потеряна. Восстанавливаем…');retry=setTimeout(open,delay);
  };
  current.onerror=()=>{/* The close event owns reconnect, avoiding duplicate retries. */};
 }
 function resume(){
  if(disposed||terminal||suspended||document.visibilityState==='hidden'||navigator.onLine===false)return;
  if(socket?.readyState===WebSocket.OPEN&&authenticated&&Date.now()-lastPong<45000){socket.send('ping');socket.send(JSON.stringify({v:1,type:'get_snapshot'}));return;}
  if(socket?.readyState===WebSocket.CONNECTING)return;
  const old=socket;socket=undefined;cleanupSocket();old?.close(4000,'resume');attempts=0;open();
 }
 const hide=()=>{suspended=true;clearTimeout(retry);cleanupSocket();const old=socket;socket=undefined;old?.close(1000,'page_hidden');};
 const show=()=>{suspended=false;resume();};
 window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
 open();const close=()=>{disposed=true;clearTimeout(retry);cleanupSocket();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);socket?.close(1000,'page_closed');};
 close.sendCommand=(command:NetworkCommand)=>{if(disposed||terminal||!authenticated||socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({v:1,type:'command',command}));return true;};
 return close;
}
