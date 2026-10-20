import {createServer,type ServerResponse,type IncomingMessage} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {createRoom,randomSecret,RoomError,type Policy} from '../../worker/src/model';
import {migrateRoom} from '../../worker/src/magicSession';
import {serverRandom} from '../../worker/src/gameSession';
import {ROOM_ID} from '../../src/rooms/protocol';
import {input} from './input';
import {MemoryRoom} from './room';

export interface Config {origins:string[];frontendUrl:string;mode:'ordinary'|'magic';ttl:Policy;maxRooms:number}
const defaultOrigins=['https://averanges.github.io','https://hangul-durak.netlify.app','https://korean-card-game-multiplayer.pages.dev','http://localhost:5173','http://127.0.0.1:5173'];
export function configFromEnv():Config {
  const origins=(process.env.ALLOWED_ORIGINS||defaultOrigins.join(',')).split(',').map(x=>x.trim()).filter(Boolean);
  for(const o of origins)if(new URL(o).origin!==o)throw Error('ALLOWED_ORIGINS must contain origins without paths');
  const frontendUrl=process.env.FRONTEND_URL||'https://averanges.github.io/korean-card-game';
  const u=new URL(frontendUrl);if(!origins.includes(u.origin)||u.search||u.hash||u.username||u.password)throw Error('Invalid FRONTEND_URL');
  return {origins,frontendUrl:frontendUrl.replace(/\/$/,''),mode:'magic',ttl:{waitingMs:14400000,roomMs:86400000,retentionMs:3600000},maxRooms:100};
}
export function createRoomsServer(config:Config=configFromEnv()) {
  const rooms=new Map<string,MemoryRoom>(),createdAt=Date.now(),instanceId=randomUUID();
  let createQueue:Promise<unknown>=Promise.resolve(),closing=false,windowAt=Date.now(),requests=0;
  function cors(req:IncomingMessage){const origin=req.headers.origin;return origin&&config.origins.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}:undefined;}
  function json(res:ServerResponse,value:unknown,status=200,headers:Record<string,string>={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
  const server=createServer((req,res)=>{void handle(req,res).catch(error=>{if(res.headersSent){res.destroy();return;}json(res,{error:error instanceof RoomError?error.code:'internal_error'},error instanceof RoomError?error.status:500,cors(req));});});
  // Bound slow HTTP clients and aggregate resource usage without trusting forwarded IP headers.
  server.requestTimeout=15000;server.headersTimeout=10000;
  async function handle(req:IncomingMessage,res:ServerResponse){
    const url=new URL(req.url!,'http://node.local'),headers=cors(req);
    if(url.search)throw new RoomError('invalid_body');
    if(req.method==='GET'&&url.pathname==='/health'){json(res,{ok:!closing,service:'hangul-durak-render-probe',version:1,mode:'rooms-memory',instanceId,uptimeSeconds:Math.floor((Date.now()-createdAt)/1000)},closing?503:200,{'Access-Control-Allow-Origin':'*'});return;}
    if(req.method==='GET'&&['/','/diagnostics.html','/diagnostics.js'].includes(url.pathname)){
      const name=url.pathname==='/diagnostics.js'?'diagnostics.js':'diagnostics.html';
      const bytes=await readFile(new URL('../../render-probe/public/'+name,import.meta.url));res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
    }
    if(!headers)throw new RoomError('origin_forbidden',403);
    if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
    if(closing)throw new RoomError('server_busy',503);
    if(Date.now()-windowAt>=10000){windowAt=Date.now();requests=0;}if(++requests>1000)throw new RoomError('rate_limit',429);
    if(req.method!=='POST')throw new RoomError('method_not_allowed',405);
    if(url.pathname==='/api/rooms'){
      const value=await input(req,'create');
      if(value.kind!=='entry')throw new RoomError('invalid_body');
      const next=createQueue.then(async()=>{
        if(rooms.size>=config.maxRooms)throw new RoomError('server_busy',503);
        const id=randomSecret(),result=await createRoom(id,value.name,value.joinKey,Date.now(),config.ttl);
        result.room.gameMode=config.mode;if(value.deck)result.room.wordDeck=structuredClone(value.deck);migrateRoom(result.room,serverRandom);
        rooms.set(id,new MemoryRoom(result.room,config.ttl));return {...result.credential,inviteUrl:`${config.frontendUrl}/room/${id}`};
      });createQueue=next.catch(()=>{});json(res,await next,201,headers);return;
    }
    const match=/^\/api\/rooms\/([^/]+)\/(join|recover)$/.exec(url.pathname);
    if(!match||!ROOM_ID.test(match[1]))throw new RoomError('not_found',404);
    const room=rooms.get(match[1]);if(!room)throw new RoomError('room_not_found',404);
    const value=await input(req,match[2] as 'join'|'recover');
    json(res,value.kind==='recovery'?await room.recover(value.secret):await room.join(value.name,value.joinKey),200,headers);
  }
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{socket.on('error',()=>socket.destroy());void upgrade().catch(error=>{if(!socket.destroyed){const status=error instanceof RoomError?error.status:500;socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);}});
    async function upgrade(){
      const url=new URL(req.url!,'http://node.local');if(url.search)throw new RoomError('invalid_body');
      if(closing||wss.clients.size>=1000)throw new RoomError('too_many_connections',429);
      if(url.pathname==='/ws'){
        wss.handleUpgrade(req,socket,head,ws=>{ws.on('error',()=>{});ws.send(JSON.stringify({type:'ready',version:1,instanceId}));let count=0;const timer=setTimeout(()=>ws.close(1000,'probe_complete'),120000);timer.unref();ws.on('close',()=>clearTimeout(timer));ws.on('message',(d,b)=>{let v;try{v=JSON.parse(d.toString());}catch{ws.close(1008,'invalid_message');return;}if(b||++count>50||!v||Object.keys(v).sort().join(',')!=='id,type'||v.type!=='ping'||!Number.isSafeInteger(v.id)){ws.close(1008,'invalid_message');return;}ws.send(JSON.stringify({type:'pong',id:v.id}));});});return;
      }
      if(!cors(req))throw new RoomError('origin_forbidden',403);
      const match=/^\/api\/rooms\/([^/]+)\/ws$/.exec(url.pathname);if(!match||!ROOM_ID.test(match[1]))throw new RoomError('not_found',404);
      const room=rooms.get(match[1]);if(!room)throw new RoomError('room_not_found',404);
      await room.serial(()=>{if(room.pending()>=4)throw new RoomError('too_many_connections',429);wss.handleUpgrade(req,socket,head,ws=>room.accept(ws));});
    }
  });
  const sweeper=setInterval(()=>{for(const[id,room]of rooms)void room.sweep().then(remove=>{if(remove)rooms.delete(id);}).catch(()=>{});},1000);sweeper.unref();
  return {server,async close(){closing=true;clearInterval(sweeper);for(const room of rooms.values())room.shutdown();for(const ws of wss.clients)ws.close(1001,'server_shutdown');const timer=setTimeout(()=>{for(const ws of wss.clients)ws.terminate();server.closeAllConnections();},1000);timer.unref();await new Promise<void>(resolve=>server.close(()=>resolve()));clearTimeout(timer);wss.close();rooms.clear();}};
}
