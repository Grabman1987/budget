import type { PortfolioPositionsView, PositionAccount } from '@budget/db';
import { describe, expect, it } from 'vitest';
import { sumTreeValues, treeValues } from './tree-values';
import type { AccountRow } from './types';

const row = (id: string, type: string, valueEurCents: number | null) =>
  ({ id, type, valueEurCents }) as unknown as AccountRow;

const held = (
  accountId: string,
  valueCents: number | null,
  valueStatus: PositionAccount['valueStatus'] = 'known',
) => ({ accountId, valueCents, valueStatus }) as PositionAccount;

const view = (...positions: PositionAccount[][]) =>
  ({
    asOf: '2026-10-18',
    positions: positions.map((accounts, i) => ({
      securityId: `s${i}`,
      name: `Wertpapier ${i}`,
      quote: null,
      accounts,
    })),
  }) as unknown as PortfolioPositionsView;

describe('treeValues', () => {
  // Own cash -26,90 plus positions 24,68 would be -2,22: the depot page shows 24,68, so does the tree.
  const depot = row('depot', 'brokerage', -222);
  const settlement = row('cash', 'checking', 11845);

  it('shows the Depotwert of a depot, not cash plus positions; the settlement account keeps its cash', () => {
    const values = treeValues([depot, settlement], view([held('depot', 2468)]));
    expect(values.get('depot')).toEqual({ cents: 2468, approx: false });
    expect(values.get('cash')).toEqual({ cents: 11845, approx: false });
  });

  it('adds up the positions of one depot across securities', () => {
    const values = treeValues(
      [depot],
      view([held('depot', 1000), held('other', 999_999)], [held('depot', 468)]),
    );
    expect(values.get('depot')).toEqual({ cents: 1468, approx: false });
  });

  it('marks a partly priced depot with ≈ and keeps the known sum', () => {
    const values = treeValues(
      [depot],
      view([held('depot', 2468)], [held('depot', null, 'missing_price')]),
    );
    expect(values.get('depot')).toEqual({ cents: 2468, approx: true });
  });

  it('marks an estimated (cost basis) position with ≈ like the depot page', () => {
    const values = treeValues([depot], view([held('depot', 500, 'estimated')]));
    expect(values.get('depot')).toEqual({ cents: 500, approx: true });
  });

  it('is unknown (no ≈) when no position has a value, as the depot page says "Unvollständig"', () => {
    const values = treeValues([depot], view([held('depot', null, 'missing_price')]));
    expect(values.get('depot')).toEqual({ cents: null, approx: false });
  });

  it('is 0 for a depot without positions and unknown while the positions are not loaded', () => {
    expect(treeValues([depot], view()).get('depot')).toEqual({ cents: 0, approx: false });
    expect(treeValues([depot], undefined).get('depot')).toEqual({ cents: null, approx: false });
  });

  it('treats a crypto account like a depot and leaves other types on the shared EUR value', () => {
    const values = treeValues(
      [row('coin', 'crypto', 7), row('p2p', 'p2p', 30000), row('miss', 'checking', null)],
      view([held('coin', 1234)]),
    );
    expect(values.get('coin')).toEqual({ cents: 1234, approx: false });
    expect(values.get('p2p')).toEqual({ cents: 30000, approx: false });
    expect(values.get('miss')).toEqual({ cents: null, approx: false });
  });
});

describe('sumTreeValues', () => {
  const accounts = [{ id: 'a' }, { id: 'b' }];
  it('adds the shown figures and carries ≈', () => {
    const values = new Map([
      ['a', { cents: 2468, approx: true }],
      ['b', { cents: -300, approx: false }],
    ]);
    expect(sumTreeValues(accounts, values)).toEqual({ cents: 2168, approx: true });
  });
  it('is unknown when one figure is unknown, and 0 for an empty group', () => {
    const values = new Map([
      ['a', { cents: 5, approx: false }],
      ['b', { cents: null, approx: false }],
    ]);
    expect(sumTreeValues(accounts, values)).toEqual({ cents: null, approx: false });
    expect(sumTreeValues([], new Map())).toEqual({ cents: 0, approx: false });
  });
});
