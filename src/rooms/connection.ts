import {record,ROOM_ID,type PublicRoom,type RoomCredential,type GameSnapshot,type NetworkCommand,type CommandResult} from './protocol';
import type {PlayerEvent} from '../game-core/types';
import {validateDeck,type DeckSnapshot} from '../decks';
import {credential as validCredential,saveCredential,getJoinKey,parseRecoveryCode} from './credentials';
import {waitForRoomServer,needsReadiness,type ConnectionProgress} from './readiness';
export {loadCredential,storageKey} from './credentials';

export const endpoint=(import.meta.env?.VITE_ROOM_API_BASE as string|undefined)?.replace(/\/$/,'');
export class RoomAccessError extends Error {constructor(public code:string,operation?:'create'|'join'){super(code==='invalid_body'&&operation==='create'?(needsReadiness(endpoint||'')?'Сайт и Node.js-сервер комнат разных версий. Обновите сервер Render и сайт вместе: текущая версия передаёт выбранную колоду.':'Сервер не принял формат создания комнаты. Возможно, сайт и сервер комнат разных версий. Обновите Cloudflare Worker вместе с сайтом: текущая версия передаёт выбранную колоду.'):errors[code]||'Сервер отклонил запрос.');}}
export const ROOM_REQUEST_TIMEOUT_MS=12000;
export class RoomTransportError extends Error {
 constructor(public code:'request_timeout'|'network_unreachable'|'invalid_response'){
  super(code==='request_timeout'?'HTTP: сервер комнат не ответил за 12 секунд. Проверьте подключение и повторите попытку.':code==='invalid_response'?'HTTP: сервер комнат вернул некорректный ответ. Повторите попытку позже.':'HTTP: не удалось связаться с сервером комнат. Проверьте подключение; возможны ограничения сети или настройка доступа (CORS).');
 }
}
/** Bounded POST shared by create/join/recovery. Never echoes exception text or payloads. */
export async function postRoom(url:string,payload:unknown,signal?:AbortSignal):Promise<{response:Response;value:unknown}>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ROOM_REQUEST_TIMEOUT_MS);
 const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit'});}
  catch{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');throw new RoomTransportError(controller.signal.aborted?'request_timeout':'network_unreachable');}
  try{return {response,value:await response.json()};}
  catch(error){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');throw new RoomTransportError(controller.signal.aborted?'request_timeout':error instanceof SyntaxError?'invalid_response':'network_unreachable');}
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export const errors:Record<string,string>={server_busy:'HTTP: тестовый сервер заполнен. Повторите попытку позже.',rate_limit:'Слишком много запросов. Подождите и повторите попытку.',invalid_body:'Сервер не принял формат запроса. Проверьте совместимость версии сайта и сервера комнат.',body_too_large:'Данные колоды превышают допустимый размер запроса.',json_required:'Сервер ожидает запрос в формате JSON.',invalid_deck:'Проверьте колоду: от 9 до 200 уникальных слов и переводов, название до 60 символов.',room_full:'Оба места уже заняты.',room_not_found:'Комната не найдена.',room_expired:'Время жизни комнаты истекло.',invalid_name:'Введите имя от 1 до 32 символов.',origin_forbidden:'Этот адрес сайта не разрешён в настройках сервера.',unauthorized:'Не удалось восстановить место. Секрет сессии недействителен.'};
export function roomEntryPayload(name:string,joinKey:string,roomId?:string,deck?:DeckSnapshot){
 // Send only the wire schema, even if the selected local deck also has IDs, dates or UI fields.
 return {name:name.normalize('NFC').trim(),joinKey,...(!roomId&&deck?{deck:validateDeck(deck)}:{})};
}
export async function enterRoom(name:string,roomId?:string,deck?:DeckSnapshot,onProgress?:ConnectionProgress,signal?:AbortSignal):Promise<RoomCredential&{inviteUrl?:string}> {
 if(!endpoint)throw new Error('Адрес сервера комнат ещё не настроен.');
 await waitForRoomServer(endpoint,onProgress,signal);onProgress?.('HTTP: создаём подключение к комнате…');
 const payload=roomEntryPayload(name,getJoinKey(roomId),roomId,deck);
 const {response,value}=await postRoom(`${endpoint}/api/rooms${roomId?`/${roomId}/join`:''}`,payload,signal);
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(!response.ok)throw new RoomAccessError(record(value)&&typeof value.error==='string'?value.error:'unknown',roomId?'join':'create');
 if(!record(value)||typeof value.roomId!=='string'||!ROOM_ID.test(value.roomId)||(value.seat!==0&&value.seat!==1)||typeof value.recoverySecret!=='string'||!ROOM_ID.test(value.recoverySecret))throw new Error('Некорректный ответ сервера.');
 // Verify storage before navigation, so a refresh can restore this seat.
 saveCredential(value as unknown as RoomCredential);
 return value as unknown as RoomCredential&{inviteUrl?:string};
}
export async function recoverRoom(code:string,roomId:string,onProgress?:ConnectionProgress,signal?:AbortSignal):Promise<RoomCredential>{
 const proof=parseRecoveryCode(code);if(!proof||proof.roomId!==roomId)throw Error('Введите персональный код именно этой комнаты.');
 if(!endpoint)throw Error('Адрес сервера комнат ещё не настроен.');
 await waitForRoomServer(endpoint,onProgress,signal);onProgress?.('HTTP: проверяем код восстановления…');
 const {response,value}=await postRoom(`${endpoint}/api/rooms/${roomId}/recover`,{secret:proof.secret},signal);
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(!response.ok)throw new RoomAccessError(record(value)&&typeof value.error==='string'?value.error:'unknown');
 const safe=validCredential(value,roomId);if(!safe||safe.recoverySecret!==proof.secret)throw Error('Некорректный ответ сервера.');
 saveCredential(safe);return safe;
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
 let opening=false,openingId=0,wake:AbortController|undefined;
 const cancelWake=()=>{openingId++;opening=false;wake?.abort();};
 function stop(issue:AccessIssue){if(terminal)return;terminal=true;onStatus(issue==='replaced'?'Место открыто в другой вкладке или на другом устройстве.':issue==='expired'?errors.room_expired:errors.unauthorized);options.onAccessIssue?.(issue);}
 function open() {
  if(disposed||terminal||suspended||!api||opening)return;
  if(!needsReadiness(api)){connectSocket();return;}
  clearTimeout(retry);opening=true;const id=++openingId;wake=new AbortController();
  void waitForRoomServer(api,text=>{if(id===openingId&&!disposed&&!suspended)onStatus(text);},wake.signal).then(async()=>{
   if(id!==openingId||disposed||suspended)return;
   if(needsReadiness(api)){
    onStatus('HTTP: восстанавливаем своё место…');
    const checked=await postRoom(`${api}/api/rooms/${credential.roomId}/recover`,{secret:credential.recoverySecret},wake?.signal);
    if(id!==openingId||disposed||suspended)return;
    if(!checked.response.ok){
     if(record(checked.value)&&checked.value.error==='unauthorized'){stop('unauthorized');return;}
     if(record(checked.value)&&['room_not_found','room_expired'].includes(String(checked.value.error))){terminal=true;onStatus('HTTP: комната недоступна. Она могла истечь или потеряться после перезапуска тестового сервера. Создайте новую комнату.');return;}
     throw new Error(`HTTP: не удалось восстановить место (${checked.response.status}). Повторите подключение.`);
    }
   }
   if(id!==openingId)return;opening=false;if(disposed||terminal||suspended)return;connectSocket();
  }).catch(error=>{if(id!==openingId)return;opening=false;if(disposed||suspended||wake?.signal.aborted)return;onStatus(error instanceof Error?error.message:'HTTP: ошибка готовности сервера. Повторите подключение.');});
 }
 function connectSocket() {
  clearTimeout(retry);authenticated=false;
  onStatus(attempts?'Восстанавливаем связь…':'Подключаемся…');
  const url=new URL(`${api}/api/rooms/${credential.roomId}/ws`);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const current=new WebSocket(url);socket=current;
  let socketError=false;const socketStarted=Date.now();
  const stage=setInterval(()=>{if(!authenticated&&socket===current)onStatus(`WebSocket: подключаемся к комнате… ${Math.floor((Date.now()-socketStarted)/1000)} с`);},1000);
  onStatus('WebSocket: подключаемся к комнате… 0 с');
  const authTimeout=setTimeout(()=>{socketError=true;if(current.readyState!==WebSocket.CLOSED)current.close(4000,'authentication_timeout');},12000);
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  cleanupSocket=()=>{clearTimeout(authTimeout);clearInterval(heartbeat);clearInterval(stage);};
  current.onopen=()=>{if(disposed||socket!==current)return current.close();current.send(JSON.stringify({v:1,type:'authenticate',secret:credential.recoverySecret}));lastPong=Date.now();heartbeat=setInterval(()=>{if(Date.now()-lastPong>45000)current.close(4000,'heartbeat_timeout');else if(current.readyState===WebSocket.OPEN)current.send('ping');},20000);};
  current.onmessage=event=>{
   if(disposed||socket!==current)return;
   if(event.data==='pong'){lastPong=Date.now();return;}
   let value:unknown;try{value=JSON.parse(event.data);}catch{return;}
   const snapshot=readSnapshot(value,credential.roomId);
   if(snapshot&&snapshot.self===credential.seat&&snapshot.room.version>=latest){clearTimeout(authTimeout);clearInterval(stage);authenticated=true;lastPong=Date.now();latest=snapshot.room.version;attempts=0;onSnapshot(snapshot.room);onStatus('Связь установлена');if(record(value)&&record(value.game)&&Number.isSafeInteger(value.game.revision)&&record(value.game.view)&&value.game.view.player===credential.seat)onGame?.(value.game as unknown as GameSnapshot,Array.isArray(value.events)?value.events as PlayerEvent[]:[]);}
   else if(record(value)&&value.v===1&&value.type==='command_result'&&typeof value.requestId==='string'&&typeof value.ok==='boolean'&&Number.isSafeInteger(value.revision))onResult?.(value as unknown as CommandResult);
   else if(record(value)&&value.type==='error'&&value.code==='unauthorized')stop('unauthorized');
  };
  current.onclose=event=>{
   clearTimeout(authTimeout);clearInterval(heartbeat);clearInterval(stage);if(disposed||socket!==current)return;authenticated=false;
   if(event.code===4009){stop('replaced');return;}
   if(event.code===4004){stop('expired');return;}
   if(event.code===4001&&event.reason==='unauthorized'){stop('unauthorized');return;}
   if(terminal||suspended)return;
   if(attempts>=8){onStatus('Связь потеряна. Попробуйте подключиться снова.');return;}
   const delay=Math.min(15000,500*2**attempts++)+Math.random()*250;
   onStatus(socketError?'WebSocket: соединение не установлено или не ответило вовремя. Повторяем подключение…':'WebSocket: связь потеряна. Восстанавливаем…');retry=setTimeout(open,delay);
  };
  current.onerror=()=>{socketError=true;/* The close event owns reconnect. */};
 }
 function resume(){
  if(disposed||terminal||suspended||document.visibilityState==='hidden'||navigator.onLine===false)return;
  if(socket?.readyState===WebSocket.OPEN&&authenticated&&Date.now()-lastPong<45000){socket.send('ping');socket.send(JSON.stringify({v:1,type:'get_snapshot'}));return;}
  if(opening||socket?.readyState===WebSocket.CONNECTING)return;
  const old=socket;socket=undefined;cleanupSocket();old?.close(4000,'resume');attempts=0;open();
 }
 const hide=()=>{suspended=true;cancelWake();clearTimeout(retry);cleanupSocket();const old=socket;socket=undefined;old?.close(1000,'page_hidden');};
 const show=()=>{suspended=false;resume();};
 window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
 open();const close=()=>{disposed=true;cancelWake();clearTimeout(retry);cleanupSocket();window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);socket?.close(1000,'page_closed');};
 close.sendCommand=(command:NetworkCommand)=>{if(disposed||terminal||!authenticated||socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({v:1,type:'command',command}));return true;};
 return close;
}
