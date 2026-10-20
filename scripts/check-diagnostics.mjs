// Production preview only. Failure cases are isolated browser routes, never server changes.
import assert from 'node:assert/strict';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const html=await readFile('dist/index.html','utf8'),metadata=JSON.parse(await readFile('dist/build-info.json','utf8'));
assert.ok(html.includes(metadata.entry)&&html.includes(metadata.css));
for(const asset of metadata.resources){const body=await readFile('dist'+asset.path);assert.equal(body.length,asset.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),asset.sha256);}
const css=await readFile('dist'+metadata.css,'utf8');
for(const match of css.matchAll(/url\(["']?([^\s)"']+)/g)){const path=match[1].split('#')[0];if(path.startsWith('/'))await stat('dist'+path);else assert.ok(path.startsWith('data:')||path.startsWith('#'),'Unexpected external CSS resource');}
await stat('dist/diagnostics.html');await stat('dist/health.html');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),origin=process.env.CHECK_ORIGIN||'http://127.0.0.1:4176';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const out='docs/netlify-diagnostics';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})}),passed=[];
async function test(name,fn){const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage();try{await fn(page,context);passed.push(name);}finally{await context.close();}}
const complete=page=>page.locator('#state').filter({hasText:'Проверки файлов завершены'}).waitFor({timeout:25000});
try{
 await test('diagnostics independent of React, dynamic hashed paths, ordered downloads, explicit app start, no Worker',async page=>{
  const paths=[],sockets=[];page.on('request',r=>paths.push({path:new URL(r.url()).pathname,type:r.resourceType()}));page.on('websocket',w=>sockets.push(w.url()));
  await page.goto(origin+'/diagnostics.html');await complete(page);assert.equal(await page.locator('#results .bad').count(),0);assert.ok((await page.locator('#details').innerText()).includes(metadata.entry));assert.equal(await page.evaluate(()=>typeof window.HangulStartup),'undefined');
  assert.deepEqual(paths.filter(r=>r.type==='xhr').map(r=>r.path),['/index.html',metadata.entry,metadata.css,'/assets/table.webp','/build-info.json']);assert.ok(!paths.some(r=>r.type==='script'));
  await page.screenshot({path:out+'/resources-ok.png'});await page.getByRole('button',{name:'Проверить запуск приложения'}).click();await page.locator('#app-state').filter({hasText:'Успешно'}).waitFor();assert.equal(await page.frameLocator('iframe').locator('main.academy-home').count(),1);assert.deepEqual(sockets,[]);assert.ok(paths.every(r=>!r.path.startsWith('/api/')));
 });
 await test('missing JS reports HTTP and fallback instead of blank root',async page=>{
  await page.route('**'+metadata.entry+'*',r=>r.fulfill({status:404,contentType:'text/html',body:'missing'}));await page.goto(origin+'/diagnostics.html');await complete(page);assert.ok(await page.locator('#results .bad').count());assert.equal(await page.locator('#results tr').nth(1).locator('td').nth(2).innerText(),'404');
  await page.getByRole('button',{name:'Проверить запуск приложения'}).click();await page.locator('#app-state').filter({hasText:'ошибка загрузки основного скрипта'}).waitFor();await page.frameLocator('iframe').locator('#startup-status').waitFor();await page.screenshot({path:out+'/missing-js.png'});
 });
 await test('HTML masquerading as CSS is rejected',async page=>{
  await page.route('**'+metadata.css+'*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html>fallback</html>'}));await page.goto(origin+'/diagnostics.html');await complete(page);assert.ok((await page.locator('#results .bad').innerText()).includes('MIME'));
 });
 await test('each stalled resource reaches its own 12 second timeout',async page=>{
  await page.route('**'+metadata.entry+'*',()=>{});await page.goto(origin+'/diagnostics.html');await complete(page);assert.equal(await page.locator('#results tr').nth(1).locator('td').nth(1).innerText(),'Тайм-аут 12 с');assert.ok(Number(await page.locator('#results tr').nth(1).locator('td').nth(4).innerText())>=11500);assert.equal(await page.locator('#results tr').count(),5);
 });
 await test('image failure does not block React menu',async page=>{
  await page.route('**/assets/table*.webp*',r=>r.abort());await page.goto(origin+'/');await page.locator('html[data-app-status="ready"]').waitFor();assert.equal(await page.locator('#startup-status').isVisible(),false);
 });
 await test('runtime failure emits only safe code',async page=>{
  await page.route('**'+metadata.entry,r=>r.fulfill({contentType:'application/javascript',body:'throw new Error("CANARY_PRIVATE_VALUE");'}));await page.goto(origin+'/');await page.locator('html[data-startup-code="runtime-error"]').waitFor();assert.ok(await page.locator('#startup-status').isVisible());assert.ok(!(await page.locator('body').innerText()).includes('CANARY_PRIVATE_VALUE'));
 });
 await test('React render error is caught without disclosing exception',async page=>{
  await page.addInitScript(()=>{Object.defineProperty(window.crypto,'randomUUID',{value(){throw Error('CANARY_ROOM_SECRET');}});});await page.goto(origin+'/');await page.locator('html[data-startup-code="react-render"]').waitFor();assert.ok(await page.locator('#startup-status').isVisible());assert.ok(!(await page.locator('body').innerText()).includes('CANARY_ROOM_SECRET'));
 });
 await test('unhandled rejection before mount emits no private error text',async page=>{
  await page.route('**'+metadata.entry,()=>{});await page.goto(origin+'/',{waitUntil:'commit'});await page.locator('#startup-status').waitFor();await page.evaluate(()=>{setTimeout(()=>{void Promise.reject(Error('CANARY_TOKEN'));},0);});await page.locator('html[data-startup-code="unhandled-rejection"]').waitFor();assert.ok(!(await page.locator('body').innerText()).includes('CANARY_TOKEN'));
 });
 await test('HTML remains visible with JavaScript disabled',async(page,context)=>{
  const noJS=await browser.newContext({javaScriptEnabled:false}),p=await noJS.newPage();try{await p.goto(origin+'/diagnostics.html');assert.equal(await p.locator('h1').innerText(),'Диагностика запущена');await p.goto(origin+'/');assert.ok((await p.locator('#startup-status').innerText()).includes('JavaScript отключён'));}finally{await noJS.close();}
 });
 console.log('Diagnostics production checks passed: '+passed.length);
}finally{await browser.close();await writeFile(out+'/checks.json',JSON.stringify({passed,entry:metadata.entry,css:metadata.css,buildId:metadata.buildId},null,2));}
