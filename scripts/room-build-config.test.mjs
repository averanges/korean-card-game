import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomBuildConfig,checkRoomBundle,oldRoomApi} from './room-build-config.mjs';
const render={VITE_ROOM_API_BASE:'https://korean-card-game.onrender.com',VITE_ROOM_HEALTHCHECK:'1'};
test('Pages fails closed when repository variables are missing',()=>{
  assert.throws(()=>roomBuildConfig({}),/VITE_ROOM_API_BASE/);
  assert.throws(()=>roomBuildConfig({...render,VITE_ROOM_HEALTHCHECK:''}),/VITE_ROOM_HEALTHCHECK/);
});
test('Render requires the healthcheck and public URLs cannot carry secrets',()=>{
  assert.throws(()=>roomBuildConfig({...render,VITE_ROOM_HEALTHCHECK:'0'}),/Render builds require/);
  assert.throws(()=>roomBuildConfig({...render,VITE_ROOM_API_BASE:'https://user:pass@example.com'}),/without credentials/);
});
test('A mixed or wrong bundle cannot pass the Render gate',()=>{
  const config=roomBuildConfig(render);
  checkRoomBundle('const endpoint="'+config.apiBase+'";',config);
  assert.throws(()=>checkRoomBundle(oldRoomApi,config),/configured room API/);
  assert.throws(()=>checkRoomBundle(config.apiBase+';'+oldRoomApi,config),/old Cloudflare API/);
});
test('An explicit Cloudflare rollback is allowed',()=>{
  const config=roomBuildConfig({VITE_ROOM_API_BASE:oldRoomApi,VITE_ROOM_HEALTHCHECK:'0'});
  checkRoomBundle(oldRoomApi,config);
  assert.equal(config.backend,'custom');
});
