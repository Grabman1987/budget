import { describe, expect, it } from 'vitest';
import type { BudgetMonthView } from '../budget/budget-api';
import {
  categoriesFor,
  defaultAccountId,
  orderAccounts,
  pickableCategories,
  pushRecent,
  quickDays,
} from './capture-model';
import type { AccountRow } from './types';

const account = (id: string, over: Partial<AccountRow> = {}) =>
  ({ id, name: id, onBudget: true, closedAt: null, ...over }) as AccountRow;

const view = {
  summary: {
    envelopes: [
      { categoryId: 'miete', availableCents: 12_300 },
      { categoryId: 'essen', availableCents: -450 },
      { categoryId: 'gehalt', availableCents: 0 },
      { categoryId: 'karte', availableCents: 0 },
      { categoryId: 'ausl', availableCents: 0 },
    ],
  },
  groups: [
    { id: 'g1', name: 'Fix', sortOrder: 1 },
    { id: 'g2', name: 'Alltag', sortOrder: 2 },
  ],
  categories: [
    {
      id: 'essen',
      name: 'Essen',
      groupId: 'g2',
      stage: 2,
      kind: 'variable',
      class: 'need',
      hiddenAt: null,
      sortOrder: 1,
    },
    {
      id: 'miete',
      name: 'Miete',
      groupId: 'g1',
      stage: 1,
      kind: 'fixed',
      class: 'need',
      hiddenAt: null,
      sortOrder: 1,
    },
    {
      id: 'gehalt',
      name: 'Gehalt',
      groupId: 'g1',
      stage: null,
      kind: 'income',
      class: null,
      hiddenAt: null,
      sortOrder: 2,
    },
    {
      id: 'karte',
      name: 'Karte',
      groupId: 'g1',
      stage: null,
      kind: 'card_payment',
      class: null,
      hiddenAt: null,
      sortOrder: 3,
    },
    {
      id: 'ausl',
      name: 'Auslagen',
      groupId: 'g1',
      stage: null,
      kind: 'advance',
      class: null,
      hiddenAt: null,
      sortOrder: 4,
    },
    {
      id: 'alt',
      name: 'Alt',
      groupId: 'g2',
      stage: 2,
      kind: 'variable',
      class: 'want',
      hiddenAt: '2026-01-01',
      sortOrder: 2,
    },
  ],
} as unknown as BudgetMonthView;

describe('pickableCategories', () => {
  const all = pickableCategories(view, undefined);
  it('orders by waterfall stage and leaves out card payments and Auslagen', () => {
    expect(all.map((c) => c.id)).toEqual(['miete', 'essen', 'alt', 'gehalt']);
    expect(all[0]).toMatchObject({ group: '1 Fixkosten & Mindestraten', availableCents: 12_300 });
    expect(all[3]).toMatchObject({ group: 'Einnahmen' });
  });
  it('spending never goes to an income category; hidden ones only while selected', () => {
    expect(categoriesFor(all, 'expense', '').map((c) => c.id)).toEqual(['miete', 'essen']);
    expect(categoriesFor(all, 'expense', 'alt').map((c) => c.id)).toContain('alt');
    expect(categoriesFor(all, 'income', '').map((c) => c.id)).toContain('gehalt');
  });
  it('falls back to the plain pick list while the budget loads', () => {
    const fallback = pickableCategories(undefined, {
      categories: [
        { id: 'x', name: 'X', groupId: 'g', class: 'need', kind: 'variable', sortOrder: 1 },
      ],
    } as never);
    expect(fallback).toEqual([expect.objectContaining({ id: 'x', availableCents: null })]);
  });
});

describe('accounts and recents', () => {
  const accounts = [
    account('a'),
    account('b'),
    account('c', { closedAt: '2026-01-01' }),
    account('d', { onBudget: false }),
  ];
  it('puts the accounts used last first and drops closed ones', () => {
    expect(orderAccounts(accounts, ['d', 'b']).map((a) => a.id)).toEqual(['d', 'b', 'a']);
  });
  it('starts on the account being looked at, else the last used budget account', () => {
    expect(defaultAccountId(accounts, ['d', 'b'], 'a')).toBe('a');
    expect(defaultAccountId(accounts, ['d', 'b'])).toBe('b');
    expect(defaultAccountId(accounts, [], 'c')).toBe('a');
    expect(defaultAccountId([], [])).toBe('');
  });
  it('keeps a short most-recent-first list without duplicates', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b', 'c'], 'z', 3)).toEqual(['z', 'a', 'b']);
  });
});

describe('quickDays', () => {
  it('offers today and the two days before', () => {
    const shift = (day: string, n: number) => `${day}${n}`;
    expect(quickDays('D', shift)).toEqual([
      ['Heute', 'D'],
      ['Gestern', 'D-1'],
      ['Vorgestern', 'D-2'],
    ]);
  });
});
