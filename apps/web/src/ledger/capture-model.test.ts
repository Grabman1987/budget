import { describe, expect, it } from 'vitest';
import type { BudgetMonthView } from '../budget/budget-api';
import {
  captureDirty,
  accountFromPayee,
  categoriesFor,
  categoryFromPayee,
  defaultAccountId,
  orderAccounts,
  pickableCategories,
  pushRecent,
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
  it('orders by category group and leaves out card payments and Auslagen', () => {
    // Group Fix (miete, gehalt), then Alltag (essen, alt); within a group by sort order.
    expect(all.map((c) => c.id)).toEqual(['miete', 'gehalt', 'essen', 'alt']);
    expect(all[0]).toMatchObject({ group: 'Fix', availableCents: 12_300 });
    expect(all[2]).toMatchObject({ group: 'Alltag', availableCents: -450 });
  });
  it('keeps the Auslagen for the booking filter', () => {
    const withAdvance = pickableCategories(view, undefined, { withAdvance: true });
    expect(withAdvance.map((c) => c.id)).toContain('ausl');
    expect(withAdvance.map((c) => c.id)).not.toContain('karte');
  });
  it('spending never goes to an income category; hidden ones are left out', () => {
    expect(categoriesFor(all, 'expense', '').map((c) => c.id)).toEqual(['miete', 'essen']);
    expect(categoriesFor(all, 'expense').map((c) => c.id)).not.toContain('alt');
    expect(categoriesFor(all, 'income', '').map((c) => c.id)).toContain('gehalt');
  });
  it('lists a hidden category only when asked to keep it (a line that already has it)', () => {
    expect(categoriesFor(all, 'expense', 'alt').map((c) => c.id)).toContain('alt');
    expect(categoriesFor(all, 'expense', ['alt', 'x']).map((c) => c.id)).toContain('alt');
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
  it('prefers the payee account, then the last live account, including tracking accounts', () => {
    expect(accountFromPayee(accounts, ['d', 'b'], 'a')).toBe('a');
    expect(accountFromPayee(accounts, ['d', 'b'], 'c')).toBe('d');
    expect(accountFromPayee(accounts, ['c', 'b'], undefined)).toBe('b');
    expect(accountFromPayee(accounts, [], undefined)).toBe('a');
    expect(accountFromPayee([], ['a'], 'a')).toBe('');
  });
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

describe('categoryFromPayee', () => {
  it('fills an empty category or the one the previous payee set, never a picked one', () => {
    expect(categoryFromPayee('', null, 'food')).toBe('food');
    expect(categoryFromPayee('food', 'food', 'bank')).toBe('bank');
    expect(categoryFromPayee('rent', 'food', 'bank')).toBeUndefined();
    expect(categoryFromPayee('rent', null, 'food')).toBeUndefined();
    expect(categoryFromPayee('', null, null)).toBeUndefined();
  });
});

describe('captureDirty', () => {
  const blank = { amount: '', payee: '', memo: '', splitOn: false };
  it('counts typed input, but not the payee kept by "Speichern und neu"', () => {
    expect(captureDirty(blank, '')).toBe(false);
    expect(captureDirty({ ...blank, payee: 'Markt' }, '')).toBe(true);
    expect(captureDirty({ ...blank, payee: 'Markt' }, 'Markt')).toBe(false);
    expect(captureDirty({ ...blank, payee: 'Markt', amount: '5' }, 'Markt')).toBe(true);
    expect(captureDirty({ ...blank, payee: 'Bäcker' }, 'Markt')).toBe(true);
  });
});
