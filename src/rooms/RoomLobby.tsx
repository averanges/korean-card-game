import React,{useEffect,useState,useRef} from 'react';
import {connectRoom,endpoint,enterRoom,loadCredential,RoomAccessError,errors} from './connection';
import {forgetCredential} from './credentials';
import {RecoveryAccess,RecoveryDialog} from './RecoveryAccess';
import {ROOM_ID,type PublicRoom,type RoomCredential,type GameSnapshot,type NetworkCommand} from './protocol';
import type {PlayerEvent} from '../game-core/types';
import {NetworkTable,type Intent} from './NetworkTable';
import {captureBoard} from '../useGameAnimations';
import type {CardPosition} from '../animationModel';
import './room.css';
import {useProfile} from '../ProfileContext';
import {resolveDeck} from '../decks';
import {navigate} from '../navigation';

export function RoomLobby() {
 const {profile,update,issue}=useProfile();
 const [creationDeck]=useState(()=>resolveDeck(profile.selectedDeckId,profile.decks));
 const pathId=location.pathname.startsWith('/room/')?location.pathname.slice(6):undefined;
 const invalid=!!pathId&&!ROOM_ID.test(pathId);
 const [credential,setCredential]=useState<RoomCredential|undefined>(()=>pathId&&!invalid?loadCredential(pathId):undefined);
 const [name,setName]=useState(profile.name),[busy,setBusy]=useState(false),[error,setError]=useState(''),[room,setRoom]=useState<PublicRoom>(),[status,setStatus]=useState(''),[retry,setRetry]=useState(0),[copied,setCopied]=useState(false);
 const invite=credential?`${location.origin}/room/${credential.roomId}`:'';
 const [game,setGame]=useState<GameSnapshot>(),[events,setEvents]=useState<PlayerEvent[]>([]),[pending,setPending]=useState(false);
 const [positions,setPositions]=useState<CardPosition[]>([]);
 const [roomFull,setRoomFull]=useState(false),[showRecovery,setShowRecovery]=useState(false);
 const connection=useRef<ReturnType<typeof connectRoom>>(),pendingCommand=useRef<NetworkCommand>();
 const clearPending=()=>{pendingCommand.current=undefined;setPending(false);};
 const commandErrors:Record<string,string>={stale_revision:'Стол обновился. Выберите ход снова.',illegal_move:'Этот ход сейчас недопустим.',host_only:'Начать игру может создатель комнаты.',players_not_ready:'Оба игрока должны быть подключены.',storage_error:'Не удалось подтвердить сохранение. Переподключитесь для проверки состояния.',game_finished:'Партия завершена.',already_started:'Партия уже началась.',magic_unavailable:'Магия сейчас недоступна.',challenge_pending:'Завершите открытое задание.',invalid_challenge:'Эта попытка уже завершена или устарела.',invalid_target:'Недопустимая цель. Выберите другую.',answer_committed:'Ответ уже принят. Завершите выбор цели.',invalid_blind_reference:'Закрытые карты обновились. Выберите снова.'};
 useEffect(()=>{
  if(!credential)return;
  const close=connectRoom(credential,setRoom,text=>{setStatus(text);if(text!=='Связь установлена')clearPending();},(next,events)=>{
   setPositions([...captureBoard(),...events.flatMap(e=>{if(!['card_unlocked','magic_received'].includes(e.type)||!e.sourceRef||!e.cards?.length)return [];const el=Array.from(document.querySelectorAll<HTMLElement>('[data-sealed-ref]')).reverse().find(n=>n.dataset.sealedRef===e.sourceRef&&n.getBoundingClientRect().width);const b=(el||document.querySelector<HTMLElement>('.ux-fan,.normal-hand-viewport'))?.getBoundingClientRect();return b?[{sourceRef:e.sourceRef,card:e.cards[0],x:b.x,y:b.y,width:Math.min(b.width,120),height:Math.min(b.height,180),rotation:0}]:[];})]);setGame(old=>old&&old.revision>next.revision?old:next);setEvents(events);
   if(pendingCommand.current&&next.revision>pendingCommand.current.expectedRevision)clearPending();
  },result=>{if(result.requestId===pendingCommand.current?.requestId&&!result.ok){clearPending();setError(commandErrors[result.code||'']||'Сервер отклонил ход.');if(result.code==='storage_error'){setStatus('Восстанавливаем состояние…');setRetry(x=>x+1);}}},{onAccessIssue:issue=>{
   if(issue==='unauthorized'){forgetCredential(credential);setCredential(undefined);setGame(undefined);setRoom(undefined);setError(errors.unauthorized);}
   else if(issue==='replaced')setError('Место открыто в другой вкладке или на другом устройстве. Автоматическое подключение остановлено.');
  }});
  connection.current=close;return ()=>{connection.current=undefined;close();};
 },[credential,retry]);
 useEffect(()=>{if(!pending)return;const timer=setTimeout(()=>{clearPending();setError('Подтверждение задержалось. Восстанавливаем состояние партии.');setStatus('Восстанавливаем состояние…');setRetry(x=>x+1);},12000);return()=>clearTimeout(timer);},[pending]);
 function command(intent:Intent){
  if(pendingCommand.current||status!=='Связь установлена')return;
  const value={...intent,requestId:crypto.randomUUID(),expectedRevision:game?.revision??0} as NetworkCommand;
  pendingCommand.current=value;setPending(true);setError('');
  if(!connection.current?.sendCommand(value)){clearPending();setError('Нет соединения. Подключитесь снова.');}
 }
 async function submit(event:React.FormEvent) {
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{update(p=>({...p,name}));const result=await enterRoom(name,pathId,creationDeck);history.replaceState(null,'',`/room/${result.roomId}`);setCredential(result);}catch(error){if(error instanceof RoomAccessError&&error.code==='room_full')setRoomFull(true);setError(error instanceof Error?error.message:'Не удалось подключиться.');}finally{setBusy(false);}
 }
 if(game&&room)return <><NetworkTable snapshot={game} events={events} positions={positions} room={room} connected={status==='Связь установлена'} busy={pending} error={error} onCommand={command} onReconnect={()=>{clearPending();setError('');setRetry(x=>x+1);}} onRecovery={()=>setShowRecovery(true)}/>{credential&&showRecovery&&<RecoveryDialog credential={credential} onClose={()=>setShowRecovery(false)}/>}</>;
 return <main className="room-lobby"><section className="room-panel" aria-labelledby="room-heading">
  <a className="room-back" href="/" onClick={e=>{e.preventDefault();navigate('/');}}>← Главное меню</a><div className="room-star" aria-hidden="true">✧</div>
  <h1 id="room-heading">{credential?'Приватная комната':pathId?'Приглашение в комнату':'Комната по ссылке'}</h1>
  {invalid?<p role="alert">Неверная ссылка комнаты.</p>:!credential?<>
   <p>Два игрока. Без регистрации. Пригласите соперника по ссылке.</p>
   {!pathId&&<p className="room-deck-info">Колода: <strong>{creationDeck.name}</strong> · {creationDeck.words.length} слов</p>}
   {issue&&<p role="alert">{issue}</p>}
   {!endpoint&&<p role="status">Сервер комнат ещё не настроен. Одиночная игра доступна как обычно.</p>}
   {roomFull?<p>Оба места сохранены за участниками. Для возвращения используйте свой персональный код ниже либо откройте ссылку в браузере, где уже играли.</p>:<form onSubmit={submit}><label htmlFor="room-name">Ваше имя</label><input id="room-name" value={name} onChange={e=>setName(e.target.value)} maxLength={32} required autoComplete="nickname" disabled={busy}/><button disabled={!endpoint||busy||!name.trim()}>{busy?'Подождите…':pathId?'Присоединиться':'Создать комнату'}</button></form>}
   {error&&<p role="alert">{error}</p>}
   {pathId&&<RecoveryAccess roomId={pathId} onRestore={value=>{setError('');setRoomFull(false);setCredential(value);}}/>}
  </>:<>
   {room?.deck&&<p className="room-deck-info">Колода: <strong>{room.deck.name}</strong> · {room.deck.wordCount} слов в партии{room.deck.sourceCount>36?` из ${room.deck.sourceCount}`:''}</p>}
   <label htmlFor="room-invite">Ссылка-приглашение</label><div className="room-invite"><input id="room-invite" value={invite} readOnly onFocus={e=>e.currentTarget.select()}/><button onClick={async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true);}catch{setError('Выделите и скопируйте ссылку из поля.');}}}>{copied?'Скопировано':'Копировать'}</button></div>
   <p className="room-connection" role="status">{status}</p>
   <ol className="room-players">{([0,1] as const).map(seat=><li key={seat}><span className={'room-dot '+(room?.players[seat]?.connected?'online':'')}/><span>{room?.players[seat]?.name||'Ожидаем игрока'} {credential.seat===seat?'(вы)':''}</span><small>{room?.players[seat]?room.players[seat]!.connected?'В сети':'Не в сети':'Свободное место'}</small></li>)}</ol>
   <h2>{room?.status==='expired'?'Комната закрыта':room?.status==='ready'?'Комната готова':'Ожидание соперника'}</h2>
   <p>{room?.status==='ready'?(credential.seat===0?'Оба игрока подключились. Можно начинать партию.':'Ожидаем, когда создатель начнёт партию.'):'Место сохраняется после закрытия вкладки в этом браузере. Для другого браузера сохраните персональный код ниже.'}</p>
   <RecoveryAccess roomId={credential.roomId} credential={credential} onRestore={setCredential}/>
   {credential.seat===0&&<button disabled={room?.status!=='ready'||pending||status!=='Связь установлена'} onClick={()=>command({type:'start_game'})}>{pending?'Подтверждаем…':'Начать игру'}</button>}
   <button onClick={()=>setRetry(x=>x+1)} disabled={status==='Связь установлена'||status.includes('другой вкладке')||room?.status==='expired'}>Подключиться снова</button>
   {error&&<p role="alert">{error}</p>}
  </>}
 </section></main>;
}
