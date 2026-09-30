import { describe, expect, it } from 'vitest';
import {
  buildCreate,
  splitChain,
  buildPatch,
  draftFromBooking,
  emptyDraft,
  needsAdvanceCategory,
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
          categoryId: 'auslagen',
          categoryName: 'Auslagen',
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
          { categoryId: 'auslagen', amountCents: -1000, memo: 'für K', contactId: 'k1' },
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

describe('split lines: category, contact share, transfer', () => {
  const two = (
    a: Partial<ReturnType<typeof newSplit>>,
    b: Partial<ReturnType<typeof newSplit>>,
  ) => [newSplit({ amount: '30', ...a }), newSplit({ amount: '20', ...b })];
  const options = { requireCategory: true, advanceCategoryId: 'auslagen' };

  it('books a contact share through the Auslagen category', () => {
    const built = buildCreate(
      draft({
        amount: '50',
        splitOn: true,
        splits: two({ categoryId: 'c1' }, { type: 'contact', contactId: 'anna' }),
      }),
      null,
      options,
    );
    expect(built).toMatchObject({
      ok: true,
      value: {
        splits: [
          { categoryId: 'c1', amountCents: -3000 },
          { categoryId: 'auslagen', amountCents: -2000, contactId: 'anna' },
        ],
      },
    });
  });

  it('a contact line needs the contact and an Auslagen category', () => {
    const lines = two({ categoryId: 'c1' }, { type: 'contact' });
    expect(
      buildCreate(draft({ amount: '50', splitOn: true, splits: lines }), null, options),
    ).toMatchObject({
      ok: false,
      errors: { splits: 'Bei einem Kontakt-Anteil fehlt der Kontakt.' },
    });
    const withContact = two({ categoryId: 'c1' }, { type: 'contact', contactId: 'anna' });
    expect(
      buildCreate(draft({ amount: '50', splitOn: true, splits: withContact }), null, {
        requireCategory: true,
      }),
    ).toMatchObject({
      ok: false,
      errors: { splits: expect.stringContaining('Auslagen-Kategorie') },
    });
  });

  it('a transfer line goes to another account and only on a spend', () => {
    const lines = two({ categoryId: 'c1' }, { type: 'transfer', toAccountId: 'a2' });
    expect(
      buildCreate(draft({ amount: '50', splitOn: true, splits: lines }), null, options),
    ).toMatchObject({
      ok: true,
      value: { splits: [{ amountCents: -3000 }, { amountCents: -2000, transferAccountId: 'a2' }] },
    });
    const same = two({ categoryId: 'c1' }, { type: 'transfer', toAccountId: 'a1' });
    expect(
      buildCreate(draft({ amount: '50', splitOn: true, splits: same }), null, options),
    ).toMatchObject({
      ok: false,
    });
    const income = draft({ kind: 'income', amount: '50', splitOn: true, splits: lines });
    expect(buildCreate(income, null, options)).toMatchObject({
      ok: false,
      errors: { splits: expect.stringContaining('nur bei einer Ausgabe') },
    });
  });

  it('an income split takes the income type of the draft for its category lines', () => {
    const built = buildCreate(
      draft({
        kind: 'income',
        amount: '50',
        incomeTypeId: 'gehalt',
        splitOn: true,
        splits: two({}, { type: 'contact', contactId: 'anna' }),
      }),
      null,
      options,
    );
    expect(built).toMatchObject({
      ok: true,
      value: {
        splits: [
          { categoryId: null, amountCents: 3000, incomeTypeId: 'gehalt' },
          { categoryId: 'auslagen', amountCents: 2000, contactId: 'anna' },
        ],
      },
    });
  });

  it('a single line with a contact share books Auslagen; editing keeps or clears it', () => {
    const single = buildCreate(draft({ amount: '12', contactId: 'anna' }), null, options);
    expect(single).toMatchObject({
      ok: true,
      value: { splits: [{ categoryId: 'auslagen', amountCents: -1200, contactId: 'anna' }] },
    });
    const shared = stored({
      splits: [{ ...stored().splits[0]!, categoryId: 'auslagen', contactId: 'anna' }],
    });
    expect(draftFromBooking(shared)).toMatchObject({ contactId: 'anna' });
    const cleared = buildPatch(
      shared,
      { ...draftFromBooking(shared), contactId: '', categoryId: 'c1' },
      'p1',
      false,
      options,
    );
    expect((cleared as { value: { splits: unknown[] } }).value.splits[0]).toEqual({
      categoryId: 'c1',
      amountCents: -2000,
    });
  });

  it('new transfer lines cannot be added to an existing booking; the chain adds up', () => {
    const original = stored();
    const lines = two({ categoryId: 'c1' }, { type: 'transfer', toAccountId: 'a2' });
    expect(
      buildPatch(
        original,
        { ...draftFromBooking(original), amount: '50', splitOn: true, splits: lines },
        'p1',
        false,
        options,
      ),
    ).toMatchObject({
      ok: false,
      errors: { splits: expect.stringContaining('nur beim Erfassen') },
    });
    expect(splitChain(draft({ amount: '50', splitOn: true, splits: two({}, {}) }))).toEqual({
      totalCents: 5000,
      distributedCents: 5000,
      restCents: 0,
    });
    expect(
      splitChain(draft({ amount: '50', splitOn: true, splits: [newSplit({ amount: '12,50' })] })),
    ).toMatchObject({
      restCents: 3750,
    });
  });
});

describe('needsAdvanceCategory', () => {
  it('is true for a single contact share and for a new contact line, false otherwise', () => {
    expect(needsAdvanceCategory(draft())).toBe(false);
    expect(needsAdvanceCategory(draft({ contactId: 'k1' }))).toBe(true);
    expect(needsAdvanceCategory(draft({ kind: 'transfer', contactId: 'k1' }))).toBe(false);
    const contactLine = newSplit({ type: 'contact', contactId: 'k1', amount: '5' });
    const categoryLine = newSplit({ categoryId: 'c1', amount: '15' });
    expect(needsAdvanceCategory(draft({ splitOn: true, splits: [categoryLine] }))).toBe(false);
    expect(
      needsAdvanceCategory(draft({ splitOn: true, splits: [categoryLine, contactLine] })),
    ).toBe(true);
    // An existing contact line keeps its category and needs nothing new.
    const kept = newSplit({ type: 'contact', contactId: 'k1', categoryId: 'adv', amount: '5' });
    expect(needsAdvanceCategory(draft({ splitOn: true, splits: [categoryLine, kept] }))).toBe(
      false,
    );
  });
});
