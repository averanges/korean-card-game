import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import config from '../vite.config.mjs';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {roomBuildConfig,checkRoomBundle,readProductionJs} from './room-build-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
const expectedRooms=process.env.DEPLOY_TARGET==='github-pages'?roomBuildConfig(process.env):undefined;
let resolvedRooms;

// Same two build steps on Windows and Linux; no shell-specific commands or paths.
execFileSync(process.execPath, [tsc, '--noEmit'], { cwd: root, stdio: 'inherit' });
// Load the plain ESM config directly, including in restricted managed workspaces.
await build({ ...config, root, configFile: false, plugins:[...(config.plugins||[]),{
  name:'verify-pages-room-config',
  configResolved(resolved){
    if(expectedRooms){
      resolvedRooms=roomBuildConfig(resolved.env);
      if(JSON.stringify(resolvedRooms)!==JSON.stringify(expectedRooms))throw Error('Resolved Vite room configuration differs from the supplied Pages build environment.');
    }
  },
}] });
if(resolvedRooms){
  checkRoomBundle(await readProductionJs(fileURLToPath(new URL('../dist/assets',import.meta.url))),resolvedRooms);
  console.log('Verified Pages room configuration:',JSON.stringify(resolvedRooms));
}

// Public provenance only: no environment dump, local paths or credentials.
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const base=config.base;
if(process.env.DEPLOY_TARGET==='github-pages'){
  // GitHub Pages serves this body with HTTP 404 on direct SPA paths. All asset
  // URLs are base-prefixed, so the app can read the original path without a redirect.
  await writeFile(new URL('../dist/404.html',import.meta.url),html);
  await writeFile(new URL('../dist/.nojekyll',import.meta.url),'');
}
const entry=html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
const css=html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1];
if(!entry||!css)throw Error('Production entry/CSS missing');
const git=(...args)=>{try{return execFileSync('git',['-c',`safe.directory=${root.replace(/\\/g,'/').replace(/\/$/,'')}`,...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return undefined;}};
const branch=(process.env.BRANCH||process.env.GITHUB_REF_NAME||git('branch','--show-current')||'unknown').replace(/[^\w./-]/g,'').slice(0,100);
const commitCandidate=process.env.COMMIT_REF||process.env.GITHUB_SHA||git('rev-parse','HEAD')||'',commit=/^[a-f0-9]{7,40}$/i.test(commitCandidate)?commitCandidate:'unknown';
const asset=async path=>{if(!path.startsWith(base))throw Error('Asset is outside hosting base');const file=new URL('../dist/'+path.slice(base.length),import.meta.url),body=await readFile(file);return {path,bytes:(await stat(file)).size,sha256:createHash('sha256').update(body).digest('hex')};};
const resources=await Promise.all([entry,css,base+'assets/table.webp'].map(asset));
const gitStatus=git('status','--porcelain');
const metadata={version:1,buildId:createHash('sha256').update(html+commit).digest('hex').slice(0,16),branch,commit,base,source:process.env.GITHUB_ACTIONS==='true'?'github-actions':process.env.NETLIFY==='true'?'netlify':'git',dirty:gitStatus===undefined?null:!!gitStatus,builtAt:new Date().toISOString(),entry,css,resources,...(resolvedRooms?{rooms:resolvedRooms}:{})};
await writeFile(new URL('../dist/build-info.json',import.meta.url),JSON.stringify(metadata,null,2)+'\n');
