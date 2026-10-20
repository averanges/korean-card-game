import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

export const oldRoomApi='https://hangul-durak-rooms.nick-belichenko.workers.dev';

// Only public Vite settings are recorded. Never serialize the environment.
export function roomBuildConfig(env){
  const value=env.VITE_ROOM_API_BASE;
  assert.ok(value,'VITE_ROOM_API_BASE is required for the Pages build; refusing an implicit backend fallback.');
  const url=new URL(value);
  assert.ok(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash,'Room API must be a public HTTP(S) URL without credentials or query parameters.');
  const healthcheck=env.VITE_ROOM_HEALTHCHECK;
  assert.ok(healthcheck==='0'||healthcheck==='1','VITE_ROOM_HEALTHCHECK must explicitly be 0 or 1.');
  const backend=url.hostname.endsWith('.onrender.com')?'render':'custom';
  if(backend==='render')assert.equal(healthcheck,'1','Render builds require VITE_ROOM_HEALTHCHECK=1.');
  return {apiBase:value.replace(/\/$/,''),healthcheck,backend};
}

export function checkRoomBundle(source,config){
  assert.ok(source.includes(config.apiBase),'Production JS does not contain the configured room API.');
  if(config.backend==='render')assert.ok(!source.includes(oldRoomApi),'Render production JS still contains the old Cloudflare API; refusing publication.');
}

export async function readProductionJs(dir){
  const parts=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=join(dir,entry.name);
    if(entry.isDirectory())parts.push(await readProductionJs(file));
    else if(entry.name.endsWith('.js'))parts.push(await readFile(file,'utf8'));
  }
  return parts.join('\n');
}
