import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEuroCents} from '../money-input.mjs';

test('parses Austrian input exactly in cents',()=>{
  assert.equal(parseEuroCents('1.234,56 €'),123456);
  assert.equal(parseEuroCents('1234,56'),123456);
  assert.equal(parseEuroCents('1234.56'),123456);
  assert.equal(parseEuroCents('-0,01'),-1);
});

test('rejects ambiguous or over-precise money',()=>{
  for(const value of ['1,234','12.34,56','1e4','1.234.56',''])assert.throws(()=>parseEuroCents(value));
});
