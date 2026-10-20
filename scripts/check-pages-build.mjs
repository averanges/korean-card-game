import assert from 'node:assert/strict';
import {readFile,readdir,stat,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {roomBuildConfig,checkRoomBundle,readProductionJs} from './room-build-config.mjs';
const base='/korean-card-game/',root=resolve('dist'),html=await readFile(root+'/index.html','utf8'),meta=JSON.parse(await readFile(root+'/build-info.json','utf8'));
assert.equal(meta.base,base);assert.ok(meta.entry.startsWith(base+'assets/')&&meta.css.startsWith(base+'assets/'));
assert.equal(await readFile(root+'/404.html','utf8'),html);assert.ok(html.includes(`href="${base}diagnostics.html"`));
assert.ok(!html.includes('href="/assets/')&&!html.includes('src="/assets/'));await stat(root+'/health.html');await stat(root+'/diagnostics.html');
const js=await readFile(root+'/'+meta.entry.slice(base.length),'utf8'),css=await readFile(root+'/'+meta.css.slice(base.length),'utf8');
const expectedRooms=roomBuildConfig(process.env);
assert.deepEqual(meta.rooms,expectedRooms,'Build provenance does not match the configured room API/healthcheck');
checkRoomBundle(await readProductionJs(root+'/assets'),expectedRooms);assert.ok(!js.includes('http://127.0.0.1:8787'));
for(const match of css.matchAll(/url\(["']?([^\s)"']+)/g)){const path=match[1].split('#')[0];if(!path||path.startsWith('data:'))continue;assert.ok(path.startsWith(base),'Asset escaped project base: '+path);await stat(root+'/'+path.slice(base.length));}
async function files(dir){const result=[];for(const entry of await readdir(root+'/'+dir,{withFileTypes:true})){const path=dir+'/'+entry.name;result.push(...entry.isDirectory()?await files(path):[path]);}return result;}
const assets=(await files('assets')).filter(p=>/\.(?:js|css|webp|svg)$/.test(p));
console.log('Pages static build verified: '+assets.length+' JS/CSS/WebP/SVG files, prefixed URLs and 404 fallback.');
if(!process.argv.includes('--browser'))process.exit(0);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),out='docs/github-pages';await mkdir(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
// Intentionally no SPA rewrite: missing deep links receive the real 404 body/status.
const server=createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname===base.slice(0,-1)){res.writeHead(301,{Location:base}).end();return;}
 if(!pathname.startsWith(base)){res.writeHead(404).end('outside project');return;}
 let file=resolve(root,pathname.slice(base.length)||'index.html');if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}
 catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'}).end(await readFile(root+'/404.html'));}
}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})}),errors=[],badAssets=[],outside=[],sockets=[],passed=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return[];},addEventListener(){},removeEventListener(){}}});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));page.on('websocket',w=>sockets.push(w.url()));page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin&&!u.pathname.startsWith(base))outside.push(u.pathname);});page.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('/assets/')&&r.status()!==200)badAssets.push({path:u.pathname,status:r.status()});});
 const ready=()=>page.locator('html[data-app-status="ready"]').waitFor();
 for(const path of assets){const response=await context.request.get(origin+base+path);assert.equal(response.status(),200,path);assert.equal((await response.body()).length,(await stat(root+'/'+path)).size,path);assert.ok(response.headers()['content-type'].startsWith(mime[extname(path)]));}passed.push('All '+assets.length+' asset files return 200 and correct MIME/size');
 await page.goto(origin+base);await ready();await page.locator('.academy-home').waitFor();await page.screenshot({path:out+'/menu-mobile.png'});passed.push('Project root menu');
 await page.getByRole('button',{name:/Игра с ботом/}).click();await page.locator('.ux-hand').waitFor();assert.equal(new URL(page.url()).pathname,base+'singleplayer');
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('hangul-solo:v1:')))));
 if(saved.game.attacker===0){await page.locator('.ux-hand-hit').first().click();const attack=page.locator('.actions .attack-button').first();assert.ok(await attack.isEnabled());await attack.click();await page.locator('.battle .card').first().waitFor();}
 else{const take=page.locator('.take-button');for(let i=0;i<30&&!await take.isEnabled();i++)await page.waitForTimeout(100);assert.ok(await take.isEnabled());await take.click();}
 await page.screenshot({path:out+'/singleplayer-mobile.png'});passed.push('Real solo engine action after navigation');
 const soloReload=await page.reload();assert.equal(soloReload.status(),404);await ready();await page.locator('.ux-hand').waitFor();passed.push('Direct singleplayer reload through HTTP 404 fallback');
 await page.getByLabel('Открыть игровое меню').click();await page.getByRole('button',{name:'Главное меню',exact:true}).click();await page.locator('.academy-home').waitFor();assert.equal(new URL(page.url()).pathname,base);
 await page.getByRole('button',{name:/Мультиплеер/}).click();await page.getByRole('heading',{name:'Комната по ссылке'}).waitFor();assert.equal(new URL(page.url()).pathname,base+'multiplayer');assert.equal((await page.reload()).status(),404);await ready();await page.getByRole('heading',{name:'Комната по ссылке'}).waitFor();passed.push('Multiplayer navigation and reload');
 const roomPath=base+'room/'+'a'.repeat(43);assert.equal((await page.goto(origin+roomPath)).status(),404);await ready();await page.getByRole('heading',{name:'Приглашение в комнату'}).waitFor();assert.equal(await page.getByText('Неверная ссылка комнаты.',{exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'← Главное меню'}).getAttribute('href'),base);
 assert.equal((await page.reload()).status(),404);await ready();await page.getByRole('heading',{name:'Приглашение в комнату'}).waitFor();assert.equal(new URL(page.url()).pathname,roomPath);await page.screenshot({path:out+'/room-direct-mobile.png'});passed.push('Direct room ID and refresh preserved without redirect/query encoding');
 await page.getByRole('link',{name:'← Главное меню'}).click();assert.equal(new URL(page.url()).pathname,base);await page.setViewportSize({width:1440,height:900});await page.screenshot({path:out+'/menu-desktop.png'});
 await page.goto(origin+base+'diagnostics.html');await page.locator('#state').filter({hasText:'Проверки файлов завершены'}).waitFor();assert.equal(await page.locator('#results .bad').count(),0);assert.ok((await page.locator('#details').innerText()).includes(meta.entry));assert.equal(await page.getByRole('link',{name:'Простой HTML'}).getAttribute('href'),'health.html');
 await page.getByRole('button',{name:'Проверить запуск приложения'}).click();await page.locator('#app-state').filter({hasText:'Успешно'}).waitFor();passed.push('Diagnostics and iframe launch stay inside project prefix');
 const noJS=await browser.newContext({javaScriptEnabled:false}),health=await noJS.newPage();assert.equal((await health.goto(origin+base+'health.html')).status(),200);assert.equal(await health.locator('h1').innerText(),'Сайт доступен!');await noJS.close();passed.push('Health HTML works with JavaScript disabled');
 assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);assert.deepEqual(outside,[]);assert.deepEqual(sockets,[]);console.log('GitHub Pages browser checks passed: '+passed.length);await context.close();
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(out+'/checks.json',JSON.stringify({base,entry:meta.entry,css:meta.css,assets:assets.length,passed,errors,badAssets,outside,sockets},null,2));}
