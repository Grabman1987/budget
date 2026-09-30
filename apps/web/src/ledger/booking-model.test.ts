import { describe, expect, it } from 'vitest';
import {
  amountOf,
  buildCreate,
  isTransferBooking,
  splitChain,
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

  it('a contact line needs the contact; the Auslagen category may still be missing', () => {
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
      ok: true,
      // No Auslagen category yet: the server creates it with this first share.
      value: { splits: [{ categoryId: 'c1' }, { categoryId: null, contactId: 'anna' }] },
    });
    expect(buildCreate(draft({ contactId: 'anna' }), null)).toMatchObject({ ok: true });
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

describe('a booking with a transfer line opens as what it is (F2)', () => {
  const transferLine = {
    id: 's2',
    categoryId: null,
    categoryName: null,
    amountCents: -2000,
    memo: null,
    contactId: null,
    incomeTypeId: null,
    transferId: 't1',
  };
  const mixed = () =>
    stored({
      amountCents: -5000,
      // The list query fills transferId from the split line.
      transferId: 't1',
      transferAccountId: 'a2',
      splits: [{ ...stored().splits[0]!, amountCents: -3000 }, transferLine],
    });

  it('30 € Essen + 20 € to savings is a split expense, not a 50 € transfer', () => {
    const d = draftFromBooking(mixed());
    expect(d).toMatchObject({ kind: 'expense', splitOn: true, amount: '50,00' });
    expect(d.splits.map((s) => [s.type, s.amount, s.toAccountId])).toEqual([
      ['category', '30,00', ''],
      ['transfer', '20,00', 'a2'],
    ]);
  });

  it('a whole-booking leg, and a booking whose only line is the transfer, are transfers', () => {
    expect(isTransferBooking(stored({ transferId: 't9', transferAccountId: 'a2' }))).toBe(true);
    const only = stored({
      transferId: 't1',
      splits: [{ ...transferLine, amountCents: -2000 }],
      amountCents: -2000,
    });
    expect(isTransferBooking(only)).toBe(true);
    expect(isTransferBooking(mixed())).toBe(false);
    expect(isTransferBooking(stored())).toBe(false);
  });

  it('a memo edit of the split booking patches the memo only and may change the payee', () => {
    const original = mixed();
    const edited = { ...draftFromBooking(original), memo: 'Sparen' };
    expect(buildPatch(original, edited, 'p1', false)).toMatchObject({
      ok: true,
      value: { memo: 'Sparen' },
    });
    expect(buildPatch(original, edited, 'p7', false)).toMatchObject({
      ok: true,
      value: { payeeId: 'p7' },
    });
  });
});

describe('split lines of mixed sign keep their own sign', () => {
  const refund = () =>
    stored({
      amountCents: -5000,
      splits: [
        { ...stored().splits[0]!, id: 's1', amountCents: -6000 },
        { ...stored().splits[0]!, id: 's2', categoryId: 'c2', amountCents: 1000 },
      ],
    });

  it('opens with −60 and a −10 refund line and builds the same lines back', () => {
    const d = draftFromBooking(refund());
    expect(d.splits.map((s) => s.amount)).toEqual(['60,00', '−10,00']);
    expect(splitRemainder(d.amount, d.splits)).toBe(0);
    const created = buildCreate({ ...d, categoryId: '' }, null);
    expect(created).toMatchObject({
      ok: true,
      value: { splits: [{ amountCents: -6000 }, { amountCents: 1000 }] },
    });
  });

  it('a memo-only edit passes and does not touch the lines', () => {
    const original = refund();
    const built = buildPatch(
      original,
      { ...draftFromBooking(original), memo: 'Retoure' },
      'p1',
      false,
    );
    expect(built).toEqual({ ok: true, value: { memo: 'Retoure' } });
  });

  it('a refund line is typed with a minus and counts against the total', () => {
    const lines = [newSplit({ amount: '60' }), newSplit({ amount: '-10' })];
    expect(splitRemainder('50', lines)).toBe(0);
    expect(splitChain(draft({ amount: '50', splits: lines }))).toMatchObject({
      distributedCents: 5000,
      restCents: 0,
    });
  });
});

describe('transfer lines and Auslagen on edit', () => {
  const tracking = { trackingAccountIds: new Set(['sparen']), requireCategory: true };
  const lines = (over: Partial<ReturnType<typeof newSplit>>) => [
    newSplit({ amount: '30', categoryId: 'c1' }),
    newSplit({ amount: '20', type: 'transfer', toAccountId: 'sparen', ...over }),
  ];

  it('a transfer line to a tracking account asks for a category, to a budget account it has none', () => {
    const d = (over = {}) => draft({ amount: '50', splitOn: true, splits: lines(over) });
    expect(buildCreate(d(), null, tracking)).toMatchObject({
      ok: false,
      errors: { splits: expect.stringContaining('Tracking-Konto') },
    });
    expect(buildCreate(d({ categoryId: 'invest' }), null, tracking)).toMatchObject({
      ok: true,
      value: { splits: [{}, { categoryId: 'invest', transferAccountId: 'sparen' }] },
    });
    // A category left over from before the switch is not sent to a budget account.
    const budgetTarget = d({ toAccountId: 'a2', categoryId: 'c9' });
    expect(buildCreate(budgetTarget, null, tracking)).toMatchObject({
      ok: true,
      value: { splits: [{}, { categoryId: null, transferAccountId: 'a2' }] },
    });
  });

  it('taking the contact off an Auslage needs a normal category and drops Auslagen', () => {
    const shared = stored({
      splits: [{ ...stored().splits[0]!, categoryId: 'auslagen', contactId: 'anna' }],
    });
    const open = draftFromBooking(shared);
    expect(open).toMatchObject({ contactId: 'anna', categoryId: '' });
    const cleared = { ...open, contactId: '' };
    expect(buildPatch(shared, cleared, 'p1', false)).toMatchObject({
      ok: false,
      errors: { category: expect.any(String) },
    });
    const ok = buildPatch(shared, { ...cleared, categoryId: 'c1' }, 'p1', false);
    expect(ok).toMatchObject({ ok: true, value: { splits: [{ categoryId: 'c1' }] } });
    expect(JSON.stringify(ok)).not.toContain('auslagen');
  });
});

describe('amountOf', () => {
  it('evaluates with the domain parser, without floats: 10+5 is 15', () => {
    expect(amountOf('10+5')).toBe(1500);
    expect(amountOf('1.234,56')).toBe(123_456);
    expect(amountOf('0,1+0,2')).toBe(30);
    expect(amountOf('abc')).toBeUndefined();
  });
});
