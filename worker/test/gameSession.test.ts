import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,sessionSnapshot,sessionEvents} from '../src/gameSession';
import {createRoom,randomSecret,type StoredRoom} from '../src/model';
import {createOrdinaryGame,ordinaryTransition} from '../../src/game-core/ordinary';
import {parseRoomMessage,type OrdinaryCommand} from '../../src/rooms/protocol';
import type {Card,Game} from '../../src/engine';
const policy={waitingMs:4000,roomMs:24000,retentionMs:1000};
const card=(id:string,rank:number,suit=0):Card=>({id,rank,suit,word:{ko:id,ru:id}});
async function room():Promise<StoredRoom>{const {room}=await createRoom(randomSecret(),'A',randomSecret(),100,policy);room.gameMode='ordinary';room.players[0]!.connectionId='a';room.players[1]={name:'B',secretHash:'',joinHash:'',connectionId:'b'};return room;}
function game():Game {const g=createOrdinaryGame(()=>.4);g.attacker=0;g.trump=g.baseTrump=3;g.deck=[];g.hands=[[card('a',1),card('throw',1)],[card('b',2),card('other',0,1)]];g.table=[];return g;}
const command=(type:'start_game'|'end'|'take',revision=0):OrdinaryCommand=>({type,expectedRevision:revision,requestId:randomSecret()});
test('only connected host starts once; deal has 36 ordinary cards and no magic pool',async()=>{
 const r=await room();r.players[1]!.connectionId=null;
 assert.equal(applyCommand(r,0,command('start_game')).result.code,'players_not_ready');r.players[1]!.connectionId='b';
 assert.equal(applyCommand(r,1,command('start_game')).result.code,'host_only');
 const next=applyCommand(r,0,command('start_game'),()=>.4);assert.ok(next.result.ok);assert.equal(next.game!.deck.length,24);assert.deepEqual(next.game!.hands.map(h=>h.length),[6,6]);assert.deepEqual(next.game!.magicPool,[]);
 r.game=next.game;r.gameRevision=1;assert.equal(applyCommand(r,0,command('start_game',1)).result.code,'already_started');
});
test('ordinary attack/defense/throw-in, bad moves, take and discard use engine rules',async()=>{
 const r=await room();r.game=game();r.gameRevision=1;
 const attack:OrdinaryCommand={type:'attack',requestId:'attack',expectedRevision:1,cardRefs:['a']};
 assert.equal(applyCommand(r,1,attack).result.ok,false);
 assert.equal(applyCommand(r,0,{...attack,cardRefs:['b']}).result.ok,false);
 let next=applyCommand(r,0,attack);r.game=next.game;r.gameRevision=2;
 assert.equal(applyCommand(r,1,{type:'defend',requestId:'bad',expectedRevision:2,cardRef:'other',target:0}).result.ok,false);
 next=applyCommand(r,1,{type:'defend',requestId:'defend',expectedRevision:2,cardRef:'b',target:0});r.game=next.game;r.gameRevision=3;
 assert.equal(next.events[0].type,'card_defend');assert.ok(sessionSnapshot(r,0)!.allowed.end);
 next=applyCommand(r,0,{...attack,requestId:'throw',expectedRevision:3,cardRefs:['throw']});r.game=next.game;r.gameRevision=4;assert.equal(next.events[0].type,'card_throw_in');
 next=applyCommand(r,1,command('take',4));r.game=next.game;r.gameRevision=5;assert.ok(r.game!.taking);
 next=applyCommand(r,0,command('end',5));assert.equal(next.game!.attacker,0);assert.equal(next.game!.table.length,0);assert.ok(next.game!.hands[1].some(c=>c.id==='throw'));
 const original=game();const a=ordinaryTransition(original,{type:'attack',player:0,ids:['a']},()=>0).game;
 const d=ordinaryTransition(a,{type:'defend',player:1,id:'b',target:0},()=>0).game;
 const end=ordinaryTransition(d,{type:'end',player:0},()=>0).game;assert.equal(end.attacker,1);assert.equal(end.discard.length,2);
});
test('draw order, attack limit, revision rejection and terminal outcomes',async()=>{
 const r=await room();r.game=game();r.gameRevision=10;r.game.limit=1;
 assert.equal(applyCommand(r,0,{type:'attack',requestId:'limit',expectedRevision:10,cardRefs:['a','throw']}).result.ok,false);
 assert.equal(applyCommand(r,0,command('end',9)).result.code,'stale_revision');
 const g=game();g.hands=[[card('last-a',0)],[card('last-b',1)]];g.deck=[card('bottom',4),card('top',5)];
 let state=ordinaryTransition(g,{type:'attack',player:0,ids:['last-a']},()=>0).game;
 state=ordinaryTransition(state,{type:'defend',player:1,id:'last-b',target:0},()=>0).game;
 const settled=ordinaryTransition(state,{type:'end',player:0},()=>0);assert.equal(settled.game.hands[0][0].id,'top');assert.equal(settled.game.hands[0][1].id,'bottom');assert.equal(settled.game.winner?.winner,1);
 const privateDraw=sessionEvents(settled.events,1).find(e=>e.type==='cards_drawn');assert.equal(privateDraw?.cards,undefined);
 const final=game();final.hands=[[card('last-a',0)],[card('last-b',1)]];
 let result=ordinaryTransition(final,{type:'attack',player:0,ids:['last-a']},()=>0).game;
 result=ordinaryTransition(result,{type:'defend',player:1,id:'last-b',target:0},()=>0).game;
 result=ordinaryTransition(result,{type:'end',player:0},()=>0).game;assert.equal(result.winner?.winner,null);
 r.game=result;assert.equal(applyCommand(r,0,command('end',10)).result.code,'game_finished');
});
test('network protocol rejects magic, forged state/player, invalid revision and extra keys',()=>{
 for(const c of [{type:'magic'},{type:'begin_magic',magicRef:'x',correct:true},{type:'start_game',playerId:0},{type:'attack',cardRefs:['a'],state:{}},{type:'start_game',expectedRevision:-1}])assert.equal(parseRoomMessage(JSON.stringify({v:1,type:'command',command:{requestId:'id',expectedRevision:0,...c}})),undefined);
});
