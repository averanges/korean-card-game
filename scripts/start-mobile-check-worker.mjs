import {Miniflare,convertV4MiniflareOptions} from '../worker/node_modules/miniflare/dist/src/index.js';
import {runtimeModules} from '../worker/.wrangler/test-build/worker/test/runtime.js';
import {resolve} from 'node:path';
const root=process.cwd();process.chdir('worker');const modules=await runtimeModules();process.chdir(root);
const options=convertV4MiniflareOptions({name:'mobile-real-check',modules,modulesRoot:root,compatibilityDate:'2026-10-01',host:'127.0.0.1',port:8787,durableObjects:{ROOMS:{className:'Room',useSQLite:true}},cf:false,bindings:{NETWORK_GAME_MODE:'magic',FRONTEND_ORIGIN:'http://127.0.0.1:4176',ALLOWED_ORIGINS:'http://127.0.0.1:4176',WAITING_TTL_SECONDS:'14400',ROOM_TTL_SECONDS:'86400',EXPIRED_RETENTION_SECONDS:'3600'}});
const runtime=new Miniflare({...options,telemetry:{enabled:false},resourcePersistencePath:resolve('work/mobile-local-state')});console.log('Actual local Worker ready: '+await runtime.ready);
