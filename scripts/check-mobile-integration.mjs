// Actual application only; requires a production preview and a local real room Worker.
// Never point this test at a public site: it creates a local room and plays both seats.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})});
const origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:4176',out='docs/mobile-ux-integration',reports=[],errors=[];
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
try{
 if(process.env.CHECK_MODE!=='solo'){
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}))),pages=await Promise.all(contexts.map(c=>c.newPage()));pages.forEach(monitor);
 await Promise.all(contexts.map(context=>context.addInitScript(()=>{window.__spoken=0;Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return [{name:'Google 한국의',lang:'ko-KR'}];},speak(){window.__spoken++;},addEventListener(){},removeEventListener(){}}});window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};})));
 const [a,b]=pages;await a.goto(origin+'/multiplayer');await a.getByLabel('Ваше имя').fill('Проверка 390');await a.locator('.room-panel form button').first().click();await a.locator('#room-invite').waitFor();const invitation=await a.locator('#room-invite').inputValue();assert.ok(invitation.startsWith(origin));
 await b.goto(invitation);await b.getByLabel('Ваше имя').fill('Проверка 360');await b.locator('.room-panel form button').first().click();await a.getByRole('button',{name:'Начать игру',exact:true}).waitFor();await a.getByRole('button',{name:'Начать игру',exact:true}).click();await Promise.all(pages.map(p=>p.locator('.network-table').waitFor()));
 await a.waitForTimeout(900);
 const initialRevision=a.snapshot.revision;await a.locator('.ux-hand-hit').first().tap();assert.equal(await a.locator('.ux-selection').count(),1);await a.locator('.ux-hand-hit').first().tap();assert.equal(await a.locator('.ux-selection').count(),0);assert.equal(await a.evaluate(()=>window.__spoken),1);assert.equal(a.snapshot.revision,initialRevision);
 await a.getByLabel('Открыть игровое меню').tap();await a.getByLabel('Озвучка слов',{exact:true}).uncheck();await a.getByRole('button',{name:'Продолжить игру',exact:true}).tap();await a.locator('.ux-hand-hit').first().tap();assert.equal(await a.evaluate(()=>window.__spoken),1);await a.locator('.ux-hand-hit').first().tap();
 const box=await a.locator('.ux-fan').boundingBox(),cdp=await contexts[0].newCDPSession(a),x=box.x+box.width*.65,y=box.y+box.height*.55;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*14,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();assert.equal(await a.locator('.ux-selection').count(),0);assert.equal(a.snapshot.revision,initialRevision);await a.waitForTimeout(600);
 let capturedAttack=false,capturedSeveral=false;
 for(let turn=0;turn<24&&!capturedSeveral;turn++){
  const state=a.snapshot,attacker=state.view.attacker,actor=pages[attacker],defender=pages[1-attacker];
  const snap=actor.snapshot,available=snap.allowed.attack,own=snap.view.hand.cards,other=defender.snapshot.view.hand.cards;
  if(!snap.view.table.length){
   const beat=(d,c)=>d.suit===c.suit?d.rank>c.rank:d.suit===snap.view.trump&&c.suit!==snap.view.trump;
   const candidate=own.find(c=>available.includes(c.id)&&other.some(d=>beat(d,c)&&own.some(x=>x.id!==c.id&&(x.rank===d.rank||x.rank===c.rank))))||own.find(c=>available.includes(c.id));
   assert.ok(candidate);const rev=snap.revision;await choose(actor,candidate.id);await actor.locator('.actions .attack-button').first().tap();await changed(a,rev);await changed(b,rev);
   if(!capturedAttack){await screenshots(a,'one-attack');capturedAttack=true;}
  }
  let d=defender.snapshot,attack=actor.snapshot;
  if(d.allowed.defend.length){const target=d.allowed.defend.find(x=>x.cardRefs.length);if(target){const rev=d.revision;await choose(defender,target.cardRefs[0]);await defender.locator('.battle .pair').nth(target.target).locator('.mobile-pair-hit').tap();await defender.locator('.defense-button').tap();await changed(a,rev);await changed(b,rev);}}
  attack=actor.snapshot;d=defender.snapshot;
  if(attack.allowed.attack.length&&attack.view.table.length<2){const rev=attack.revision;await choose(actor,attack.allowed.attack[0]);await actor.locator('.actions .attack-button').first().tap();await changed(a,rev);await changed(b,rev);}
  if(a.snapshot.view.table.length>=2){await screenshots(a,'several');capturedSeveral=true;break;}
  d=defender.snapshot;if(d.allowed.take){const rev=d.revision;await defender.locator('.actions .take-button').tap();await changed(a,rev);await changed(b,rev);}
  attack=actor.snapshot;if(attack.allowed.end){const rev=attack.revision;await actor.locator('.actions .attack-button').last().tap();await changed(a,rev);await changed(b,rev);}
 }
 assert.ok(capturedAttack&&capturedSeveral,'Need both real one-attack and multi-pair screenshots');

 await a.setViewportSize({width:1440,height:900});await a.waitForTimeout(250);await inspect(a,'network-desktop-1440',false);await a.setViewportSize({width:844,height:390});await a.waitForTimeout(200);await a.locator('.ux-hand-hit').first().tap();await inspect(a,'network-landscape-selected-844');await a.getByLabel('Снять выбор',{exact:true}).tap();await a.setViewportSize({width:390,height:844});
 // Continue the same genuine game. Both clients use public allowed moves;
 // the controller can inspect each of its two own hands, never inject a state.
 const coverage={defend:false,throw:false,take:false,end:false,six:false,large12:false,large20:false,magic:[],blind:false,recovery:false,quizRecovery:false};
 const dictionary=(await import('../worker/.wrangler/test-build/src/words.js')).words;
 const sync=async(rev)=>{await changed(a,rev);await changed(b,rev);};
 const shot=async(page,label)=>{await page.waitForTimeout(1000);await page.screenshot({path:out+'/'+label+'.png'});};
 const closeResult=async(page)=>{for(let i=0;i<110&&await page.locator('.magic-overlay,.trump-choice-overlay').count();i++)await page.waitForTimeout(100);};
 async function magic(page){
  const snap=page.snapshot,id=snap.allowed.magic?.[0];if(!id)return false;
  const kind=snap.view.magic.find(c=>c.id===id)?.spell;
  await page.locator('.magic-stack').tap();await page.locator('.magic-gallery [data-magic-card-id="'+id+'"]').tap();await sync(snap.revision);
  let c=page.snapshot.challenge;if(c?.phase!=='question')return false;
  if(!coverage.magic.length){await shot(page,'network-magic-question-390');const before=page.snapshot;await page.reload();await page.locator('.network-table').waitFor();assert.equal(page.snapshot.revision,before.revision);assert.deepEqual(page.snapshot.view,before.view);assert.equal(page.snapshot.challenge.challengeId,c.challengeId);coverage.quizRecovery=true;}
  const q=page.snapshot.challenge.quiz,word=dictionary.find(w=>w[q.direction==='ko-ru'?'ko':'ru']===q.prompt),correct=q.options.indexOf(word?.[q.direction==='ko-ru'?'ru':'ko']);assert.ok(correct>=0);
  const rev=page.snapshot.revision;await page.locator('.quiz-options button').nth(correct).tap();await page.locator('.quiz-check').tap();await sync(rev);
  c=page.snapshot.challenge;
  if(c?.phase==='target'&&c.target.kind==='trump'){const r=page.snapshot.revision;await page.locator('.suit-option').first().tap();await sync(r);}
  if(c?.phase==='target'&&c.target.kind==='hat'){const r=page.snapshot.revision;await choose(page,c.target.cardRefs[0]);await sync(r);}
  coverage.magic.push(kind);await closeResult(page);return true;
 }
 for(let step=0;step<200&&!a.snapshot.view.result;step++){
  for(const page of pages){const n=page.snapshot.view.hand.cards.length;if(n>=12&&!coverage.large12){await shot(page,'network-large-hand-12');await page.getByRole('button',{name:/Обзор руки/}).tap();await shot(page,'network-overview-12');await page.getByLabel('Закрыть окно',{exact:true}).tap();coverage.large12=true;}if(n>=20&&!coverage.large20){await shot(page,'network-large-hand-20');await page.getByRole('button',{name:/Обзор руки/}).tap();await shot(page,'network-overview-20');await page.getByLabel('Закрыть окно',{exact:true}).tap();coverage.large20=true;}}
  const attacker=a.snapshot.view.attacker,actor=pages[attacker],defender=pages[1-attacker];
  let snap=actor.snapshot,d=defender.snapshot;
  // A few voluntary takes grow a real large hand before testing all six pairs.
  if(await magic(actor))continue;
  if(await magic(defender))continue;
  snap=actor.snapshot;d=defender.snapshot;
  if(snap.view.hand.blind){const rev=snap.revision;if(snap.allowed.attack.length){await choose(actor,snap.allowed.attack[0]);assert.equal(actor.snapshot.revision,rev);assert.equal(await actor.locator('.ux-selection-copy>strong').innerText(),'Атака вслепую');assert.equal(await actor.locator('.ux-selection .ux-card-word').count(),0);await shot(actor,'network-blind-preview');await actor.locator('.actions .attack-button').first().tap();await sync(rev);coverage.blind=true;continue;}}
  const pendingBlind=snap.view.effects.some(e=>e.kind==='monkey_prank'&&e.status==='pending'&&e.target===d.view.player);
  if(pendingBlind&&snap.allowed.end&&snap.view.table.length&&snap.view.table.every(p=>p.defense)){const rev=snap.revision;await actor.locator('.actions .attack-button').last().tap();await sync(rev);continue;}
  const own=snap.view.hand.cards;let available=own.filter(c=>snap.allowed.attack.includes(c.id));
  if(pendingBlind&&!snap.view.table.length){const beats=(a,b)=>a.suit===b.suit?(snap.view.inverted?a.rank<b.rank:a.rank>b.rank):a.suit===snap.view.trump&&b.suit!==snap.view.trump;const weak=available.find(c=>d.view.hand.cards.some(other=>beats(other,c)));if(weak)available=[weak];}
  if(available.length){const ranks=[...new Set(available.map(c=>c.rank))];ranks.sort((x,y)=>available.filter(c=>c.rank===y).length-available.filter(c=>c.rank===x).length);if(snap.view.table.length)coverage.throw=true;const group=available.filter(c=>c.rank===ranks[0]).slice(0,Math.min(snap.view.limit-snap.view.table.length,coverage.large12?6:1));const rev=snap.revision;for(const c of group)await choose(actor,c.id);await actor.locator('.actions .attack-button').first().tap();await sync(rev);
   if(actor.snapshot.view.table.length===6&&!coverage.six){await screenshots(actor,'six-pairs');coverage.six=true;const def=pages[1-actor.snapshot.view.player],rev=def.snapshot.revision;for(const t of def.snapshot.allowed.defend){if(!t.cardRefs.length)continue;await choose(def,t.cardRefs[0]);const hit=def.locator('.mobile-pair').nth(t.target).locator('.mobile-pair-hit');await hit.scrollIntoViewIfNeeded();await hit.tap();assert.equal(def.snapshot.revision,rev);assert.ok(await def.locator('.defense-button').isEnabled());}await shot(def,'network-six-pairs-target-preview');}continue;}
  const targets=d.allowed.defend.flatMap(t=>t.cardRefs.map(id=>({target:t.target,id,card:d.view.hand.cards.find(c=>c.id===id)})));
  if(targets.length&&!(step<20&&d.view.hand.cards.length<22&&!pendingBlind)){
   targets.sort((x,y)=>own.filter(c=>c.rank===y.card.rank).length-own.filter(c=>c.rank===x.card.rank).length);
   const t=targets[0],rev=d.revision;await choose(defender,t.id);assert.ok(await defender.locator('.mobile-pair.can-block').count());await defender.locator('.mobile-pair').nth(t.target).locator('.mobile-pair-hit').tap();assert.equal(defender.snapshot.revision,rev,'Selecting a target must not send a move');assert.ok(await defender.locator('.ux-selection').count());await defender.locator('.defense-button').tap();await sync(rev);coverage.defend=true;continue;
  }
  if(d.allowed.take){const rev=d.revision;await defender.locator('.take-button').tap();await sync(rev);coverage.take=true;continue;}
  if(snap.allowed.end){const rev=snap.revision;await actor.locator('.actions .attack-button').last().tap();await sync(rev);assert.equal(actor.snapshot.view.table.length,0);coverage.end=true;continue;}
  if(snap.allowed.pass){const rev=snap.revision;await actor.locator('.ghost-pass').tap();await sync(rev);continue;}
  throw Error('No legal UI action');
 }
 for(const key of ['defend','throw','take','end','six','large12','large20'])assert.ok(coverage[key],'Missing natural-game coverage: '+key);
 // Actual refresh + disconnect/foreground reconnect preserve the same PlayerView.
 const recoverPage=pages[0],before=recoverPage.snapshot;await recoverPage.reload();await recoverPage.locator('.network-table').waitFor();assert.deepEqual(recoverPage.snapshot.view,before.view);coverage.recovery=true;
 await contexts[0].setOffline(true);await recoverPage.waitForTimeout(200);await contexts[0].setOffline(false);await recoverPage.evaluate(()=>window.dispatchEvent(new Event('online')));await recoverPage.waitForTimeout(900);assert.deepEqual(recoverPage.snapshot.view,before.view);
 const replacement=await contexts[0].newPage();monitor(replacement);await replacement.goto(a.url());await replacement.locator('.network-table').waitFor();assert.deepEqual(replacement.snapshot.view,before.view);assert.equal(await replacement.locator('#room-name').count(),0);await replacement.close();
 if(process.env.CHECK_GOAL==='blind')assert.ok(coverage.blind,'Natural game must reach an actual blind attack');console.log('Coverage '+JSON.stringify(coverage));await writeFile(out+'/coverage.json',JSON.stringify(coverage,null,2));


 await Promise.all(contexts.map(c=>c.close()));}
 if(process.env.CHECK_MODE!=='network'){
 // A separate real solo game runs the existing bot and local reducer.
 const soloContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),solo=await soloContext.newPage();monitor(solo);await solo.goto(origin+'/singleplayer');await solo.locator('.ux-hand').waitFor();await solo.waitForTimeout(700);
 let soloOne=false,soloSeveral=false,soloDefense=false;
 for(let step=0;step<90&&!(soloOne&&soloSeveral&&soloDefense);step++){
  const count=await solo.locator('.battle [data-board-card]').count();
  if(count===1&&!soloOne){await solo.waitForTimeout(530);if(await solo.locator('.battle [data-board-card]').count()===1){await solo.clock.pauseAt(new Date(Date.now()+40));for(const [width,height] of [[320,700],[360,780],[390,844],[430,932]]){await solo.setViewportSize({width,height});await solo.waitForTimeout(180);await inspect(solo,'solo-one-attack-'+width);}await solo.clock.resume();soloOne=true;}}
  if(count>=2&&!soloSeveral){await solo.waitForTimeout(600);await solo.clock.pauseAt(new Date(Date.now()+40));for(const [width,height] of [[320,700],[360,780],[390,844],[430,932]]){await solo.setViewportSize({width,height});await solo.waitForTimeout(180);await inspect(solo,'solo-several-'+width);}await solo.clock.resume();soloSeveral=true;}
  if(await solo.locator('.magic-overlay,.trump-choice-overlay').count()){await solo.waitForTimeout(500);continue;}
  if(await solo.locator('.actions .attack-button').count()){
   let own=await solo.locator('.ux-hand-hit').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.cardId,label:n.getAttribute('aria-label'),disabled:n.disabled})));
   const table=await solo.locator('[data-board-card]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.dataset.boardCard))),ranks=['6','7','8','9','10','В','Д','К','Т'];
   const candidate=own.find(c=>c.id&&!c.disabled&&(!table.length||table.some(t=>c.label.startsWith(ranks[t.rank]+' '))));
   if(candidate){await choose(solo,candidate.id);if(await solo.locator('.actions .attack-button').first().isEnabled())await solo.locator('.actions .attack-button').first().tap();}
   if(await solo.locator('.actions .attack-button').last().isEnabled())await solo.locator('.actions .attack-button').last().tap();
  }else if(count){
   const own=solo.locator('.ux-hand-hit:not(:disabled)');let defended=false;
   for(let i=0;i<await own.count();i++){await own.nth(i).tap();const target=solo.locator('.mobile-pair.can-block .mobile-pair-hit');if(await target.count()){await target.first().tap();await solo.locator('.defense-button').tap();soloDefense=true;defended=true;break;}}
   if(!defended&&await solo.locator('.actions .take-button').isEnabled())await solo.locator('.actions .take-button').tap();
  }
  await solo.waitForTimeout(200);
 }
 assert.ok(soloOne&&soloSeveral&&soloDefense,'Real bot must attack, defend and show occupied table');await soloContext.close();
 }
 assert.deepEqual(errors,[]);console.log('Actual application checks passed');
}finally{await browser.close();await writeFile(`${out}/computed-styles-${process.env.CHECK_MODE||'all'}.json`,JSON.stringify({origin,reports,errors},null,2));}
