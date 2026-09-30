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

describe('buildPatch keeps what the panel does not edit (review F1)', () => {
  const salary = stored({
    amountCents: 260000,
    splits: [
      {
        id: 's1',
        categoryId: null,
        categoryName: null,
        amountCents: 260000,
        memo: 'September',
        contactId: null,
        incomeTypeId: 'gehalt',
        transferId: null,
      },
    ],
  });

  it('an amount change keeps income type and split memo', () => {
    const edit = { ...draftFromBooking(salary), amount: '2.650,00' };
    const built = buildPatch(salary, edit, 'p1', false);
    expect(built).toMatchObject({
      ok: true,
      value: {
        amountCents: 265000,
        splits: [
          { categoryId: null, amountCents: 265000, memo: 'September', incomeTypeId: 'gehalt' },
        ],
      },
    });
  });

  it('a memo-only change on a single split with a memo does not touch the split', () => {
    const reconciled = { ...salary, status: 'reconciled' as const };
    const edit = { ...draftFromBooking(reconciled), memo: 'Gehalt September' };
    const built = buildPatch(reconciled, edit, 'p1', false);
    expect(built).toEqual({ ok: true, value: { memo: 'Gehalt September' } });
    expect(built.ok && touchesLocked(built.value)).toBe(false);
  });

  it('split mode keeps each line’s contact share and income type', () => {
    const shared = stored({
      amountCents: -3000,
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
        {
          id: 's2',
          categoryId: null,
          categoryName: null,
          amountCents: -1000,
          memo: 'für K',
          contactId: 'k1',
          incomeTypeId: null,
          transferId: null,
        },
      ],
    });
    const edit = draftFromBooking(shared);
    const first = edit.splits[0];
    if (first) first.categoryId = 'c2';
    const built = buildPatch(shared, edit, 'p1', false);
    expect(built).toMatchObject({
      ok: true,
      value: {
        splits: [
          { categoryId: 'c2', amountCents: -2000 },
          { amountCents: -1000, memo: 'für K', contactId: 'k1' },
        ],
      },
    });
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

describe('capture rules of a new booking', () => {
  it('needs a category for a spend but not for an income (Zu verteilen)', () => {
    expect(buildCreate(draft({ amount: '10' }), null, { requireCategory: true })).toMatchObject({
      ok: false,
      errors: { category: expect.any(String) },
    });
    const income = buildCreate(
      draft({ kind: 'income', amount: '10', incomeTypeId: 'gehalt' }),
      null,
    );
    expect(income).toMatchObject({
      ok: true,
      value: { splits: [{ categoryId: null, amountCents: 1000, incomeTypeId: 'gehalt' }] },
    });
  });
  it('asks for a category on a transfer to a tracking account only', () => {
    const transfer = draft({ kind: 'transfer', toAccountId: 'a2', amount: '10' });
    expect(
      buildCreate(transfer, null, { requireCategory: true, transferNeedsCategory: true }),
    ).toMatchObject({
      ok: false,
      errors: { category: expect.any(String) },
    });
    expect(buildCreate(transfer, null, { requireCategory: true })).toMatchObject({ ok: true });
  });
  it('carries the project and keeps editing free of the category rule', () => {
    const built = buildCreate(draft({ categoryId: 'c1', projectId: 'p9' }), null);
    expect(built).toMatchObject({ ok: true, value: { projectId: 'p9' } });
    const original = stored({
      splits: [{ ...stored().splits[0]!, categoryId: null, categoryName: null }],
    });
    expect(
      buildPatch(original, { ...draftFromBooking(original), memo: 'x' }, 'p1', false),
    ).toMatchObject({
      ok: true,
      value: { memo: 'x' },
    });
  });
  it('edits the income type of an income and leaves a spend alone', () => {
    const income = stored({
      amountCents: 5000,
      splits: [
        { ...stored().splits[0]!, categoryId: null, amountCents: 5000, incomeTypeId: 'gehalt' },
      ],
    });
    const changed = buildPatch(
      income,
      { ...draftFromBooking(income), incomeTypeId: 'sonder' },
      'p1',
      false,
    );
    expect(changed).toMatchObject({ ok: true, value: { splits: [{ incomeTypeId: 'sonder' }] } });
    const cleared = buildPatch(
      income,
      { ...draftFromBooking(income), incomeTypeId: '' },
      'p1',
      false,
    );
    expect(cleared).toMatchObject({ ok: true });
    expect((cleared as { value: { splits: unknown[] } }).value.splits[0]).not.toHaveProperty(
      'incomeTypeId',
    );
  });
});
