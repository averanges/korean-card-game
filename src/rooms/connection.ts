import {record,ROOM_ID,type PublicRoom,type RoomCredential} from './protocol';

export const endpoint=(import.meta.env.VITE_ROOM_API_BASE as string|undefined)?.replace(/\/$/,'');
export const storageKey=(roomId:string)=>`hangul-room:${roomId}`;
export function loadCredential(roomId:string):RoomCredential|undefined {
 try{const value=JSON.parse(sessionStorage.getItem(storageKey(roomId))||'null');if(record(value)&&value.roomId===roomId&&(value.seat===0||value.seat===1)&&typeof value.recoverySecret==='string'&&ROOM_ID.test(value.recoverySecret))return value as unknown as RoomCredential;}catch{/* Unavailable storage is reported when saving. */}
}
export const errors:Record<string,string>={room_full:'Оба места уже заняты.',room_not_found:'Комната не найдена.',room_expired:'Время жизни комнаты истекло.',invalid_name:'Введите имя от 1 до 32 символов.',origin_forbidden:'Этот адрес сайта не разрешён в настройках сервера.',unauthorized:'Не удалось восстановить место. Секрет сессии недействителен.'};
export async function enterRoom(name:string,roomId?:string):Promise<RoomCredential&{inviteUrl?:string}> {
 if(!endpoint)throw new Error('Адрес сервера комнат ещё не настроен.');
 const key=`hangul-join:${roomId||'new'}`;
 let joinKey=sessionStorage.getItem(key);
 if(!joinKey){const bytes=crypto.getRandomValues(new Uint8Array(32));joinKey=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');sessionStorage.setItem(key,joinKey);}
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try {
  const response=await fetch(`${endpoint}/api/rooms${roomId?`/${roomId}/join`:''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,joinKey}),signal:controller.signal,credentials:'omit'});
  const value:unknown=await response.json();
  if(!response.ok)throw new Error(record(value)&&typeof value.error==='string'?(errors[value.error]||'Сервер отклонил запрос.'):'Не удалось войти в комнату.');
  if(!record(value)||typeof value.roomId!=='string'||!ROOM_ID.test(value.roomId)||(value.seat!==0&&value.seat!==1)||typeof value.recoverySecret!=='string'||!ROOM_ID.test(value.recoverySecret))throw new Error('Некорректный ответ сервера.');
  // Verify storage before navigation, so a refresh can restore this seat.
  sessionStorage.setItem(storageKey(value.roomId),JSON.stringify(value));
  return value as unknown as RoomCredential&{inviteUrl?:string};
 } finally {clearTimeout(timeout);}
}
export function readSnapshot(value:unknown,roomId:string):{room:PublicRoom;self:0|1}|undefined {
 if(!record(value)||value.v!==1||!['room_snapshot','player_joined','player_left','player_reconnected','room_ready'].includes(String(value.type))||(value.self!==0&&value.self!==1)||!record(value.room))return;
 const room=value.room;
 if(room.roomId!==roomId||!['waiting','ready','playing','finished','expired'].includes(String(room.status))||!Number.isSafeInteger(room.version)||!Array.isArray(room.players)||room.players.length!==2||!room.players.every(p=>p===null||record(p)&&typeof p.name==='string'&&typeof p.connected==='boolean')||!['createdAt','lastActiveAt','expiresAt'].every(k=>typeof room[k]==='number'))return;
 return {room:room as unknown as PublicRoom,self:value.self};
}

export function connectRoom(credential:RoomCredential,onSnapshot:(room:PublicRoom)=>void,onStatus:(status:string)=>void):()=>void {
 let disposed=false,socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,attempts=0,latest=-1,terminal=false,lastPong=Date.now();
 function open() {
  if(disposed||terminal||!endpoint)return;
  onStatus(attempts?'Восстанавливаем связь…':'Подключаемся…');
  const url=new URL(`${endpoint}/api/rooms/${credential.roomId}/ws`);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const current=new WebSocket(url);socket=current;
  const authTimeout=setTimeout(()=>{if(current.readyState!==WebSocket.CLOSED)current.close(4000,'authentication_timeout');},12000);
  current.onopen=()=>{if(disposed)return current.close();current.send(JSON.stringify({v:1,type:'authenticate',secret:credential.recoverySecret}));lastPong=Date.now();heartbeat=setInterval(()=>{if(Date.now()-lastPong>45000)current.close(4000,'heartbeat_timeout');else if(current.readyState===WebSocket.OPEN)current.send('ping');},20000);};
  current.onmessage=event=>{
   if(disposed)return;
   if(event.data==='pong'){lastPong=Date.now();return;}
   let value:unknown;try{value=JSON.parse(event.data);}catch{return;}
   const snapshot=readSnapshot(value,credential.roomId);
   if(snapshot&&snapshot.self===credential.seat&&snapshot.room.version>=latest){clearTimeout(authTimeout);latest=snapshot.room.version;attempts=0;onSnapshot(snapshot.room);onStatus('Связь установлена');}
   else if(record(value)&&value.type==='error'&&value.code==='unauthorized'){terminal=true;onStatus(errors.unauthorized);}
  };
  current.onclose=event=>{
   clearTimeout(authTimeout);clearInterval(heartbeat);if(disposed)return;
   if([4001,4004,4009].includes(event.code)){terminal=true;onStatus(event.code===4009?'Место открыто в другой вкладке.':event.code===4004?errors.room_expired:errors.unauthorized);return;}
   if(terminal)return;
   if(attempts>=8){onStatus('Связь потеряна. Попробуйте подключиться снова.');return;}
   const delay=Math.min(15000,500*2**attempts++)+Math.random()*250;
   onStatus('Связь потеряна. Восстанавливаем…');retry=setTimeout(open,delay);
  };
  current.onerror=()=>{/* The close event owns reconnect, avoiding duplicate retries. */};
 }
 open();return ()=>{disposed=true;clearTimeout(retry);clearInterval(heartbeat);socket?.close(1000,'page_closed');};
}
