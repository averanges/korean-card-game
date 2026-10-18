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
   <div className="parchment quiz-panel"><h2>{question?'Задание':'Результат'}</h2>{question&&c.quiz?<><div className="quiz-heading"><button aria-label="Озвучить задание" hidden={c.quiz.direction!=='ko-ru'} onClick={()=>void speakKorean(c.quiz!.prompt,setAudio)}>♪</button><strong lang={c.quiz.direction==='ko-ru'?'ko':'ru'}>{c.quiz.prompt}</strong></div><p>{c.quiz.direction==='ko-ru'?'Выберите русский перевод':'Выберите корейский перевод'}</p><div className="quiz-options" role="radiogroup" aria-label="Варианты перевода">{c.quiz.options.map((option,i)=><button key={i} role="radio" aria-checked={picked===i} disabled={disabled} className={picked===i?'picked':''} lang={c.quiz!.direction==='ru-ko'?'ko':'ru'} onClick={()=>setPicked(i)}>{option}</button>)}</div>{c.quiz.direction==='ru-ko'&&<div className="quiz-audio-options" aria-label="Произношение вариантов">{c.quiz.options.map((option,i)=><button key={i} aria-label={'Озвучить '+option} onClick={()=>void speakKorean(option,setAudio)}>♪ {i+1}</button>)}</div>}<button className="quiz-check" disabled={disabled||picked===undefined} onClick={()=>{if(picked!==undefined)onCommand({type:'answer_quiz',challengeId:c.challengeId,option:picked});}}>Проверить</button></>:<div className={'network-quiz-result '+(c.outcome==='wrong'?'answer-failure':'answer-success')}><strong>{text}</strong></div>}<p className="quiz-feedback" role="status">{question?text||'Верно — активация. Ошибка — карта сгорит.':text}</p><span className="sr-only" role="status">{audio}</span></div>
  </MagicDialogContent>
 </section></div>;
}
