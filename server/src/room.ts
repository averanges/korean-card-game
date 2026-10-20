import {WebSocket} from 'ws';
import {authenticate,joinRoom,publicRoom,randomSecret,RoomError,touch,type Policy,type StoredRoom} from '../../worker/src/model';
import {applyCommand,sessionSnapshot,sessionEvents} from '../../worker/src/gameSession';
import {parseRoomMessage,type Seat,type RoomEventType,type NetworkCommand,type CommandResult} from '../../src/rooms/protocol';
import type {DomainEvent} from '../../src/game-core/types';

interface Attachment {seat:Seat|null;id:string;deadline:number;window:number;count:number}
export class MemoryRoom {
  private queue:Promise<unknown>=Promise.resolve();
  private sockets=new Map<WebSocket,Attachment>();
  private receipts=new Map<string,CommandResult>();
  constructor(private state:StoredRoom,private ttl:Policy,private now=Date.now){}
  serial<T>(action:()=>Promise<T>|T):Promise<T>{const next=this.queue.then(action);this.queue=next.catch(()=>{});return next;}
  active(){if(this.state.expired||this.now()>=this.state.expiresAt){this.expire();throw new RoomError('room_expired',410);}return this.state;}
  async join(name:string,proof:string){return this.serial(async()=>{
    const old=this.active(),next=structuredClone(old),credential=await joinRoom(next,name,proof,this.now(),this.ttl);
    this.state=next;if(old.version!==next.version)this.broadcast('player_joined');return credential;
  });}
  async recover(secret:string){return this.serial(async()=>{const state=this.active(),seat=await authenticate(state,secret);if(seat===undefined)throw new RoomError('unauthorized',401);return {roomId:state.roomId,seat,recoverySecret:secret};});}
  // Check and reserve while holding the room queue, including the asynchronous upgrade callback.
  pending(){this.active();return [...this.sockets.values()].filter(a=>a.seat===null).length;}
  accept(ws:WebSocket){
    this.sockets.set(ws,{seat:null,id:randomSecret(),deadline:this.now()+10000,window:this.now(),count:0});
    ws.on('error',()=>{void this.disconnected(ws);});
    ws.on('close',()=>{void this.disconnected(ws);});
    ws.on('message',(bytes,binary)=>{
      const a=this.sockets.get(ws);if(!a||ws.readyState!==WebSocket.OPEN)return;
      const now=this.now();if(now-a.window>=10000){a.window=now;a.count=0;}if(++a.count>30){ws.close(1008,'rate_limit');return;}
      void this.serial(()=>this.message(ws,binary?null:bytes.toString())).catch(()=>{this.send(ws,{v:1,type:'error',code:'internal_error'});ws.close(1011,'connection_error');});
    });
  }
  private send(ws:WebSocket,value:unknown){if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>1024*1024){ws.close(1008,'slow_consumer');return;}ws.send(JSON.stringify(value));}
  private snapshot(ws:WebSocket,p:Seat,type:RoomEventType='room_snapshot',events:DomainEvent[]=[]){this.send(ws,{v:1,type,room:publicRoom(this.state),self:p,game:sessionSnapshot(this.state,p),events:sessionEvents(events,p,this.state)});}
  private broadcast(type:RoomEventType,events:DomainEvent[]=[]){for(const [ws,a]of this.sockets)if(a.seat!==null&&this.state.players[a.seat]?.connectionId===a.id)this.snapshot(ws,a.seat,type,events);}
  private async command(ws:WebSocket,p:Seat,c:NetworkCommand){
    const key=`${p}:${c.requestId}`,previous=this.receipts.get(key);
    if(previous){this.send(ws,{v:1,type:'command_result',...previous});this.snapshot(ws,p);return;}
    // Never evict an accepted receipt: an old packet must not become a fresh command.
    if(this.receipts.size>=10000){this.send(ws,{v:1,type:'command_result',requestId:c.requestId,ok:false,revision:this.state.gameRevision??0,code:'room_capacity'});return;}
    const next=applyCommand(this.state,p,c);
    if(!next.result.ok){this.send(ws,{v:1,type:'command_result',...next.result});this.snapshot(ws,p);return;}
    const stored=next.state!;touch(stored,this.now(),this.ttl);
    // No await between these two writes: atomic for this single-process in-memory adapter.
    this.state=stored;this.receipts.set(key,next.result);
    this.send(ws,{v:1,type:'command_result',...next.result});this.broadcast('room_snapshot',next.events);
  }
  private async message(ws:WebSocket,text:string|null){
    const a=this.sockets.get(ws);if(!a)return;
    const now=this.now();
    if(a.seat===null&&now>a.deadline){ws.close(4001,'authentication_timeout');return;}
    const invalid=()=>this.send(ws,{v:1,type:'error',code:'invalid_message'});
    if(text===null||Buffer.byteLength(text)>4096){invalid();return;}
    try{this.active();}catch{ws.close(4004,'room_unavailable');return;}
    if(text==='ping'){if(a.seat===null){this.send(ws,{v:1,type:'error',code:'unauthorized'});return;}if(this.state.players[a.seat]?.connectionId!==a.id){ws.close(4009,'connection_replaced');return;}ws.send('pong');return;}
    const message=parseRoomMessage(text);if(!message){invalid();return;}
    if(message.type==='authenticate'){
      if(a.seat!==null){invalid();return;}
      const seat=await authenticate(this.state,message.secret);
      if(seat===undefined){this.send(ws,{v:1,type:'error',code:'unauthorized'});ws.close(4001,'unauthorized');return;}
      const oldId=this.state.players[seat]!.connectionId;a.seat=seat;this.state.players[seat]!.connectionId=a.id;touch(this.state,now,this.ttl);
      for(const [old,b]of this.sockets)if(old!==ws&&b.id===oldId)old.close(4009,'connection_replaced');
      this.broadcast(publicRoom(this.state).status==='ready'?'room_ready':'player_reconnected');
    }else{
      if(a.seat===null){this.send(ws,{v:1,type:'error',code:'unauthorized'});return;}
      if(this.state.players[a.seat]?.connectionId!==a.id){ws.close(4009,'connection_replaced');return;}
      if(message.type==='command')await this.command(ws,a.seat,message.command);else this.snapshot(ws,a.seat);
    }
  }
  private disconnected(ws:WebSocket){return this.serial(()=>{const a=this.sockets.get(ws);this.sockets.delete(ws);if(!a||a.seat===null||this.state.expired||this.state.players[a.seat]?.connectionId!==a.id)return;this.state.players[a.seat]!.connectionId=null;touch(this.state,this.now(),this.ttl);this.broadcast('player_left');});}
  private expire(){if(this.state.expired)return;this.state.expired=true;this.state.version++;this.broadcast('room_snapshot');for(const ws of this.sockets.keys())ws.close(4004,'room_expired');this.state.seed='';this.state.players=[null,null];delete this.state.game;delete this.state.challenges;delete this.state.blind;delete this.state.recentQuestions;this.receipts.clear();}
  sweep(){return this.serial(()=>{const now=this.now();for(const [ws,a]of this.sockets)if(a.seat===null&&a.deadline<=now)ws.close(4001,'authentication_timeout');if(now>=this.state.expiresAt)this.expire();return this.state.expired&&now>=this.state.expiresAt+this.ttl.retentionMs;});}
  shutdown(){for(const ws of this.sockets.keys()){ws.close(1001,'server_shutdown');setTimeout(()=>ws.terminate(),500).unref();}this.receipts.clear();}
}
