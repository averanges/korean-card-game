// Run against a local Vite server. Playwright may come from an external tooling runtime.
// CHECK_ORIGIN=http://127.0.0.1:5173 PLAYWRIGHT_MODULE=... CHECK_BROWSER=... node scripts/check-mobile.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})});
const origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:5173',reports=[],errors=[];
await mkdir('work',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 const sample=async(query='')=>{await page.goto(origin+'/mobile-fixture.html?'+query);await page.locator('.normal-hand .face').first().waitFor();await page.waitForTimeout(160);};
 const geometry=()=>page.evaluate(()=>{
  const box=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
  return {width:innerWidth,height:innerHeight,page:document.documentElement.scrollWidth,field:box('.battle'),actions:box('.actions'),hand:box('.normal-hand'),pairs:document.querySelectorAll('.battle .pair').length};
 });
 for(const width of [320,360,390,430,768,1024,1440])for(const count of [6,10,15,20]){
  await page.setViewportSize({width,height:width<600?844:900});await sample(`n=${count}&pairs=6&long&magic=5&trump=${count%4}`);
  const g=await geometry();assert.ok(g.page<=width,`Page overflow at ${width}/${count}`);assert.equal(g.pairs,6);assert.ok(g.field.bottom<=g.hand.top+1);assert.ok(g.actions.bottom<=g.hand.top+1);assert.ok(g.actions.left>=0&&g.actions.right<=width+1);
  assert.equal(await page.locator('.normal-hand .face').count(),count);
  const viewport=page.locator('.normal-hand-viewport');await viewport.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(60);
  const edge=await page.locator('.hand-item').last().boundingBox(),bounds=await viewport.boundingBox();assert.ok(edge.x>=bounds.x-2&&edge.x+edge.width<=bounds.x+bounds.width+2,`Last card inaccessible at ${width}/${count}`);
  if(width===390&&count===20)await page.screenshot({path:'work/stage5-mobile.png'});
  if(width===1440&&count===6)await page.screenshot({path:'work/stage5-desktop.png'});
  reports.push({width,count,geometry:'pass',lastCard:'pass'});
 }
 await page.setViewportSize({width:390,height:844});
 const swipe=async()=>{const box=await page.locator('.normal-hand-viewport').boundingBox(),cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+280,y:box.y+80}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+280-i*27,y:box.y+80}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);await cdp.detach();assert.ok(await page.locator('.normal-hand-viewport').evaluate(el=>el.scrollLeft)>0);assert.equal(await page.locator('output').getAttribute('data-last-command'),'');};
 await sample('n=20');await swipe();assert.equal(await page.locator('.hand-item.chosen').count(),0);
 await sample('n=20&mode=blind');await swipe();assert.equal(await page.locator('.normal-hand .korean').count(),0);assert.equal(await page.locator('.normal-hand .corner').count(),0);assert.equal(await page.locator('.normal-hand [data-board-card]').count(),0);
 await page.locator('.normal-hand-viewport').evaluate(el=>el.scrollLeft=0);await page.waitForTimeout(450);await page.locator('.normal-hand .face').first().tap();assert.equal(JSON.parse(await page.locator('output').getAttribute('data-last-command')).type,'attack');
 await sample('n=6');const first=page.locator('.normal-hand .face').first();await first.tap();assert.equal(await page.locator('.hand-item.chosen').count(),1);await first.tap();assert.equal(await page.locator('.hand-item.chosen').count(),0);assert.equal(await page.locator('output').getAttribute('data-last-command'),'');
 await page.getByRole('button',{name:/Слово и перевод:/}).first().tap();assert.equal(await page.getByRole('dialog',{name:'Слово на карте'}).count(),1);await page.getByRole('button',{name:'Закрыть окно'}).click();
 await page.getByRole('button',{name:/Магические карты:/}).tap();assert.equal(await page.locator('.magic-gallery-item').count(),3);assert.match(await page.locator('.magic-gallery-item').nth(1).textContent(),/Дождитесь/);assert.ok(await page.locator('.magic-gallery-item').nth(1).locator('button').isDisabled());await page.waitForTimeout(250);await page.screenshot({path:'work/stage5-magic.png'});await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await sample('mode=ghost');assert.ok(await page.locator('.ghost-locked .face').isDisabled());assert.ok(await page.locator('.ghost-locked .korean').isVisible());
 await sample('mode=hat');assert.equal(await page.locator('.hat-eligible').count(),2);assert.ok(await page.locator('.hat-ineligible .face').first().isDisabled());
 await sample('mode=fate');assert.equal(await page.locator('.trump-choice .suit-option').count(),3);await page.screenshot({path:'work/stage5-fate.png'});
 await sample('mode=quiz');assert.equal(await page.locator('.quiz-options button').count(),4);await page.locator('.quiz-options button').first().tap();const art=await page.locator('.activation-card').boundingBox(),quiz=await page.locator('.quiz-panel').boundingBox();assert.ok(art.y+art.height<=quiz.y);await page.screenshot({path:'work/stage5-quiz.png'});await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(JSON.parse(await page.locator('output').getAttribute('data-last-command')).type,'cancel_quiz');
 await sample('offline');assert.ok(await page.locator('.actions .attack-button').first().isDisabled());await page.getByRole('button',{name:'Подключиться снова'}).click();assert.match(await page.locator('.mobile-opponent').textContent(),/В сети/);
 await sample('mode=quiz&offline');assert.match(await page.locator('.quiz-feedback').textContent(),/Восстанавливаем связь/);assert.ok(await page.locator('.quiz-options button').first().isDisabled());assert.equal(await page.locator('.quiz-options button').count(),4);
 await sample('n=20&pairs=6');await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);const landscape=await geometry();assert.ok(landscape.page<=844);assert.ok(landscape.actions.bottom<=390);assert.ok(landscape.hand.bottom<=390);await page.screenshot({path:'work/stage5-landscape.png'});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.locator('.normal-hand .face').count(),20);
 await page.goto(origin+'/singleplayer');await page.locator('.normal-hand .face').first().waitFor();await page.waitForTimeout(800);const ids=await page.locator('.hand-item').evaluateAll(els=>els.map(el=>el.dataset.cardId));await page.getByRole('button',{name:'Открыть игровое меню'}).tap();await page.getByRole('button',{name:'Продолжить игру',exact:true}).tap();assert.deepEqual(await page.locator('.hand-item').evaluateAll(els=>els.map(el=>el.dataset.cardId)),ids);await page.screenshot({path:'work/stage5-solo.png'});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);assert.ok(await page.locator('.game-table.simple-motion').count());
 assert.deepEqual(errors,[]);reports.push({gestures:'normal and blind swipes do not send commands; taps select/deselect or use the established blind attack',magic:'gallery, unavailable reasons, quiz, fate, hat, ghost passed',offline:'input locked, question retained, reconnect display passed',menu:'solo preserved',orientation:'passed',reducedMotion:'passed'});
 console.log('Mobile presentation checks passed: 28 width/hand-size combinations, touch gestures, magic, offline states, menu, orientation and reduced motion.');
 await context.close();
}finally{await browser.close();await writeFile('work/stage5-checks.json',JSON.stringify({reports,errors},null,2));}
