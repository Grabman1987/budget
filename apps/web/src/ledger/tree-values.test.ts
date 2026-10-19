import type { PortfolioPositionsView, PositionAccount } from '@budget/db';
import { describe, expect, it } from 'vitest';
import { overviewModel } from './overview-model';
import { sumTreeValues, treePositionsQuery, treeValues } from './tree-values';
import type { AccountRow } from './types';

const row = (
  id: string,
  type: string,
  valueEurCents: number | null,
  extra: Partial<AccountRow> = {},
) =>
  ({
    id,
    type,
    valueEurCents,
    onBudget: type === 'checking',
    closedAt: null,
    sortOrder: 0,
    ...extra,
  }) as unknown as AccountRow;

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

// Seed example: depot cash -26,90 and positions 24,68 are -2,22 together; the Verrechnungskonto
// holds 118,45. Independent of the code: 11845 - 222 = 11623 is the net worth of the platform.
const settlement = row('cash', 'checking', 11845);
const depot = row('depot', 'brokerage', -222, { referenceAccountId: 'cash' });
const positions = view([held('depot', 2468)]);

describe('treeValues', () => {
  it('shows the Depotwert on the depot and adds its cash to the linked Verrechnungskonto', () => {
    const values = treeValues([depot, settlement], positions);
    expect(values.get('depot')).toEqual({
      cents: 2468,
      approx: false,
      sumCents: 2468,
      includedCashCents: null,
      cashCents: null,
    });
    // 118,45 - 26,90 = 91,55; together 24,68 + 91,55 = 116,23 = 118,45 - 2,22 (unchanged).
    expect(values.get('cash')).toEqual({
      cents: 9155,
      approx: false,
      sumCents: 9155,
      includedCashCents: -2690,
      cashCents: null,
    });
  });

  it('keeps the depot cash with the depot when it has no open Verrechnungskonto', () => {
    const cases: [AccountRow, AccountRow][] = [
      [row('depot', 'brokerage', -222), settlement],
      [row('depot', 'brokerage', -222, { referenceAccountId: 'gone' }), settlement],
      [depot, { ...settlement, closedAt: '2026-09-01' }],
    ];
    for (const [unlinked, cash] of cases) {
      const values = treeValues([unlinked, cash], positions);
      expect(values.get('depot')).toEqual({
        cents: 2468,
        approx: false,
        sumCents: -222,
        includedCashCents: null,
        cashCents: -2690,
      });
      expect(values.get('cash')?.cents).toBe(11845);
    }
  });

  it('collects the cash of several depots on one Verrechnungskonto', () => {
    const second = row('second', 'crypto', 500, { referenceAccountId: 'cash' });
    const values = treeValues(
      [depot, second, settlement],
      view([held('depot', 2468)], [held('second', 700)]),
    );
    // 118,45 - 26,90 (first depot) - 2,00 (second: 5,00 - 7,00) = 89,55.
    expect(values.get('cash')?.cents).toBe(8955);
    expect(values.get('second')?.cents).toBe(700);
  });

  it('adds up the positions of one depot across securities and ignores other accounts', () => {
    const values = treeValues(
      [depot, settlement],
      view([held('depot', 2000), held('other', 999_999)], [held('depot', 468)]),
    );
    expect(values.get('depot')?.cents).toBe(2468);
    expect(values.get('cash')?.cents).toBe(9155);
  });

  it('marks a partly priced or estimated depot with ≈ and keeps the known sum', () => {
    const partly = treeValues(
      [depot, settlement],
      view([held('depot', 2468)], [held('depot', null, 'missing_price')]),
    );
    expect(partly.get('depot')).toMatchObject({ cents: 2468, approx: true });
    const estimated = treeValues([depot, settlement], view([held('depot', 2468, 'estimated')]));
    expect(estimated.get('depot')).toMatchObject({ cents: 2468, approx: true });
  });

  it('marks a depot with a missing rate ≈ and leaves its sums and Verrechnungskonto unknown', () => {
    const noRate = row('depot', 'brokerage', null, { referenceAccountId: 'cash' });
    const values = treeValues(
      [noRate, settlement],
      view([held('depot', 2468)], [held('depot', null, 'missing_fx')]),
    );
    expect(values.get('depot')).toMatchObject({ cents: 2468, approx: true, sumCents: null });
    expect(values.get('cash')).toMatchObject({ cents: null, sumCents: null });
  });

  it('keeps the Verrechnungskonto known when no position of the depot has a price', () => {
    // Nothing is valued: the depot's 5,00 are all cash; 118,45 + 5,00 = 123,45 on the platform row.
    const cashOnly = row('depot', 'brokerage', 500, { referenceAccountId: 'cash' });
    const values = treeValues([cashOnly, settlement], view([held('depot', null, 'missing_price')]));
    expect(values.get('depot')).toEqual({
      cents: null,
      approx: true,
      sumCents: null,
      includedCashCents: null,
      cashCents: null,
    });
    expect(values.get('cash')).toMatchObject({
      cents: 12345,
      sumCents: 12345,
      includedCashCents: 500,
    });
  });

  it('without a Verrechnungskonto the unpriced depot keeps its cash line, its sums stay unknown', () => {
    const loose = row('depot', 'brokerage', 500);
    const values = treeValues([loose], view([held('depot', null, 'missing_price')]));
    expect(values.get('depot')).toMatchObject({
      cents: null,
      approx: true,
      sumCents: null,
      cashCents: 500,
    });
  });

  it('is unknown while the positions are not loaded, never cash plus positions', () => {
    const values = treeValues([depot, settlement, row('other', 'savings', 5)], undefined);
    expect(values.get('depot')?.cents).toBeNull();
    expect(values.get('cash')?.cents).toBeNull();
    expect(values.get('other')?.cents).toBe(5);
  });

  it('is 0 for a depot without positions', () => {
    const values = treeValues([row('d', 'brokerage', 0)], view());
    expect(values.get('d')).toMatchObject({ cents: 0, sumCents: 0, cashCents: null });
  });

  it('leaves a closed depot, other types and a missing rate on the shared EUR value', () => {
    const values = treeValues(
      [
        row('old', 'brokerage', 900, { closedAt: '2026-01-01', referenceAccountId: 'cash' }),
        settlement,
        row('p2p', 'p2p', 30000),
        row('miss', 'checking', null),
      ],
      positions,
    );
    expect(values.get('old')?.cents).toBe(900);
    expect(values.get('cash')?.cents).toBe(11845);
    expect(values.get('p2p')?.cents).toBe(30000);
    expect(values.get('miss')?.cents).toBeNull();
  });
});

describe('treePositionsQuery', () => {
  it('is cached for five minutes, not refetched on focus, and only asked with an open depot', () => {
    const query = treePositionsQuery([depot, settlement]);
    expect(query.staleTime).toBe(300_000);
    expect(query.refetchOnWindowFocus).toBe(false);
    expect(query.enabled).toBe(true);
    expect(query.queryKey).toEqual(['ledger', 'portfolio-positions']);
    expect(treePositionsQuery([settlement]).enabled).toBe(false);
    expect(treePositionsQuery([{ ...depot, closedAt: '2026-01-01' }]).enabled).toBe(false);
    expect(treePositionsQuery(undefined).enabled).toBe(false);
  });
});

describe('sumTreeValues', () => {
  const accounts = [{ id: 'a' }, { id: 'b' }];
  const value = (sumCents: number | null, approx = false) => ({
    cents: sumCents,
    approx,
    sumCents,
    includedCashCents: null,
    cashCents: null,
  });
  it('adds what the accounts contribute and carries ≈', () => {
    const values = new Map([
      ['a', value(2468, true)],
      ['b', value(-300)],
    ]);
    expect(sumTreeValues(accounts, values)).toEqual({ cents: 2168, approx: true });
  });
  it('is unknown when one figure is unknown, and 0 for an empty group', () => {
    const values = new Map([
      ['a', value(5)],
      ['b', value(null)],
    ]);
    expect(sumTreeValues(accounts, values)).toEqual({ cents: null, approx: false });
    expect(sumTreeValues([], new Map())).toEqual({ cents: 0, approx: false });
  });
});

describe('overviewModel with tree figures', () => {
  const accounts = [settlement, depot];
  it('regroups the platform without changing the net worth', () => {
    const model = overviewModel(accounts, treeValues(accounts, positions));
    expect(model.groups.map((g) => [g.group.id, g.sumCents])).toEqual([
      ['budget', 9155],
      ['investments', 2468],
    ]);
    // 118,45 + (-2,22) = 116,23 = 91,55 + 24,68.
    expect(model.netWorthCents).toBe(11623);
    expect(model.groups.reduce((sum, g) => sum + (g.sumCents ?? 0), 0)).toBe(11623);
  });
  it('keeps the depot cash in the Investments sum without a Verrechnungskonto', () => {
    const loose = [settlement, row('depot', 'brokerage', -222)];
    const model = overviewModel(loose, treeValues(loose, positions));
    expect(model.groups.map((g) => [g.group.id, g.sumCents])).toEqual([
      ['budget', 11845],
      ['investments', -222],
    ]);
  });
  it('marks a group sum with ≈ when a depot position has no price', () => {
    const partly = view([held('depot', 2468)], [held('depot', null, 'missing_price')]);
    const model = overviewModel(accounts, treeValues(accounts, partly));
    expect(model.groups.map((g) => [g.group.id, g.sumCents, g.sumApprox])).toEqual([
      ['budget', 9155, false],
      ['investments', 2468, true],
    ]);
  });
  it('without tree figures keeps the shared EUR value per account', () => {
    const model = overviewModel(accounts);
    expect(model.groups.map((g) => [g.group.id, g.sumCents])).toEqual([
      ['budget', 11845],
      ['investments', -222],
    ]);
  });
});
