import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY,esc,eur,num,pct,dt,mo,relDay,plural,glyph,axisMoney} from '../text-format.mjs';
import * as browser from '../src/format.js';
import {memo,clearMemos} from '../src/memo.js';

const nbsp=' ';

test('eur roles: tiles without cents, tables and inline with cents, missing values as EMPTY',()=>{
 assert.equal(eur(0),`€${nbsp}0,00`);
 assert.equal(eur(99999,{role:'table'}),`€${nbsp}999,99`);
 assert.equal(eur(100000,{role:'kpi'}),`€${nbsp}1.000`);
 assert.equal(eur(-478450,{role:'inline'}),`-€${nbsp}4.784,50`);
 assert.equal(eur(-478450,{role:'kpi'}),`-€${nbsp}4.785`);
 assert.equal(eur(250,{sign:'always'}),`+€${nbsp}2,50`);
 assert.equal(eur(-250,{sign:'never'}),`€${nbsp}2,50`);
 assert.equal(eur(null),EMPTY);assert.equal(eur(undefined),EMPTY);assert.equal(eur(NaN),EMPTY);
 assert.equal(axisMoney(144500),`€${nbsp}1.445`);
});

test('numbers, percentages and dates use Austrian conventions',()=>{
 assert.equal(num(1234.5,{decimals:1}),'1.234,5');
 assert.equal(pct(0.123),`12,3${nbsp}%`);assert.equal(pct(0.331,{decimals:1,sign:'always'}),`+33,1${nbsp}%`);assert.equal(pct(null),EMPTY);
 assert.equal(dt('2026-09-24'),'24.09.2026');assert.equal(dt('nope'),EMPTY);assert.equal(dt(null),EMPTY);
 assert.equal(mo('2026-09'),'September 2026');assert.equal(mo('2026-01-15'),'Jänner 2026');assert.equal(mo(''),EMPTY);
});

test('relative days read naturally and fall back to the date beyond two weeks',()=>{
 const today='2026-09-24';
 assert.equal(relDay('2026-09-24',today),'heute');
 assert.equal(relDay('2026-09-25',today),'morgen');
 assert.equal(relDay('2026-09-23',today),'gestern');
 assert.equal(relDay('2026-09-27',today),'in 3 Tagen');
 assert.equal(relDay('2026-09-19',today),'vor 5 Tagen');
 assert.equal(relDay('2026-10-20',today),'20.10.2026');
});

test('plural, escaping and glyph splitting',()=>{
 assert.equal(plural(1,'Konto','Konten'),'1 Konto');assert.equal(plural(14,'Konto','Konten'),'14 Konten');
 assert.equal(esc('<b>&"\''),'&lt;b&gt;&amp;&quot;&#39;');
 assert.equal(glyph('🔌 Strom - Energie AG'),'<span class="glyph">🔌</span>Strom - Energie AG');
 assert.equal(glyph('🍕🍻Essen gehen'),'<span class="glyph">🍕</span>🍻Essen gehen');
 assert.equal(glyph('Miete <x>'),'Miete &lt;x&gt;');
});

test('the browser entry re-exports the helpers and today()',()=>{
 assert.equal(typeof browser.today,'function');assert.match(browser.today(),/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(browser.eur(1),`€${nbsp}0,01`);assert.equal(browser.EMPTY,EMPTY);
});

test('memo caches per key until clearMemos() runs',()=>{
 let calls=0;const square=memo(n=>{calls++;return n*n;},n=>String(n));
 assert.equal(square(3),9);assert.equal(square(3),9);assert.equal(calls,1);
 assert.equal(square(4),16);assert.equal(calls,2);
 clearMemos();assert.equal(square(3),9);assert.equal(calls,3);
});
