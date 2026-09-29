/* eslint-disable @typescript-eslint/no-explicit-any -- the prototype runs in an untyped sandbox */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { referenceModel } from './model';

/** Runs the real prototype generator (design/prototype/reports-core.js) in a sandbox. */
function loadPrototype(): Record<string, any> {
  const code = readFileSync(new URL('../../../../design/prototype/reports-core.js', import.meta.url), 'utf8');
  const win: Record<string, any> = {};
  vm.runInNewContext(code, { window: win, document: {}, Intl, Math });
  return win['RC'] as Record<string, any>;
}

const proto = loadPrototype();
const ref = referenceModel();

describe('reference model equals the prototype generator', () => {
  it('months and FX path', () => {
    expect(ref.months.map((m) => [m.k, m.y, m.m, m.key, m.label, m.partial])).toEqual(
      proto['MONTHS_ALL'].map((m: any) => [m.k, m.y, m.m, m.key, m.label, m.partial]),
    );
    expect(ref.fx).toEqual(proto['FX']);
  });

  it('spend per category and month', () => {
    expect(ref.spend).toEqual(proto['SPEND']);
  });

  it('income, side projects, plan, payroll and loan history', () => {
    expect(ref.income).toEqual(proto['INCOME']);
    expect(ref.proj).toEqual(proto['PROJ']);
    expect(ref.plan).toEqual(proto['PLAN']);
    expect(ref.payroll).toEqual(proto['PAYROLL']);
    expect(ref.loanh).toEqual(proto['LOANH']);
  });

  it('product paths, returns and the calibrated market path', () => {
    for (const id of Object.keys(proto['PV'])) {
      const a = ref.pv[id];
      const b = proto['PV'][id];
      expect(a?.v, id).toEqual(b.v);
      expect(a?.mkt, id).toEqual(b.mkt);
      expect(a?.contrib, id).toEqual(b.contrib);
      expect(a?.start, id).toBe(b.start);
    }
    expect(ref.ret).toEqual(proto['RET']);
    expect(ref.m).toEqual(proto['M']);
  });

  it('net worth series with its own contribution and market parts', () => {
    // The prototype hangs `start` on the arrays; compare the 36 month values.
    expect(ref.nw).toEqual(Array.from(proto['NW'] as number[]));
    expect(ref.own).toEqual(proto['OWN']);
    expect(ref.mkt).toEqual(proto['MKT']);
    expect(ref.inv).toEqual(Array.from(proto['INV'] as number[]));
    expect(ref.nwStart).toBe(proto['NW'].start);
  });

  it('50/30/20 allocation over any window', () => {
    for (const ks of [[34], [35], Array.from({ length: 12 }, (_, i) => 23 + i), [0, 1, 2]]) {
      expect(ref.alloc(ks)).toEqual(proto['alloc'](ks));
    }
  });
});
