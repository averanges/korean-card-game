import ts from 'typescript';
import {readFile,mkdir,writeFile,readdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),test=process.argv.includes('--test'),out=join(root,'server',test?'.test-build':'dist');
const seen=new Set();
async function compile(file){
 file=resolve(file);if(seen.has(file))return;seen.add(file);
 if(!file.startsWith(root))throw Error('Source outside project');
 let source=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const imports=[...source.matchAll(/(?:from\s*|import\s*)['"]([.][^'"]+)['"]/g)].map(m=>m[1]);
 source=source.replace(/(from\s*|import\s*)['"]([.][^'"]+)['"]/g,(_,prefix,spec)=>`${prefix}'${spec}.js'`);
 const target=join(out,relative(root,file).replace(/\.ts$/,'.js'));await mkdir(dirname(target),{recursive:true});await writeFile(target,source);
 for(const spec of imports)await compile(resolve(dirname(file),spec+'.ts'));
}
await mkdir(out,{recursive:true});await writeFile(join(out,'package.json'),'{"type":"module"}');
await compile(join(root,'server/src/index.ts'));
const publicOut=join(out,'render-probe/public');
await mkdir(publicOut,{recursive:true});
for(const name of ['diagnostics.html','diagnostics.js'])await copyFile(join(root,'render-probe/public',name),join(publicOut,name));
if(test){
 const dir=join(root,'server/test');const names=(await readdir(dir)).filter(n=>n.endsWith('.test.ts'));
 for(const name of names)await compile(join(dir,name));
 // Fixture is injected only into the disposable compiled test tree, never source or production APIs.
 const fixtureOut=join(out,'worker/src/gameSession.js');
 const production=await readFile(fixtureOut,'utf8');
 const fixture=production.replace('return complete(game,',`if (state.wordDeck?.name === 'TEST_MAGIC_FIXTURE') {
 const all=[...game.deck,...game.hands.flat()].filter(c=>!c.spell).sort((a,b)=>a.suit-b.suit||a.rank-b.rank);
 const a=[0,2,4,9,11,13],b=[1,3,5,10,12,14];game.hands=[a.map(i=>all[i]),b.map(i=>all[i])];game.deck=all.filter((_,i)=>!a.includes(i)&&!b.includes(i));
 game.trump=game.baseTrump=3;game.attacker=0;game.discard=game.deck.splice(0,2);
 for(const spell of ['mirror','chance','fate','ghost_thief','trick_gift','monkey_prank','magicians_hat']){const cards=game.magicPool.filter(c=>c.spell===spell);cards.forEach((c,i)=>game.hands[i].push(c));game.magicPool=game.magicPool.filter(c=>c.spell!==spell);}
 } return complete(game,`);
 await writeFile(fixtureOut,fixture);
 try{execFileSync(process.execPath,['--test',...names.map(n=>join(out,'server/test',n.replace(/\.ts$/,'.js')))],{stdio:'inherit',cwd:join(root,'server')});}
 catch(error){process.exitCode=error.status||1;}
 finally{await writeFile(fixtureOut,production);}
}
