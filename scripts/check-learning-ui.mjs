// Actual application only; requires a production preview and a local real room Worker.
// Never point this test at a public site: it creates a local room and plays both seats.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})});
const origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:4176',out='docs/stage6',reports=[],errors=[];
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'This test may create rooms only on a local server');
await mkdir(out,{recursive:true});
async function inspect(page,label,mobile=true){
 const info=await page.evaluate(()=>{
  const data=el=>{if(!el)return null;const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,display:s.display,position:s.position,overflowX:s.overflowX,overflowY:s.overflowY,zIndex:s.zIndex,transform:s.transform,columns:s.gridTemplateColumns,areas:s.gridTemplateAreas};};
  return {width:innerWidth,height:innerHeight,meta:document.querySelector('meta[name=viewport]')?.content,query:matchMedia('(max-width:600px), (max-width:1000px) and (max-height:500px)').matches,classes:document.querySelector('main').className,pageWidth:document.documentElement.scrollWidth,hud:data(document.querySelector('.mobile-hud')),desktopHud:data(document.querySelector('.statusbar')),opponentFan:data(document.querySelector('.bot-hand')),table:data(document.querySelector('.game-table')),field:data(document.querySelector('.battle')),actions:data(document.querySelector('.actions')),hand:data(document.querySelector('.ux-hand')),viewport:data(document.querySelector('.ux-fan')),items:Array.from(document.querySelectorAll('.ux-hand-hit')).map(data),preview:data(document.querySelector('.ux-selection')),cards:Array.from(document.querySelectorAll('.battle .card')).map(data),buttons:Array.from(document.querySelectorAll('.actions>button')).map(data),pairs:document.querySelectorAll('.battle .pair').length,resources:performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(s=>s.startsWith('/assets/'))};
 });
 assert.ok(info.pageWidth<=info.width);assert.ok(info.cards.length>0,'A real occupied table is required');
 if(label.includes('one-attack'))assert.equal(info.cards.length,1,'The one-attack screenshot must contain exactly one table card');
 if(label.includes('several'))assert.ok(info.cards.length>=2,'The several-card screenshot must contain multiple table cards');
 if(mobile){assert.equal(info.query,true);assert.ok(info.classes.includes('compact-layout'));assert.ok(info.hud.height<=90);assert.equal(info.desktopHud,null);assert.equal(info.opponentFan,null);assert.ok(info.hud.height<=64);assert.equal(info.field.display,'grid');assert.equal(info.actions.position,'relative');assert.equal(info.actions.display,'flex');if(info.width<=600)assert.ok(info.field.bottom<=info.actions.y+1);assert.ok(info.actions.bottom<=info.hand.y+1);assert.ok(info.hand.bottom<=info.height+1);
  for(let i=1;i<info.items.length;i++)assert.ok(info.items[i].x>=info.items[i-1].right-1,'Tap lanes overlap');
  for(const item of info.items){assert.ok(item.width>=43.5);assert.ok(item.x>=0&&item.right<=info.width+1);}
  for(const button of info.buttons){assert.ok(button.height>=44);assert.ok(button.x>=0&&button.right<=info.width+1);}
  for(const card of info.cards){assert.ok(card.x>=info.field.x-3&&card.right<=info.field.right+3);}
 }else{assert.equal(info.query,false);assert.equal(info.hud,null);assert.ok(info.opponentFan?.height>0);assert.ok(info.desktopHud?.height>90);assert.ok(info.actions.x>info.field.x+info.field.width*.7);}
 await page.screenshot({path:`${out}/${label}.png`});reports.push({label,...info});
}
const monitor=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>ws.on('framereceived',event=>{try{const message=JSON.parse(event.payload.toString());if(message.game)page.snapshot=message.game;}catch{}}));};
async function changed(page,revision){for(let i=0;i<100;i++){if(page.snapshot?.revision>revision){await page.waitForTimeout(100);return;}await page.waitForTimeout(50);}throw Error('Actual server revision timeout');}
async function choose(page,id){const direct=page.locator(`button[data-card-id="${id}"]`);if(await direct.count()){if(await direct.getAttribute('aria-pressed')!=='true')await direct.tap();assert.equal(await direct.getAttribute('aria-pressed'),'true','A deliberate card tap must select it');return;}await page.getByRole('button',{name:/Обзор руки/}).tap();const tile=page.locator(`[data-hand-ref="${id}"]`);if((await tile.getAttribute('class'))?.includes('is-picked'))await page.getByLabel('Закрыть окно',{exact:true}).tap();else await tile.tap();}
async function screenshots(page,kind){await page.waitForTimeout(1100);for(const [width,height] of [[320,700],[360,780],[390,844],[430,932]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);await inspect(page,`network-${kind}-${width}`);}}
const dictionary=(await import('../worker/.wrangler/test-build/src/words.js')).words;
const coverage={reading:false,readingWrong:false,readingResume:false,reward:false,audio:false,audioResume:false,ttsFailure:false,wrongTwice:false,thirdSuccess:false};
try{
 for(let gameAttempt=0;gameAttempt<4&&!coverage.audio;gameAttempt++){
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})));
 for(const context of contexts)await context.addInitScript(()=>{window.__failAudio=true;Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return[{name:'Google 한국의',lang:'ko-KR'}];},speak(utterance){if(window.__failAudio)utterance.onerror?.({error:'synthesis-failed'});else utterance.onstart?.();},addEventListener(){},removeEventListener(){}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};});
 const pages=await Promise.all(contexts.map(c=>c.newPage()));pages.forEach(monitor);const [a,b]=pages;
 await a.goto(origin+'/multiplayer');await a.getByLabel('Ваше имя').fill('Учебный тест');await a.locator('.room-panel form button').first().click();await a.locator('#room-invite').waitFor();const invite=await a.locator('#room-invite').inputValue();await b.goto(invite);await b.getByLabel('Ваше имя').fill('Второй игрок');await b.locator('.room-panel form button').first().click();await a.getByRole('button',{name:'Начать игру',exact:true}).click();await Promise.all(pages.map(p=>p.locator('.network-table').waitFor()));await a.waitForTimeout(700);
 const sync=async(revision)=>{await changed(a,revision);await changed(b,revision);};
 const shot=async(page,label)=>{await page.screenshot({path:out+'/'+label+'.png'});};
 async function unlock(page,seal){
  const previousMagic=page.snapshot.view.magic.length;
  if(!coverage.reading){for(const [width,height] of [[320,700],[390,844],[1440,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);await shot(page,'sealed-hand-'+width);assert.ok(await page.locator('.sealed-card').count());assert.equal(await page.locator('.sealed-card .corner,.sealed-card .translation').count(),0);}await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await page.getByRole('button',{name:/Обзор руки/}).tap();await shot(page,'sealed-overview-390');await page.getByLabel('Закрыть окно',{exact:true}).tap();}
const direct=page.getByRole('button',{name:'Открыть замок: '+seal.ko,exact:true});
  if(await direct.count()===1)await direct.tap();else{await page.getByRole('button',{name:/Обзор руки/}).tap();await page.locator('[data-hand-ref="'+seal.ref+'"]').tap();}
  await page.getByRole('dialog',{name:'Открыть учебный замок'}).waitFor();let q=page.snapshot.view.unlock;assert.ok(q);assert.equal(q.ko,seal.ko);assert.equal('rank' in seal,false);assert.equal('suit' in seal,false);const word=dictionary.find(w=>w.ko===q.ko);assert.ok(word);
  if(!coverage.reading){for(const [width,height] of [[320,700],[360,780],[390,844],[430,932]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);await shot(page,'reading-'+width);const bounds=await page.locator('.learning-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);}
   await page.setViewportSize({width:390,height:844});const wrong=q.options.findIndex(o=>o!==word.ru),rev=page.snapshot.revision;await page.locator('.learning-dialog .learning-options button').nth(wrong).tap();await sync(rev);assert.equal(await page.locator('.learning-dialog .result-wrong').count(),1);assert.equal(await page.locator('.learning-dialog .result-correct').count(),1);await shot(page,'reading-feedback');coverage.readingWrong=true;
   await page.getByLabel('Закрыть задание',{exact:true}).tap();await page.waitForTimeout(200);const ref=seal.ref;await page.reload();await page.locator('.network-table').waitFor();const item=page.getByRole('button',{name:'Открыть замок: '+seal.ko,exact:true});if(await item.count()===1)await item.tap();else{await page.getByRole('button',{name:/Обзор руки/}).tap();await page.locator('[data-hand-ref="'+ref+'"]').tap();}await page.waitForTimeout(1600);assert.equal(page.snapshot.view.unlock.errors,1);coverage.readingResume=true;
  }
  q=page.snapshot.view.unlock;const rev=page.snapshot.revision;await page.locator('.learning-dialog .learning-options button').nth(q.options.indexOf(word.ru)).tap();await sync(rev);assert.ok(!page.snapshot.view.sealed.some(c=>c.ref===seal.ref));coverage.reading=true;
  if(page.snapshot.view.magic.length>previousMagic){coverage.reward=true;await page.waitForTimeout(2300);await shot(page,'earned-magic-center');}else await page.waitForTimeout(1000);
  if(await page.getByRole('dialog',{name:/Ваша рука/}).count())await page.getByLabel('Закрыть окно',{exact:true}).tap();
 }
 async function listening(page){
  const id=page.snapshot.allowed.magic?.[0];if(!id)return false;
  await page.locator('.magic-stack').tap();await page.locator('.magic-gallery [data-magic-card-id="'+id+'"]').tap();await page.locator('.audio-question').waitFor();const start=page.snapshot.challenge,ko=start.quiz.audioText;
  assert.ok(!(await page.locator('.audio-question').innerText()).includes(ko));assert.ok(await page.locator('.quiz-check').isDisabled());
  await page.getByLabel('Прослушать корейское слово').tap();await page.locator('.audio-error').waitFor();assert.equal(page.snapshot.challenge.attemptsLeft,3);assert.ok(page.snapshot.view.magic.some(c=>c.id===id));coverage.ttsFailure=true;
  await page.evaluate(()=>window.__failAudio=false);await page.getByLabel('Прослушать корейское слово').tap();
  let q=page.snapshot.challenge.quiz,word=dictionary.find(w=>w.ko===q.audioText),wrong=q.options.findIndex(o=>o!==word.ru),rev=page.snapshot.revision;
  await page.locator('.audio-question .quiz-options button').nth(wrong).tap();await page.locator('.quiz-check').tap();await sync(rev);assert.equal(page.snapshot.challenge.attemptsLeft,2);assert.ok(!(await page.locator('.audio-question').innerText()).includes(ko));
  await page.locator('.spell-cancel').tap();await page.waitForTimeout(300);await page.reload();await page.locator('.network-table').waitFor();await page.locator('.magic-stack').tap();await page.locator('.magic-gallery [data-magic-card-id="'+id+'"]').tap();await page.locator('.audio-question').waitFor();assert.equal(page.snapshot.challenge.challengeId,start.challengeId);assert.equal(page.snapshot.challenge.attemptsLeft,2);coverage.audioResume=true;
  await page.evaluate(()=>window.__failAudio=false);await page.getByLabel('Прослушать корейское слово').tap();q=page.snapshot.challenge.quiz;wrong=q.options.findIndex(o=>o!==word.ru);rev=page.snapshot.revision;await page.locator('.audio-question .quiz-options button').nth(wrong).tap();await page.locator('.quiz-check').tap();await sync(rev);assert.equal(page.snapshot.challenge.attemptsLeft,1);coverage.wrongTwice=true;
  for(const [width,height] of [[320,700],[390,844],[1440,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);await shot(page,'listening-'+width);assert.ok(!(await page.locator('.audio-question').innerText()).includes(ko));}
  await page.setViewportSize({width:390,height:844});q=page.snapshot.challenge.quiz;rev=page.snapshot.revision;await page.locator('.audio-question .quiz-options button').nth(q.options.indexOf(word.ru)).tap();await page.locator('.quiz-check').tap();await sync(rev);const challenge=page.snapshot.challenge;
  if(challenge.phase==='target'&&challenge.target.kind==='trump'){rev=page.snapshot.revision;await page.locator('.suit-option').first().tap();await sync(rev);}
  if(challenge.phase==='target'&&challenge.target.kind==='hat'){rev=page.snapshot.revision;await choose(page,challenge.target.cardRefs[0]);await sync(rev);}
  assert.ok(!page.snapshot.view.magic.some(c=>c.id===id));coverage.thirdSuccess=true;coverage.audio=true;await page.waitForTimeout(3500);return true;
 }
 for(let step=0;step<140&&!(coverage.reading&&coverage.reward&&coverage.audio);step++){
  for(const page of pages)for(const seal of [...(page.snapshot.view.sealed||[])])await unlock(page,seal);
  if(coverage.reward&&!coverage.audio){for(const page of pages)if(await listening(page))break;}
  if(coverage.audio)break;
  const attacker=a.snapshot.view.attacker,actor=pages[attacker],defender=pages[1-attacker],s=actor.snapshot,d=defender.snapshot;if(s.view.result)break;
  if(s.allowed.attack.length){const rev=s.revision;await choose(actor,s.allowed.attack[0]);await actor.locator('.actions .attack-button').first().tap();await sync(rev);continue;}
  const target=d.allowed.defend.find(t=>t.cardRefs.length);if(target){const rev=d.revision;await choose(defender,target.cardRefs[0]);await defender.locator('.mobile-pair').nth(target.target).locator('.mobile-pair-hit').tap();await defender.locator('.defense-button').tap();await sync(rev);continue;}
  if(d.allowed.take){const rev=d.revision;await defender.locator('.take-button').tap();await sync(rev);continue;}
  if(s.allowed.end){const rev=s.revision;await actor.locator('.actions .attack-button').last().tap();await sync(rev);continue;}
  throw Error('No live UI action');
 }
 await Promise.all(contexts.map(c=>c.close()));}
 for(const [key,value] of Object.entries(coverage))assert.ok(value,key);assert.deepEqual(errors,[]);console.log('Stage 6 real UI passed '+JSON.stringify(coverage));
}finally{await browser.close();await writeFile(out+'/ui-checks.json',JSON.stringify({coverage,errors,kind:'Actual production app + actual local Worker, two authenticated WebSockets, no injected snapshots or deals'},null,2));}
