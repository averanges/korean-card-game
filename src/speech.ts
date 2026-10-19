// Voice indexes vary across browsers and devices; select by language and name.
export function chooseKoreanVoice(voices: SpeechSynthesisVoice[]) {
  const korean = voices.filter(v => /^ko(?:-|$)/i.test(v.lang));
  return korean.find(v => v.name === 'Google 한국의')
    ?? korean.find(v => /google/i.test(v.name))
    ?? korean.find(v => v.default)
    ?? korean[0];
}

function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const current = synth.getVoices();
  if (current.length) return Promise.resolve(current);
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1200);
    synth.addEventListener('voiceschanged', done);
  });
}

let request = 0;
let enabled=true;
export function setSpeechEnabled(value:boolean){enabled=value;if(!value){request++;if(typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel();}}
export async function speakKorean(text: string, report: (message: string) => void,options?:{rate?:number;requireKorean?:boolean;onStarted?:()=>void;onFailure?:()=>void}) {
  if(!enabled){options?.onFailure?.();if(options?.requireKorean)report('Озвучка выключена. Включите её в игровом меню.');return;}
  if (!('speechSynthesis' in window)) {
    options?.onFailure?.();report('Озвучка недоступна в этом браузере');
    return;
  }
  const token = ++request;
  const synth = window.speechSynthesis;
  try{synth.cancel();}catch{options?.onFailure?.();report('Озвучка недоступна. Повторите прослушивание.');return;}
  let voices:SpeechSynthesisVoice[];try{voices=await loadVoices(synth);}catch{options?.onFailure?.();report('Не удалось загрузить голоса. Повторите прослушивание.');return;}
  if (token !== request) return;
  if(typeof SpeechSynthesisUtterance==='undefined'){options?.onFailure?.();report('Воспроизведение недоступно в этом браузере.');return;}
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseKoreanVoice(voices);
  if(options?.requireKorean&&!voice){options.onFailure?.();report('Корейский голос недоступен. Установите корейский голос в настройках устройства и повторите.');return;}
  if (voice) utterance.voice = voice;
  utterance.lang = 'ko-KR';
  utterance.rate = options?.rate??0.8;
  let started=false;const timer=options?.requireKorean?setTimeout(()=>{if(!started&&token===request){options?.onFailure?.();report('Воспроизведение не началось. Повторите прослушивание.');}},2500):undefined;
  utterance.onstart=()=>{if(token!==request)return;started=true;clearTimeout(timer);options?.onStarted?.();};
  utterance.onend=()=>clearTimeout(timer);
  report('');
  utterance.onerror = event => {
    clearTimeout(timer);
    if (token === request && !['canceled', 'interrupted'].includes(event.error)) {
      options?.onFailure?.();report('Не удалось озвучить слово. Проверьте доступность корейского голоса и соединение.');
    }
  };
  try{synth.speak(utterance);}catch{clearTimeout(timer);options?.onFailure?.();report('Не удалось запустить озвучку. Повторите прослушивание.');}
}
