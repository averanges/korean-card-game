// Actual production UI; negative HTTP cases are browser-local, never real room creation.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:4176';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})}),out='docs/cors',passed=[];
await mkdir(out,{recursive:true});
try{
 for(const kind of ['network','timeout','html','room-full']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let posts=0;
  await page.route('**/api/rooms',route=>{
   const cors={'Access-Control-Allow-Origin':new URL(origin).origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});posts++;
   if(kind==='network')return route.abort('failed');
   if(kind==='timeout')return;
   if(kind==='html')return route.fulfill({status:502,contentType:'text/html',headers:cors,body:'<html>CANARY_PRIVATE</html>'});
   return route.fulfill({status:409,contentType:'application/json',headers:cors,body:JSON.stringify({error:'room_full'})});
  });
  await page.goto(origin+'/multiplayer');await page.locator('html[data-app-status="ready"]').waitFor();await page.getByLabel('Ваше имя').fill('Сетевой тест');await page.clock.install();await page.getByRole('button',{name:'Создать комнату',exact:true}).click();
  if(kind==='timeout')await page.clock.fastForward(12001);
  const error=page.locator('.room-panel [role="alert"]');await error.waitFor();const text=await error.innerText();
  assert.match(text,kind==='network'?/Не удалось связаться/:kind==='timeout'?/не ответил за 12 секунд/:kind==='html'?/некорректный ответ/:/Оба места уже заняты/);
  assert.ok(!text.includes('Failed to fetch')&&!text.includes('signal aborted')&&!text.includes('CANARY'));assert.equal(posts,1);
  if(kind!=='room-full')assert.ok(await page.getByRole('button',{name:'Создать комнату',exact:true}).isEnabled());
  await page.screenshot({path:out+'/client-'+kind+'.png'});passed.push({kind,posts,message:text});await context.close();
 }
 console.log('Room error UI checks passed: '+passed.length);
}finally{await browser.close();await writeFile(out+'/client-ui.json',JSON.stringify({passed},null,2));}
