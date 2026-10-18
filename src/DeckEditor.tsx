import {useEffect,useState} from 'react';
import {MenuDialog} from './MenuDialog';
import {validateDeck,type WordDeck,type DeckWord} from './decks';
import {useProfile} from './ProfileContext';
import {guardNavigation} from './navigation';
export function DeckEditor({deck,onSave,onClose}:{deck?:WordDeck;onSave:(deck:WordDeck)=>boolean;onClose:()=>void}){
 const {issue}=useProfile();
 const [id]=useState(()=>deck?.id??crypto.randomUUID()),[name,setName]=useState(deck?.name||''),[rows,setRows]=useState<DeckWord[]>(()=>deck?.words.map(w=>({...w}))??Array.from({length:9},()=>({id:crypto.randomUUID(),ko:'',ru:''}))),[dirty,setDirty]=useState(false),[error,setError]=useState('');
 const count=rows.filter(w=>w.ko.trim()&&w.ru.trim()).length;
 const close=()=>{if(!dirty||confirm('Закрыть без сохранения изменений?'))onClose();};
 useEffect(()=>{if(!dirty)return;const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[dirty]);
 useEffect(()=>dirty?guardNavigation(()=>confirm('Покинуть редактор без сохранения изменений?')):undefined,[dirty]);
 function change(id:string,key:'ko'|'ru',value:string){setDirty(true);setRows(prev=>prev.map(w=>w.id===id?{...w,[key]:value}:w));}
 return <MenuDialog title={deck?'Редактирование колоды':'Новый гримуар'} onClose={close} className="deck-editor">
  <form onSubmit={e=>{e.preventDefault();try{const safe=validateDeck({name,words:rows}),nonempty=rows.filter(w=>w.ko.trim()||w.ru.trim()),date=new Date().toISOString();if(onSave({id,name:safe.name,words:safe.words.map((w,i)=>({...w,id:nonempty[i].id})),builtin:false,createdAt:deck?.createdAt??date,updatedAt:date})){setDirty(false);onClose();}}catch(error){setError(error instanceof Error?error.message:'Проверьте колоду.');}}}>
   <label className="deck-name-label">Название колоды<input value={name} onChange={e=>{setName(e.target.value);setDirty(true);}} placeholder="Например, Магия повседневности" maxLength={60} required/></label>
   <p className="editor-summary">{count} из 200 слов · {count<9?`До начала партии осталось ${9-count}`:'Можно начать партию'}<small>Каждое корейское слово и каждый перевод должны быть уникальными.</small></p>
   <div className="word-column-head" aria-hidden="true"><span>Корейский</span><span>Русский</span><span/></div>
   <div className="word-rows">{rows.map((w,i)=><div className="word-row" key={w.id}><input lang="ko" aria-label={`Корейское слово ${i+1}`} value={w.ko} maxLength={80} placeholder="학교" onChange={e=>change(w.id,'ko',e.target.value)}/><input aria-label={`Русский перевод ${i+1}`} value={w.ru} maxLength={120} placeholder="школа" onChange={e=>change(w.id,'ru',e.target.value)}/><button type="button" aria-label={`Удалить строку ${i+1}`} onClick={()=>{setRows(rows.filter(r=>r.id!==w.id));setDirty(true);}}>×</button></div>)}</div>
   <button type="button" className="add-word" disabled={rows.length>=200} onClick={()=>{setRows([...rows,{id:crypto.randomUUID(),ko:'',ru:''}]);setDirty(true);}}>+ Добавить слово</button>
   {error&&<p className="academy-error" role="alert">{error}</p>}
   {issue&&<p className="academy-error" role="alert">{issue}</p>}
   <footer><button type="button" onClick={close}>Отмена</button><button className="primary-academy" type="submit">Сохранить колоду</button></footer>
  </form>
 </MenuDialog>;
}
