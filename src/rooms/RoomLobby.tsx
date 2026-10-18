import React,{useEffect,useState} from 'react';
import {connectRoom,endpoint,enterRoom,loadCredential} from './connection';
import {ROOM_ID,type PublicRoom,type RoomCredential} from './protocol';
import './room.css';

export function RoomLobby() {
 const pathId=location.pathname.startsWith('/room/')?location.pathname.slice(6):undefined;
 const invalid=!!pathId&&!ROOM_ID.test(pathId);
 const [credential,setCredential]=useState<RoomCredential|undefined>(()=>pathId&&!invalid?loadCredential(pathId):undefined);
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[room,setRoom]=useState<PublicRoom>(),[status,setStatus]=useState(''),[retry,setRetry]=useState(0),[copied,setCopied]=useState(false);
 const invite=credential?`${location.origin}/room/${credential.roomId}`:'';
 useEffect(()=>{if(credential)return connectRoom(credential,setRoom,setStatus);},[credential,retry]);
 async function submit(event:React.FormEvent) {
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{const result=await enterRoom(name,pathId);history.replaceState(null,'',`/room/${result.roomId}`);setCredential(result);}catch(error){setError(error instanceof Error?error.message:'Не удалось подключиться.');}finally{setBusy(false);}
 }
 return <main className="room-lobby"><section className="room-panel" aria-labelledby="room-heading">
  <a className="room-back" href="/">← Игра с ботом</a><div className="room-star" aria-hidden="true">✧</div>
  <h1 id="room-heading">{credential?'Приватная комната':pathId?'Приглашение в комнату':'Комната по ссылке'}</h1>
  {invalid?<p role="alert">Неверная ссылка комнаты.</p>:!credential?<>
   <p>Два игрока. Без регистрации. Пригласите соперника по ссылке.</p>
   {!endpoint&&<p role="status">Сервер комнат ещё не настроен. Одиночная игра доступна как обычно.</p>}
   <form onSubmit={submit}><label htmlFor="room-name">Ваше имя</label><input id="room-name" value={name} onChange={e=>setName(e.target.value)} maxLength={32} required autoComplete="nickname" disabled={busy}/><button disabled={!endpoint||busy||!name.trim()}>{busy?'Подождите…':pathId?'Присоединиться':'Создать комнату'}</button></form>
   {error&&<p role="alert">{error}</p>}
  </>:<>
   <label htmlFor="room-invite">Ссылка-приглашение</label><div className="room-invite"><input id="room-invite" value={invite} readOnly onFocus={e=>e.currentTarget.select()}/><button onClick={async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true);}catch{setError('Выделите и скопируйте ссылку из поля.');}}}>{copied?'Скопировано':'Копировать'}</button></div>
   <p className="room-connection" role="status">{status}</p>
   <ol className="room-players">{([0,1] as const).map(seat=><li key={seat}><span className={'room-dot '+(room?.players[seat]?.connected?'online':'')}/><span>{room?.players[seat]?.name||'Ожидаем игрока'} {credential.seat===seat?'(вы)':''}</span><small>{room?.players[seat]?room.players[seat]!.connected?'В сети':'Не в сети':'Свободное место'}</small></li>)}</ol>
   <h2>{room?.status==='expired'?'Комната закрыта':room?.status==='ready'?'Комната готова':'Ожидание соперника'}</h2>
   <p>{room?.status==='ready'?'Оба игрока подключились. Сетевая партия появится на следующем этапе.':'Место сохраняется при кратковременной потере связи и обновлении этой вкладки.'}</p>
   <button onClick={()=>setRetry(x=>x+1)} disabled={status==='Связь установлена'||status.includes('другой вкладке')||room?.status==='expired'}>Подключиться снова</button>
   {error&&<p role="alert">{error}</p>}
  </>}
 </section></main>;
}
