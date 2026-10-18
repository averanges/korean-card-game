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
export async function speakKorean(text: string, report: (message: string) => void) {
  if(!enabled)return;
  if (!('speechSynthesis' in window)) {
    report('Озвучка недоступна в этом браузере');
    return;
  }
  const token = ++request;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = await loadVoices(synth);
  if (token !== request) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseKoreanVoice(voices);
  if (voice) utterance.voice = voice;
  utterance.lang = 'ko-KR';
  utterance.rate = 0.8;
  report('');
  utterance.onerror = event => {
    if (token === request && !['canceled', 'interrupted'].includes(event.error)) {
      report('Не удалось озвучить слово. Проверьте доступность корейского голоса и соединение.');
    }
  };
  synth.speak(utterance);
}
