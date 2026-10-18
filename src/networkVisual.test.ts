import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement,type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MagicHand} from './MagicHand';
import {OrdinaryHand} from './OrdinaryHand';
import {BlindHand} from './rooms/BlindHand';
import {NetworkMagicDialog} from './rooms/NetworkMagicDialog';
import {GameAnimationLayer,AnimationCard} from './GameAnimationLayer';
import {networkAnimations,networkEffects,magicNotices,challengeStage,visibleNetworkAnimations} from './rooms/networkPresentation';
import {createGame,type Card} from './engine';
import {ordinaryView} from './game-core/ordinary';
import type {GameSnapshot,PublicChallenge} from './rooms/protocol';
import type {PlayerEvent} from './game-core/types';
const card:Card={id:'own',suit:0,rank:2,word:{ko:'학교',ru:'школа'}};
const snapshot=():GameSnapshot=>ordinaryView(createGame(()=>.4),0,10);
const question:PublicChallenge={challengeId:'attempt',magicRef:'magic-own',magicKind:'mirror',phase:'question',quiz:{challengeId:'attempt',direction:'ko-ru',prompt:'학교',options:['школа','дом','парк','друг']}};
function render(element:ReactElement){const error=console.error;console.error=(message:unknown,...args:unknown[])=>{if(typeof message==='string'&&message.includes('useLayoutEffect does nothing on the server'))return;error(message,...args);};try{return renderToStaticMarkup(element);}finally{console.error=error;}}
test('actual shared magic artwork and owned hand render; public activation needs no hidden card',()=>{
 const html=render(createElement(MagicHand,{cards:[{...card,id:'magic-own',spell:'mirror'}],onOpen:()=>{},selectedId:'magic-own'}));assert.match(html,/spell-mirror/);assert.match(html,/magic-selected/);assert.match(html,/Зеркальный мир/);
 const peer=render(createElement(GameAnimationLayer,{network:true,simple:false,entries:[{type:'magic_activated',player:1,cards:[],magicId:'mirror',duration:2400,delay:0,id:'event',created:0,ends:2400}]}));assert.match(peer,/spell-mirror/);assert.ok(!peer.includes(card.word.ko));
 const failure={type:'magic_failed' as const,player:1 as const,cards:[],magicId:'mirror',duration:1200,delay:0,id:'failure',created:0,ends:1200};
 assert.match(render(createElement(GameAnimationLayer,{network:true,simple:false,suppressFailure:true,entries:[failure]})),/failed-magic/);
 assert.ok(!render(createElement(GameAnimationLayer,{network:true,simple:false,suppressFailure:true,entries:[{...failure,player:0}]})).includes('failed-magic'));
});
test('server question restores full modal; pending blocks input, cancel and check',()=>{
 const props={challenge:question,disabled:false,busy:false,simple:false,onCommand:()=>{}};
 const html=render(createElement(NetworkMagicDialog,props));assert.match(html,/magic-dialog/);assert.match(html,/effect-panel/);assert.match(html,/activation-card spell-mirror/);for(const text of question.quiz!.options)assert.ok(html.includes(text));assert.equal((html.match(/role="radio"/g)||[]).length,4);
 assert.equal(html,render(createElement(NetworkMagicDialog,props)));assert.ok(!html.includes('correctIndex'));
 const waiting=render(createElement(NetworkMagicDialog,{...props,disabled:true,busy:true}));assert.match(waiting,/Ожидаем подтверждения сервера/);assert.match(waiting,/spell-cancel" disabled/);
 assert.equal(render(createElement(NetworkMagicDialog,{...props,challenge:{...question,phase:'cancelled',quiz:undefined}})),'');
});
test('accepted outcome renders burn or success; no second question or target question is generated',()=>{
 for(const outcome of ['correct','wrong','unavailable'] as const){const html=render(createElement(NetworkMagicDialog,{challenge:{...question,phase:'resolved',outcome,quiz:undefined},disabled:false,busy:false,simple:false,onCommand:()=>{}}));assert.equal((html.match(/role="radio"/g)||[]).length,0);assert.match(html,outcome==='wrong'?/burning-card/:outcome==='unavailable'?/Карта сохранена/:/Магия активирована/);}
 const state=snapshot();state.challenge={...question,phase:'target',target:{kind:'trump',suits:[1,2,3]}};assert.equal(challengeStage(state),'trump');state.challenge.target={kind:'hat',cardRefs:[card.id]};assert.equal(challengeStage(state),'hat');
});
test('Ghost is a disabled visible owned card; Hat marks only permitted choices',()=>{
 const html=render(createElement(OrdinaryHand,{cards:[card],selected:[],translations:true,lockedIds:[card.id],onSelect:()=>{},onSpeak:()=>{}}));assert.match(html,/ghost-locked/);assert.match(html,/Карта заблокирована/);assert.match(html,/<button disabled="" title="Карта заблокирована"/);assert.ok(html.includes(card.word.ko));
 const eligible=render(createElement(OrdinaryHand,{cards:[card,{...card,id:'other'}],selected:[],translations:true,eligibleIds:[card.id],onSelect:()=>{},onSpeak:()=>{}}));assert.match(eligible,/hat-eligible/);assert.match(eligible,/hat-ineligible/);
});
test('blind artwork preserves server order and contains no face or fabricated normal card',()=>{
 const html=render(createElement(BlindHand,{cards:[{ref:'opaque-b',hidden:true},{ref:'opaque-a',hidden:true}],disabled:false,onChoose:()=>{}}));assert.equal((html.match(/monkey-card/g)||[]).length,2);assert.ok(!html.includes('korean'));assert.ok(!html.includes(card.word.ko));assert.ok(!html.includes('data-board-card'));
 const closed=render(createElement(AnimationCard,{}));assert.match(closed,/network-card-back/);assert.ok(!closed.includes('animation-word'));
});
test('projected effects and animation adapter remap both seats, keep private draws closed, update trump/deck',()=>{
 const before=snapshot(),after=snapshot();after.view.player=1;after.view.trump=3;after.view.deckCount=28;after.view.effects=[{id:'effect',kind:'mirror',duration:{type:'permanent'}},{id:'lock',kind:'ghost_thief',target:1,duration:{type:'rounds',remaining:1}}];
 const events:PlayerEvent[]=[{type:'magic_activated',player:0,count:1,magicId:'fate',trump:3},{type:'magic_activated',player:1,count:1,magicId:'chance'},{type:'cards_drawn',player:0,count:1}];
 const adapted=networkAnimations(before,after,events);assert.equal(adapted[0].player,1);assert.equal(adapted[0].previousTrump,before.view.trump);assert.equal(adapted[0].trump,3);assert.equal(adapted[1].nextDeck,28);assert.deepEqual(adapted[2].cards,[]);assert.equal(adapted[2].count,1);assert.equal(networkEffects(after)[1].target,0);
 const notices=magicNotices(events,1,'Соперник');assert.ok(notices.some(n=>n.includes('Козырь изменён')));assert.ok(!notices.join(' ').includes('effect'));
});
test('Hat output is private and stale/private flights are masked on blind hand or when no longer owned',()=>{
 const state=snapshot(),old={...card,id:'old'},secret={...card,id:'secret',word:{ko:'PRIVATE',ru:'private'}};
 const event:PlayerEvent={type:'magic_activated',player:1,count:1,magicId:'magicians_hat',exchange:{oldCard:old}};
 const adapted=networkAnimations(state,state,[event]);assert.equal(adapted[0].exchange!.newCard,undefined);
 const html=render(createElement(GameAnimationLayer,{network:true,simple:false,entries:adapted.map(e=>({...e,id:'e',created:0,ends:1000}))}));assert.ok(!html.includes('PRIVATE'));assert.match(html,/trick-card-back/);
 state.view.hand={blind:true,cards:[{ref:'opaque',hidden:true}]};const masked=visibleNetworkAnimations([{type:'cards_drawn',player:0,cards:[secret],delay:0,duration:320},{...adapted[0],player:0,exchange:{oldCard:old,newCard:secret}}],state);assert.deepEqual(masked[0].cards,[]);assert.equal(masked[1].exchange!.newCard,undefined);
});
