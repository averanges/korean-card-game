import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobileHand} from './MobileHand';
import {MobileBattle} from './MobileBattle';
import {createGame} from './engine';
const noop=()=>{};
test('mobile blind preview carries only opaque references, no face, suit, translation or TTS control',()=>{
 const html=renderToStaticMarkup(h(MobileHand,{entries:[{id:'opaque'}],selected:['opaque'],translations:true,onSelect:noop,onClear:noop,onSpeak:noop}));
 assert.ok(html.includes('Атака вслепую'));assert.ok(!html.includes('ux-card-word'));assert.ok(!html.includes('Озвучить выбранную'));assert.ok(!html.includes('data-card-id'));assert.ok(!html.includes('ux-red'));assert.ok(!html.includes('ux-corner'));
});
test('mobile target highlight comes exclusively from supplied allowed targets; covered pairs keep separate hit areas',()=>{
 const cards=createGame(()=>.4).hands[0];const html=renderToStaticMarkup(h(MobileBattle,{pairs:[{attack:cards[0],defense:cards[1]},{attack:cards[2]}],face:c=>h('span',{},c.word.ko),allowed:[1],selectedTarget:1,onTarget:noop,translations:false}));
 assert.equal((html.match(/mobile-pair-hit/g)||[]).length,2);assert.equal((html.match(/can-block/g)||[]).length,1);assert.ok(html.includes('Защитить атаку 2'));assert.ok(html.includes('Цель выбрана'));
});
