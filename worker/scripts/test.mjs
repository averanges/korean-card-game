// Compile a disposable test tree, then use Node's test runner. No browser or Cloudflare login.
import ts from 'typescript';
import {readFileSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const worker=fileURLToPath(new URL('../',import.meta.url));
const out=join(worker,'.wrangler','test-build');
const files=[];
function collect(dir){for(const item of readdirSync(resolve(worker,dir),{withFileTypes:true})){const file=join(dir,item.name);if(item.isDirectory())collect(file);else if(/\.tsx?$/.test(file)&&!file.endsWith('.d.ts'))files.push(file);}}
collect('src');collect('test');collect('../src');
for(const file of files) {
 const target=resolve(out,'worker',file).replace(/\.tsx?$/,'.js');
 let source=ts.transpileModule(readFileSync(resolve(worker,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 source=source.replace(/(from\s*|import\s*)['"]([.][^'"]+)['"]/g,(_,prefix,spec)=>`${prefix}'${spec.endsWith('.js')?spec:spec+'.js'}'`);
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,source);
}
const tests=files.filter(x=>x.startsWith('test')&&x.endsWith('.test.ts')).map(x=>join(out,'worker',x.replace(/\.ts$/,'.js')));
try{execFileSync(process.execPath,['--test',...tests],{cwd:worker,stdio:'inherit'});}catch(error){process.exitCode=error.status||1;}
