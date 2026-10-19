import {AudioQuestion} from '../AudioQuestion';
import {useEffect,useRef,useState} from 'react';
import {MagicDialogContent} from '../MagicDialogContent';
import {spells} from '../spells';
import {legendaryTimings} from '../animationModel';
import {speakKorean} from '../speech';
import type {PublicChallenge} from './protocol';
import type {Intent} from './NetworkTable';
export function NetworkMagicDialog({challenge:c,disabled,busy,simple,onCommand}:{challenge?:PublicChallenge;disabled:boolean;busy:boolean;simple:boolean;onCommand:(intent:Intent)=>void}) {
 const [picked,setPicked]=useState<number>(),[dismissed,setDismissed]=useState(''),[audio,setAudio]=useState('');
 const dialog=useRef<HTMLElement>(null),cancel=useRef(()=>{});
 const spell=spells.find(s=>s.id===c?.magicKind),question=c?.phase==='question',result=c?.phase==='resolved';
 const visible=!!c&&!!spell&&(question||result&&dismissed!==c.challengeId);
 cancel.current=()=>{if(question&&!disabled)onCommand({type:'cancel_quiz',challengeId:c!.challengeId});};
 useEffect(()=>{setPicked(undefined);},[c?.challengeId]);
 useEffect(()=>{if(!result||!c)return;const timer=setTimeout(()=>setDismissed(c.challengeId),c.outcome==='wrong'?(simple?1000:legendaryTimings.wrongAnswer+legendaryTimings.burn):c.outcome==='unavailable'?2200:legendaryTimings.answer);return()=>clearTimeout(timer);},[c?.challengeId,c?.phase,c?.outcome,simple]);
 useEffect(()=>{
  if(!visible)return;const before=document.activeElement as HTMLElement;dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();cancel.current();}if(e.key==='Tab'){const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);if(before?.isConnected)before.focus();};
 },[visible,c?.challengeId]);
 if(!visible||!c||!spell)return null;
 const text=result?(c.outcome==='wrong'?'Неверно. Магическая карта сгорела.':c.outcome==='unavailable'?'Условия изменились. Карта сохранена.':'Верно! Магия активирована.'):busy?'Ожидаем подтверждения сервера…':disabled?'Восстанавливаем связь. Вопрос сохранён.':'';
 return <div className="overlay magic-overlay" onClick={()=>cancel.current()}><section ref={dialog} className="magic-dialog" role="dialog" aria-modal="true" aria-label={spell.name} onClick={e=>e.stopPropagation()}>
  <MagicDialogContent spell={spell} failed={c.outcome==='wrong'} burnDelay={simple?0:legendaryTimings.wrongAnswer} burnDuration={simple?120:legendaryTimings.burn} cancelDisabled={!question||disabled} onCancel={()=>cancel.current()}>
   {question&&c.quiz?<AudioQuestion onCancel={()=>cancel.current()} id={c.challengeId} audioText={c.quiz.mode==='listening'?c.quiz.audioText:c.quiz.direction==='ko-ru'?c.quiz.prompt:undefined} options={c.quiz.options} attemptsLeft={c.attemptsLeft??3} lastWrong={c.lastWrong} disabled={disabled} onAnswer={option=>onCommand({type:'answer_quiz',challengeId:c.challengeId,option})}/>:<div className="parchment quiz-panel"><h2>Результат</h2><p role="status">{text}</p>{c.solution&&<><strong lang="ko">{c.solution.ko}</strong><p>{c.solution.ru}</p></>}</div>}
   {busy&&<p className="sr-only" role="status">Ожидаем подтверждения сервера…</p>}
  </MagicDialogContent>
 </section></div>;
}
