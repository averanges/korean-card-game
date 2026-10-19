import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const html=await readFile('dist/index.html','utf8'),jsPath=html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1],cssPath=html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];assert.ok(jsPath&&cssPath);
const js=await readFile('dist'+jsPath,'utf8'),css=await readFile('dist'+cssPath,'utf8');for(const token of ['begin_unlock','answer_unlock','continue_unlock','close_unlock','audioText','attemptsLeft','hangul-solo:v1:'])assert.ok(js.includes(token),token);assert.ok(css.includes('sealed-card.webp'));assert.ok(css.includes('unseal-effect'));await stat('dist/assets/sealed-card.webp');assert.ok(!/\/assets\/[^\s)'";]+\.png/.test(css));
if(process.argv.includes('--git-head')){for(const path of ['src/learning.ts','src/learning.css','src/SealedCard.tsx','src/UnlockDialog.tsx','src/AudioQuestion.tsx','src/soloSession.ts','worker/test/learningSession.test.ts','public/assets/sealed-card.webp'])execFileSync('git',['cat-file','-e','HEAD:'+path],{stdio:'pipe'});const source=execFileSync('git',['show','HEAD:worker/src/gameSession.ts'],{encoding:'utf8'});assert.ok(source.includes('answer_unlock'));}
console.log('Learning production build verified: '+jsPath+', '+cssPath+'. No publication performed.');
