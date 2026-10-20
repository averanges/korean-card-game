import type {IncomingMessage} from 'node:http';
import {SECRET,record} from '../../src/rooms/protocol';
import {RoomError,displayName} from '../../worker/src/model';
import {validateDeck,type DeckSnapshot} from '../../src/decks';

// HTTP adapter only. Same wire schemas and limits as the Worker.
export async function input(req:IncomingMessage,kind:'create'|'join'|'recover'):Promise<{kind:'entry';name:string;joinKey:string;deck?:DeckSnapshot}|{kind:'recovery';secret:string}> {
  if(!req.headers['content-type']?.startsWith('application/json'))throw new RoomError('json_required',415);
  const limit=kind==='create'?128*1024:2048;
  const chunks:Buffer[]=[];let bytes=0;
  for await(const chunk of req.iterator({destroyOnReturn:false})){bytes+=chunk.length;if(bytes>limit){req.resume();throw new RoomError('body_too_large',413);}chunks.push(chunk);}
  let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RoomError('invalid_body');}
  if(!record(value))throw new RoomError('invalid_body');
  if(kind==='recover'){
    if(Object.keys(value).join(',')!=='secret'||typeof value.secret!=='string'||!SECRET.test(value.secret))throw new RoomError('invalid_body');
    return {kind:'recovery',secret:value.secret};
  }
  if(typeof value.joinKey!=='string'||!SECRET.test(value.joinKey))throw new RoomError('invalid_body');
  const hasDeck=Object.hasOwn(value,'deck');
  if(Object.keys(value).sort().join(',')!==(kind==='create'&&hasDeck?'deck,joinKey,name':'joinKey,name'))throw new RoomError('invalid_body');
  if(!hasDeck&&bytes>2048)throw new RoomError('body_too_large',413);
  let deck:DeckSnapshot|undefined;
  if(hasDeck){
    const d=value.deck;
    if(!record(d)||Object.keys(d).sort().join(',')!=='name,words'||!Array.isArray(d.words)||d.words.length>200||!d.words.every(w=>record(w)&&Object.keys(w).sort().join(',')==='ko,ru'))throw new RoomError('invalid_deck');
    try{deck=validateDeck(d);}catch{throw new RoomError('invalid_deck');}
  }
  return {kind:'entry',name:displayName(value.name),joinKey:value.joinKey,deck};
}
