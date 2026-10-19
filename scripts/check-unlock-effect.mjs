// Real production UI with a deterministic engine-generated post-refill solo fixture.
// Does not create rooms or replace network snapshots.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createGame,drawToSix} from '../worker/.wrangler/test-build/src/engine.js';
import {createChallengeBook} from '../worker/.wrangler/test-build/src/game-core/challenges.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:4176',out='docs/balance';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})}),results=[],errors=[];
try{
 for(const [label,width,height,overview,reduced] of [['fan',390,844,false,false],['desktop',1440,900,false,false],['overview',390,844,true,false],['reduced',390,844,false,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<600,reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/singleplayer');await page.locator(width<600?'.ux-hand':'.normal-hand').waitFor();
  const game=createGame(()=>.43);game.attacker=0;game.discard.push(...game.hands[0].splice(0,3));drawToSix(game,0,()=>0);
  await page.addInitScript(session=>{const key=Object.keys(localStorage).find(k=>k.startsWith('hangul-solo:v1:'));if(!key)throw Error('Solo storage absent');localStorage.setItem(key,JSON.stringify(session));},{version:1,game,book:createChallengeBook(),memory:{},recent:[]});
  await page.reload();await page.locator(width<600?'.ux-hand':'.normal-hand').waitFor();if(overview)await page.getByRole('button',{name:/Обзор руки/}).click();
  const sealed=game.hands[0].find(c=>game.learning.seals[c.id]?.locked),ref=game.learning.seals[sealed.id].ref;
  await page.locator(overview?`[data-hand-ref="${ref}"]`:width<600?`button[aria-label="Открыть замок: ${sealed.word.ko}"]`:`[data-sealed-ref="${ref}"] button`).click();
  const question=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('hangul-solo:v1:')))).game.learning.attempts[0]);
  await page.clock.install();await page.locator('.learning-options button').nth(question.quiz.options.indexOf(question.quiz.correct)).click();
  await page.waitForTimeout(750);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+50));
  if(reduced){assert.equal(await page.locator('.unseal-effect').count(),0);results.push({label,plainReveal:true});}
  else{
   const samples=await page.evaluate(()=>{
    const root=document.querySelector('.unseal-effect');if(!root)throw Error('No unseal effect');const animations=root.getAnimations({subtree:true}),samples=[];
    for(const time of [270,700,900]){for(const a of animations){a.pause();a.currentTime=Number(a.effect.getTiming().delay)+time;}const r=root.getBoundingClientRect(),s=getComputedStyle(root);samples.push({time,x:r.x,y:r.y,width:r.width,height:r.height,transform:s.transform,duration:s.animationDuration,pointerEvents:s.pointerEvents});}
    for(const a of animations)a.currentTime=Number(a.effect.getTiming().delay)+270;return samples;
   });
   assert.ok(samples.every(s=>s.transform===samples[0].transform&&s.x===samples[0].x&&s.y===samples[0].y&&s.duration==='1s'&&s.pointerEvents==='none'));
   assert.equal(await page.locator('.unseal-effect > .animation-card').count(),0);
   assert.ok(samples[0].x>=-1&&samples[0].y>=0&&samples[0].x+samples[0].width<=width+1&&samples[0].y+samples[0].height<=height+1);
   await page.screenshot({path:`${out}/unseal-${label}-flash.png`});
   await page.evaluate(()=>{const root=document.querySelector('.unseal-effect');for(const a of root.getAnimations({subtree:true}))a.currentTime=Number(a.effect.getTiming().delay)+700;});
   await page.screenshot({path:`${out}/unseal-${label}-frame.png`});results.push({label,samples});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Unseal production UI passed: fan, desktop, overview, reduced motion; stationary 1s effect.');
}finally{await browser.close();await writeFile(out+'/effect-checks.json',JSON.stringify({results,errors,fixture:'Engine-generated post-refill solo state, answered through actual UI'},null,2));}
