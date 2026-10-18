import {useEffect,useRef,useState} from 'react';
import type {RoomCredential} from './protocol';
import {hasPersistentCredential,recoveryCode} from './credentials';
import {recoverRoom} from './connection';

export function RecoveryAccess({roomId,credential,onRestore}:{roomId:string;credential?:RoomCredential;onRestore:(value:RoomCredential)=>void}){
 const [code,setCode]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(credential)return <div className="recovery-access">
  <h2>Ваш персональный код</h2>
  <p>Сохраните код, чтобы вернуть своё место в этой комнате в другом браузере или на другом устройстве. Он даёт доступ к вашей руке. Сопернику отправляйте только ссылку-приглашение.</p>
  {!hasPersistentCredential(credential)&&<p role="alert">Браузер не разрешил постоянное сохранение. Обязательно сохраните персональный код перед закрытием игры.</p>}
  {visible?<><input aria-label="Персональный код восстановления" value={recoveryCode(credential)} readOnly autoComplete="off" spellCheck={false} onFocus={e=>e.currentTarget.select()}/><button onClick={async()=>{try{await navigator.clipboard.writeText(recoveryCode(credential));setMessage('Код скопирован.');}catch{setMessage('Выделите код и скопируйте вручную.');}}}>Копировать код</button><button onClick={()=>setVisible(false)}>Скрыть код</button></>:<button onClick={()=>setVisible(true)}>Показать мой код</button>}
  <p role="status">{message}</p>
 </div>;
 return <div className="recovery-access"><h2>Вернуться в игру</h2><p>Уже играли в этой комнате? Введите свой персональный код. Имя и ссылка-приглашение не восстанавливают занятое место.</p>
  <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('Проверяем код на сервере…');try{const value=await recoverRoom(code,roomId);setCode('');onRestore(value);}catch(error){setMessage(error instanceof Error?error.message:'Не удалось проверить код.');}finally{setBusy(false);}}}>
   <label htmlFor="recovery-code">Персональный код</label><input id="recovery-code" type="password" value={code} onChange={e=>setCode(e.target.value)} maxLength={120} required autoComplete="off" spellCheck={false} disabled={busy}/><button disabled={busy||!code.trim()}>{busy?'Проверяем…':'Восстановить своё место'}</button>
  </form><p role="status">{message}</p>
 </div>;
}
export function RecoveryDialog({credential,onClose}:{credential:RoomCredential;onClose:()=>void}){
 const panel=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const before=document.activeElement as HTMLElement;panel.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current();if(e.key==='Tab'){const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button,input')||[]),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);if(before?.isConnected)before.focus();};},[]);
 return <div className="overlay recovery-overlay" onClick={onClose}><section ref={panel} className="room-panel recovery-dialog" role="dialog" aria-modal="true" aria-label="Восстановление доступа" onClick={e=>e.stopPropagation()}><button onClick={onClose}>Закрыть</button><RecoveryAccess roomId={credential.roomId} credential={credential} onRestore={()=>{}}/></section></div>;
}
