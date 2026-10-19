// Read-only deployment check. Does not commit, upload, or change the build.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const html=await readFile('dist/index.html','utf8');
assert.match(html,/<meta[^>]+name="viewport"[^>]+width=device-width/);
const jsPath=html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1],cssPath=html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];
assert.ok(jsPath&&cssPath,'Production entry assets are missing');
const js=await readFile('dist'+jsPath,'utf8'),css=await readFile('dist'+cssPath,'utf8');
for(const token of ['mobile-hud','compact-layout']){assert.ok(js.includes(token),`JS lacks ${token}`);assert.ok(css.includes(token),`CSS lacks ${token}`);}
assert.ok(css.includes('grid-template-areas:')&&css.includes('pan-x pinch-zoom'));
assert.ok(css.includes('table-mobile.webp'));
assert.ok(!/\/assets\/[^\s)'";]+\.png/.test(css),'Old PNG runtime paths remain');
for(const asset of new Set(css.match(/\/assets\/[\w.-]+/g)||[]))await stat('dist'+asset);
if(process.argv.includes('--git-head')){
 const show=path=>execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.ok(show('src/main.tsx').includes('MobileHud'),'HEAD has the old solo UI');
 assert.ok(show('src/rooms/NetworkTable.tsx').includes('MobileHud'),'HEAD has the old network UI');
 for(const path of ['src/MobileHud.tsx','src/useCompactViewport.ts','src/mobile.css'])assert.ok(show(path).length>0);
 for(const path of ['public/assets/table-mobile.webp','public/assets/card-frame.webp','public/assets/card-back.webp'])execFileSync('git',['cat-file','-e',`HEAD:${path}`],{stdio:'pipe'});
 console.log('HEAD contains both mobile screens and the required new files.');
}
console.log(`Mobile production build verified: ${jsPath}, ${cssPath}. No publication performed.`);
