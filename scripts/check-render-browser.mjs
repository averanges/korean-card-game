import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {beats}=await import('../server/dist/src/engine.js');
const browser=await chromium.launch({headless:true,...(process.env.CHECK_BROWSER?{executablePath:process.env.CHECK_BROWSER}:{})}),base=(process.env.CHECK_APP_URL||'http://127.0.0.1:4178/korean-card-game').replace(/\/$/,'');
const out='docs/render-multiplayer';await mkdir(out,{recursive:true});
const reports=[],latest=new Map(),errors=[];
async function wait(test,label){const until=Date.now()+12000;while(Date.now()<until){if(test())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+label);}
try{
 const contexts=[await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),await browser.newContext({viewport:{width:360,height:780},reducedMotion:'reduce'})];
 for(const context of contexts)await context.addInitScript(()=>{const Native=window.WebSocket;window.__testSockets=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.__testSockets.push(this);}};});
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 for(const p of pages){p.on('pageerror',e=>errors.push(e.message));p.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const v=JSON.parse(payload.toString());if(v.game)latest.set(p,v);}catch{}}));}
 const [host,guest]=pages;
 let entry,direct,attacker,defender,av,dv,attackId,dealAttempts=0;
 // A random legal deal can have no beatable attack. Create another real room rather than fabricating hands.
 while(!attackId&&dealAttempts++<6){
  latest.delete(host);latest.delete(guest);
  entry=await host.goto(base+'/multiplayer');await host.locator('#room-name').fill('Node Host');await host.getByRole('button',{name:'Создать комнату',exact:true}).click();
  await host.locator('#room-invite').waitFor();const invite=await host.locator('#room-invite').inputValue();if(!invite.startsWith(base+'/room/'))throw Error('Invitation left Pages base');
  const roomId=invite.split('/').at(-1);direct=await guest.goto(invite);if(direct.status()!==404)throw Error('Expected Pages 404 fallback');await guest.locator('#room-name').fill('Node Guest');await guest.getByRole('button',{name:'Присоединиться',exact:true}).click();
  await host.getByRole('button',{name:'Начать игру',exact:true}).click();await wait(()=>pages.every(p=>latest.get(p)?.room?.roomId===roomId&&latest.get(p)?.game?.revision===1),'initial game');
  attacker=pages.find(p=>latest.get(p).self===latest.get(p).game.view.attacker);defender=pages.find(p=>p!==attacker);
  av=latest.get(attacker).game;dv=latest.get(defender).game;
  attackId=av.allowed.attack.find(id=>{const c=av.view.hand.cards.find(c=>c.id===id);return dv.view.hand.cards.some(d=>beats(d,c,{trump:av.view.trump,inverted:av.view.inverted,effects:[]}));});
 }
 if(!attackId)throw Error('No beatable attack in six real deals');
 await attacker.locator(`button.ux-hand-hit[data-card-id="${attackId}"]`).click();await attacker.getByRole('button',{name:'Атаковать',exact:true}).click();await wait(()=>pages.every(p=>latest.get(p).game.revision===2),'attack');
 await attacker.screenshot({path:out+'/node-network-390-attack.png',fullPage:true});
 dv=latest.get(defender).game;const target=dv.allowed.defend.find(d=>d.cardRefs.length);let defended=false;
 if(target){await defender.locator(`button.ux-hand-hit[data-card-id="${target.cardRefs[0]}"]`).click();await defender.getByRole('button',{name:`Защитить атаку ${target.target+1}`,exact:true}).click();await defender.getByRole('button',{name:'Защитить',exact:true}).click();defended=true;}
 else await defender.getByRole('button',{name:'Взять карты',exact:true}).click();
 await wait(()=>pages.every(p=>latest.get(p).game.revision===3),'defense or take');await defender.screenshot({path:out+'/node-network-360-defense.png',fullPage:true});
 const stable=JSON.stringify(latest.get(defender).game.view);latest.delete(defender);await defender.reload();await wait(()=>latest.get(defender)?.game?.revision===3,'refresh restoration');if(JSON.stringify(latest.get(defender).game.view)!==stable)throw Error('Refresh lost state');
 await attacker.getByRole('button',{name:defended?'Завершить атаку':'Завершить подкидывание',exact:true}).click();await wait(()=>pages.every(p=>latest.get(p).game.revision>=4),'next round');
 reports.push({case:'real browser two-player room, mobile move, direct Pages fallback, refresh and round end',ok:true,entryStatus:entry.status(),roomDirectStatus:direct.status(),defended,dealAttempts,viewports:[390,360]});
 // Close the real browser socket: the existing client must recover without a page reload.
 const sameRevision=latest.get(guest).game.revision;const count=await guest.evaluate(()=>window.__testSockets.length);latest.delete(guest);await guest.evaluate(()=>window.__testSockets.at(-1).close(4000,'test_disconnect'));await wait(()=>latest.get(guest)?.game?.revision===sameRevision,'automatic WebSocket reconnect');if(await guest.evaluate(()=>window.__testSockets.length)<=count)throw Error('No new socket after close');reports.push({case:'automatic WebSocket reconnect without reload',ok:true});
 // Trigger a real transport interruption through browser networking, then restore it.
 const before=latest.get(guest).game.revision;await contexts[1].setOffline(true);await contexts[1].setOffline(false);await guest.evaluate(()=>window.dispatchEvent(new Event('online')));await guest.reload();await wait(()=>latest.get(guest)?.game?.revision===before,'offline reconnect');reports.push({case:'offline/online + reload restores revision',ok:true});
 // Ordinary mode remains independent of the Node endpoint.
 const solo=await contexts[0].newPage();await solo.goto(base+'/singleplayer');await solo.locator('.game-table').waitFor();reports.push({case:'singleplayer still renders',ok:true});
 if(errors.length)throw Error('JavaScript error: '+errors[0]);
 const report={checkedAt:new Date().toISOString(),target:'production client + real Node room API',reports,errors};await writeFile(out+'/browser-checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.log(String(error));for(const [p,v]of latest)console.log(JSON.stringify({url:p.url(),revision:v.game.revision,self:v.self}));throw error;}finally{await browser.close();}

