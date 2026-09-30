import { describe, expect, it } from 'vitest';
import {
  buildCreate,
  buildPatch,
  draftFromBooking,
  emptyDraft,
  newSplit,
  splitRemainder,
  touchesLocked,
} from './booking-model';
import type { ListedBooking } from './types';

const stored = (over: Partial<ListedBooking> = {}): ListedBooking => ({
  id: 'b1',
  accountId: 'a1',
  accountName: 'Girokonto',
  date: '2026-09-10',
  amountCents: -2000,
  payeeId: 'p1',
  payeeName: 'Supermarkt',
  memo: null,
  status: 'confirmed',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  splits: [
    {
      id: 's1',
      categoryId: 'c1',
      categoryName: 'Lebensmittel',
      amountCents: -2000,
      memo: null,
      contactId: null,
      incomeTypeId: null,
      transferId: null,
    },
  ],
  balanceAfterCents: null,
  ...over,
});

const draft = (over = {}) => ({ ...emptyDraft('a1', '2026-09-10'), amount: '20,00', ...over });

describe('buildCreate', () => {
  it('signs an expense negative and carries the single category', () => {
    const built = buildCreate(draft({ categoryId: 'c1', payee: 'Supermarkt' }), 'p1');
    expect(built).toMatchObject({
      ok: true,
      value: {
        type: 'booking',
        amountCents: -2000,
        splits: [{ categoryId: 'c1', amountCents: -2000 }],
      },
    });
  });
  it('signs an income positive', () => {
    const built = buildCreate(draft({ kind: 'income' }), null);
    expect(built).toMatchObject({ ok: true, value: { amountCents: 2000 } });
  });
  it('builds a transfer with positive amount and both accounts', () => {
    const built = buildCreate(draft({ kind: 'transfer', toAccountId: 'a2' }), null);
    expect(built).toMatchObject({
      ok: true,
      value: { type: 'transfer', fromAccountId: 'a1', toAccountId: 'a2', amountCents: 2000 },
    });
  });
  it('rejects the same account on both sides and a missing amount', () => {
    expect(buildCreate(draft({ kind: 'transfer', toAccountId: 'a1' }), null)).toMatchObject({
      ok: false,
      errors: { toAccount: expect.any(String) },
    });
    expect(buildCreate(draft({ amount: '' }), null)).toMatchObject({
      ok: false,
      errors: { amount: expect.any(String) },
    });
  });
  it('splits must add up to the total', () => {
    const two = (a: string, b: string) => [
      newSplit({ categoryId: 'c1', amount: a }),
      newSplit({ categoryId: 'c2', amount: b }),
    ];
    expect(buildCreate(draft({ splitOn: true, splits: two('12,00', '7,00') }), null)).toMatchObject(
      {
        ok: false,
        errors: { splits: expect.any(String) },
      },
    );
    const ok = buildCreate(draft({ splitOn: true, splits: two('12,00', '8,00') }), null);
    expect(ok).toMatchObject({
      ok: true,
      value: {
        splits: [
          { categoryId: 'c1', amountCents: -1200 },
          { categoryId: 'c2', amountCents: -800 },
        ],
      },
    });
  });
  it('computes the remainder while splitting', () => {
    expect(splitRemainder('20,00', [newSplit({ amount: '12,50' })])).toBe(750);
    expect(splitRemainder('20,00', [newSplit({ amount: '25' })])).toBe(-500);
  });
});

describe('buildPatch', () => {
  it('sends only what changed', () => {
    const original = stored();
    const same = buildPatch(original, draftFromBooking(original), 'p1', false);
    expect(same).toEqual({ ok: true, value: {} });
    const changed = buildPatch(
      original,
      { ...draftFromBooking(original), memo: 'Wocheneinkauf', flag: 'red', categoryId: 'c2' },
      'p1',
      false,
    );
    expect(changed).toMatchObject({
      ok: true,
      value: {
        memo: 'Wocheneinkauf',
        flag: 'red',
        splits: [{ categoryId: 'c2', amountCents: -2000 }],
      },
    });
  });
  it('keeps the sign of a transfer leg and ignores its accounts', () => {
    const leg = stored({
      transferId: 't1',
      transferAccountId: 'a2',
      amountCents: -3000,
      payeeId: null,
      payeeName: null,
    });
    const built = buildPatch(leg, { ...draftFromBooking(leg), amount: '40,00' }, null, false);
    expect(built).toMatchObject({ ok: true, value: { amountCents: -4000 } });
  });
  it('adds the unlock flag and knows what a reconciled booking protects', () => {
    const built = buildPatch(
      stored(),
      { ...draftFromBooking(stored()), amount: '21,00' },
      'p1',
      true,
    );
    expect(built).toMatchObject({
      ok: true,
      value: { amountCents: -2100, unlockReconciled: true },
    });
    expect(touchesLocked({ memo: 'x', flag: null })).toBe(false);
    expect(touchesLocked({ amountCents: 5 })).toBe(true);
  });
});
