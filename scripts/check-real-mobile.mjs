// Actual application only; requires a production preview and a local real room Worker.
// Never point this test at a public site: it creates a local room and plays both seats.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})});
const origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:4176',out='docs/mobile-layout-fix',reports=[],errors=[];
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname),'This test may create rooms only on a local server');
await mkdir(out,{recursive:true});
async function inspect(page,label,mobile=true){
 const info=await page.evaluate(()=>{
  const data=el=>{if(!el)return null;const b=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom,display:s.display,position:s.position,overflowX:s.overflowX,overflowY:s.overflowY,zIndex:s.zIndex,transform:s.transform,columns:s.gridTemplateColumns,areas:s.gridTemplateAreas};};
  return {width:innerWidth,height:innerHeight,meta:document.querySelector('meta[name=viewport]')?.content,query:matchMedia('(max-width:600px), (max-width:1000px) and (max-height:500px)').matches,classes:document.querySelector('main').className,pageWidth:document.documentElement.scrollWidth,hud:data(document.querySelector('.mobile-hud')),desktopHud:data(document.querySelector('.statusbar')),opponentFan:data(document.querySelector('.bot-hand')),table:data(document.querySelector('.game-table')),field:data(document.querySelector('.battle')),actions:data(document.querySelector('.actions')),hand:data(document.querySelector('.normal-hand')),viewport:data(document.querySelector('.normal-hand-viewport')),items:Array.from(document.querySelectorAll('.hand-item')).map(data),cards:Array.from(document.querySelectorAll('.battle .card')).map(data),buttons:Array.from(document.querySelectorAll('.actions>button')).map(data),pairs:document.querySelectorAll('.battle .pair').length,resources:performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(s=>s.startsWith('/assets/'))};
 });
 assert.ok(info.pageWidth<=info.width);assert.ok(info.cards.length>0,'A real occupied table is required');
 if(label.includes('one-attack'))assert.equal(info.cards.length,1,'The one-attack screenshot must contain exactly one table card');
 if(label.includes('several'))assert.ok(info.cards.length>=2,'The several-card screenshot must contain multiple table cards');
 if(mobile){assert.equal(info.query,true);assert.ok(info.classes.includes('compact-layout'));assert.ok(info.hud.height<=90);assert.equal(info.desktopHud,null);assert.equal(info.opponentFan,null);assert.equal(info.viewport.overflowX,'auto');assert.equal(info.field.display,'grid');assert.equal(info.actions.position,'relative');assert.equal(info.actions.display,'flex');assert.ok(info.field.bottom<=info.actions.y+1);assert.ok(info.actions.bottom<=info.hand.y+1);assert.ok(info.hand.bottom<=info.height+1);
  for(let i=1;i<info.items.length;i++){const prev=info.items[i-1],item=info.items[i];assert.ok(item.x+item.width/2>prev.right,'Adjacent card covers the next center');assert.ok(item.x>=prev.right-1,'Mobile hand cards overlap');}
  for(const card of info.cards){assert.ok(card.x>=info.field.x-2&&card.right<=info.field.right+2);assert.ok(card.y>=info.field.y-2&&card.bottom<=info.field.bottom+2,'Visible table card clipped');}
  for(const button of info.buttons){assert.ok(button.height>=44);assert.ok(button.x>=0&&button.right<=info.width+1);}
  for(const item of info.items)assert.match(item.transform,/^matrix\(1, 0, 0, 1,/,'Desktop fan rotation remains');
  const viewport=page.locator('.normal-hand-viewport'),previousScroll=await viewport.evaluate(el=>el.scrollLeft);
  await viewport.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.waitForTimeout(60);
  const last=await page.locator('.hand-item').last().boundingBox(),bounds=await viewport.boundingBox();assert.ok(last.x>=bounds.x-1&&last.x+last.width<=bounds.x+bounds.width+1,'Last own card inaccessible');
  await viewport.evaluate((el,left)=>el.scrollLeft=left,previousScroll);
 }else{assert.equal(info.query,false);assert.equal(info.hud,null);assert.ok(info.opponentFan?.height>0);assert.ok(info.desktopHud?.height>90);assert.ok(info.actions.x>info.field.x+info.field.width*.7);}
 await page.screenshot({path:`${out}/${label}.png`});reports.push({label,...info});
}
const monitor=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('websocket',ws=>ws.on('framereceived',event=>{try{const message=JSON.parse(event.payload.toString());if(message.game)page.snapshot=message.game;}catch{}}));};
async function changed(page,revision){for(let i=0;i<100;i++){if(page.snapshot?.revision>revision){await page.waitForTimeout(100);return;}await page.waitForTimeout(50);}throw Error('Actual server revision timeout');}
async function choose(page,id){const card=page.locator(`[data-card-id="${id}"] .face`);await card.scrollIntoViewIfNeeded();await card.tap();}
async function screenshots(page,kind){await page.waitForTimeout(1100);for(const [width,height] of [[390,844],[360,780]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);await inspect(page,`network-${kind}-${width}`);}}
try{
 const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}))),pages=await Promise.all(contexts.map(c=>c.newPage()));pages.forEach(monitor);
 const [a,b]=pages;await a.goto(origin+'/multiplayer');await a.getByLabel('Ваше имя').fill('Проверка 390');await a.locator('.room-panel form button').first().click();await a.locator('#room-invite').waitFor();const invitation=await a.locator('#room-invite').inputValue();assert.ok(invitation.startsWith(origin));
 await b.goto(invitation);await b.getByLabel('Ваше имя').fill('Проверка 360');await b.locator('.room-panel form button').first().click();await a.getByRole('button',{name:'Начать игру',exact:true}).waitFor();await a.getByRole('button',{name:'Начать игру',exact:true}).click();await Promise.all(pages.map(p=>p.locator('.network-table').waitFor()));
 await a.waitForTimeout(900);let capturedAttack=false,capturedSeveral=false;
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
  if(d.allowed.defend.length){const target=d.allowed.defend.find(x=>x.cardRefs.length);if(target){const rev=d.revision;await choose(defender,target.cardRefs[0]);await defender.locator('.battle .pair').nth(target.target).locator('.target').tap();await changed(a,rev);await changed(b,rev);}}
  attack=actor.snapshot;d=defender.snapshot;
  if(attack.allowed.attack.length&&attack.view.table.length<2){const rev=attack.revision;await choose(actor,attack.allowed.attack[0]);await actor.locator('.actions .attack-button').first().tap();await changed(a,rev);await changed(b,rev);}
  if(a.snapshot.view.table.length>=2){await screenshots(a,'several');capturedSeveral=true;break;}
  d=defender.snapshot;if(d.allowed.take){const rev=d.revision;await defender.locator('.actions .take-button').tap();await changed(a,rev);await changed(b,rev);}
  attack=actor.snapshot;if(attack.allowed.end){const rev=attack.revision;await actor.locator('.actions .attack-button').last().tap();await changed(a,rev);await changed(b,rev);}
 }
 assert.ok(capturedAttack&&capturedSeveral,'Need both real one-attack and multi-pair screenshots');
 await a.setViewportSize({width:1440,height:900});await a.waitForTimeout(250);await inspect(a,'network-desktop-1440',false);
 for(const width of [390,360]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:780},isMobile:true,hasTouch:true}),p=await context.newPage();monitor(p);await p.goto(origin+'/singleplayer');await p.locator('.normal-hand .face').first().waitFor();await p.waitForTimeout(700);
  let one=false,several=false;
  for(let step=0;step<70&&!several;step++){
   const cards=p.locator('.battle .card'),count=await cards.count();
   if(count===1&&!one){const elapsed=await cards.first().evaluate(el=>Number(el.getAnimations()[0]?.currentTime??540));await p.waitForTimeout(Math.max(0,540-elapsed));if(await cards.count()===1){await inspect(p,`solo-one-attack-${width}`);one=true;}}
   if(count>=2&&one){await p.waitForTimeout(600);if(await cards.count()>=2){await inspect(p,`solo-several-${width}`);several=true;break;}}
   const canAttack=await p.locator('.actions .attack-button').count();
   if(canAttack){
    const own=await p.locator('.hand-item').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.cardId,rank:n.querySelector('.corner')?.childNodes[0]?.textContent,disabled:n.querySelector('.face').disabled}))),onTable=await p.locator('[data-board-card]').evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.dataset.boardCard)));
    const ranks=['6','7','8','9','10','В','Д','К','Т'],candidate=own.find(c=>!c.disabled&&(!onTable.length||onTable.some(t=>ranks[t.rank]===c.rank)));
    if(candidate){await choose(p,candidate.id);const button=p.locator('.actions .attack-button').first();if(await button.isEnabled())await button.tap();else if(await p.locator('.actions .attack-button').last().isEnabled())await p.locator('.actions .attack-button').last().tap();}
    else if(await p.locator('.actions .attack-button').last().isEnabled())await p.locator('.actions .attack-button').last().tap();
   }else if(count){
    const own=p.locator('.normal-hand .face:not(:disabled)');let defended=false;for(let i=0;i<await own.count();i++){await own.nth(i).tap();const target=p.locator('.target.allowed');if(await target.count()){await target.first().tap();defended=true;break;}}if(!defended&&await p.locator('.actions .take-button').isEnabled())await p.locator('.actions .take-button').tap();
   }
   await p.waitForTimeout(200);
  }
  assert.ok(one&&several,'Solo must show actual played cards');await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Actual production UI passed: two genuine WebSockets, legal server moves, solo bot, 390/360 computed layout and screenshots; desktop retained.');
 await Promise.all(contexts.map(c=>c.close()));
}finally{await browser.close();await writeFile(`${out}/computed-styles.json`,JSON.stringify({origin,engine:'Actual source Worker in Miniflare; no fixture injection; production frontend; legal moves through UI',reports,errors},null,2));}

