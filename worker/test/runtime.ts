import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
export async function runtimeModules(injectStorageFailure=false,magicFixture=false) {
 const modules:{type:'ESModule';path:string;contents:string}[]=[],seen=new Set<string>();
 async function add(file:string):Promise<void> {
  file=resolve(file);if(seen.has(file))return;seen.add(file);
  let code=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  // Fault exists only in test-generated modules, after actual transactional writes.
  if(injectStorageFailure&&file===resolve('src/index.ts'))code=code.replace('await tx.setAlarm(',"if (c.requestId === 'fault-injection') throw Error('test storage failure'); await tx.setAlarm(");
  // Deterministic physical hands only inside the test runtime; no production API/debug command.
  if(magicFixture&&file===resolve('src/gameSession.ts'))code=code.replace('return complete(game,',`{
   const all=[...game.deck,...game.hands.flat()].filter(c=>!c.spell).sort((a,b)=>a.suit-b.suit||a.rank-b.rank);
   const a=[0,2,4,9,11,13],b=[1,3,5,10,12,14];game.hands=[a.map(i=>all[i]),b.map(i=>all[i])];game.deck=all.filter((_,i)=>!a.includes(i)&&!b.includes(i));
   game.trump=game.baseTrump=3;game.attacker=0;game.discard=game.deck.splice(0,2);
   for(const spell of ['mirror','chance','fate','ghost_thief','trick_gift','monkey_prank','magicians_hat']) {
    const cards=game.magicPool.filter(c=>c.spell===spell);cards.forEach((c,i)=>game.hands[i].push(c));game.magicPool=game.magicPool.filter(c=>c.spell!==spell);
   }
  } return complete(game,`);
  const imports=[...code.matchAll(/from\s*['"]([.][^'"]+)['"]/g)].map(m=>m[1]);
  code=code.replace(/from\s*['"]([.][^'"]+)['"]/g,(_,spec)=>`from '${spec}.js'`);
  modules.push({type:'ESModule',path:file.replace(/\.ts$/,'.js'),contents:code});
  for(const spec of imports)await add(resolve(dirname(file),spec+'.ts'));
 }
 await add(resolve('src/index.ts'));return modules;
}
