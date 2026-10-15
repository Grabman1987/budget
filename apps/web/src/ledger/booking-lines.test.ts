import { expect, it } from 'vitest';
import {
  buildCreate,
  buildPatch,
  draftFromBooking,
  emptyDraft,
  newSplit,
  expandBookingLines,
  type BookingDraft,
} from './booking-model';
import type { ListedBooking } from './types';

const draft = () => ({ ...emptyDraft('account-example', '2026-10-01'), amount: '100,01' });
const line = (amount = '100,01') => ({
  ...newSplit({ amount, categoryId: 'category-example' }),
  shares: [],
});
const expand = expandBookingLines;

it.each([
  [{ ...line('120,00'), shares: [] }, [{ categoryId: 'category-example', amountCents: -12000 }]],
  [
    { ...line('120,00'), type: 'contact' as const, categoryId: '', contactId: 'contact-example' },
    [{ categoryId: 'advance-example', contactId: 'contact-example', amountCents: -12000 }],
  ],
  [
    {
      ...line('120,00'),
      shares: [
        { ...newSplit({ contactId: 'contact-example', amount: '50' }), mode: 'percent' as const },
      ],
    },
    [
      { categoryId: 'category-example', amountCents: -6000 },
      { categoryId: 'advance-example', contactId: 'contact-example', amountCents: -6000 },
    ],
  ],
  [
    {
      ...line('120,00'),
      shares: [
        { ...newSplit({ contactId: 'contact-example', amount: '20' }), mode: 'amount' as const },
      ],
    },
    [
      { categoryId: 'category-example', amountCents: -10000 },
      { categoryId: 'advance-example', contactId: 'contact-example', amountCents: -2000 },
    ],
  ],
])('maps an independent category/outlay line to the existing payload', (entry, expected) => {
  expect(
    buildCreate({ ...draft(), amount: '120', lines: [entry] }, null, {
      requireCategory: true,
      advanceCategoryId: 'advance-example',
    }),
  ).toMatchObject({
    ok: true,
    value: { splits: expected },
  });
});

it('maps several gross categories with their own contact shares', () => {
  expect(
    buildCreate(
      {
        ...draft(),
        amount: '120',
        lines: [
          {
            ...line('100'),
            shares: [
              { ...newSplit({ contactId: 'contact-a', amount: '20' }), mode: 'amount' },
              { ...newSplit({ contactId: 'contact-b', amount: '10' }), mode: 'percent' },
            ],
          },
          { ...line('20'), categoryId: 'category-other' },
        ],
      },
      null,
      { requireCategory: true, advanceCategoryId: 'advance-example' },
    ),
  ).toMatchObject({
    ok: true,
    value: {
      amountCents: -12000,
      splits: [
        { categoryId: 'category-example', amountCents: -7000 },
        { categoryId: 'advance-example', contactId: 'contact-a', amountCents: -2000 },
        { categoryId: 'advance-example', contactId: 'contact-b', amountCents: -1000 },
        { categoryId: 'category-other', amountCents: -2000 },
      ],
    },
  });
});

it.each(['19,99', '20,01'])('rejects a nonzero rest for a gross line amount of %s', (amount) => {
  expect(
    buildCreate({ ...draft(), amount: '120', lines: [line('100'), line(amount)] }, null, {
      requireCategory: true,
    }),
  ).toMatchObject({ ok: false, errors: { splits: expect.any(String) } });
});

it('rejects a contact share without a contact', () => {
  expect(
    buildCreate(
      {
        ...draft(),
        lines: [{ ...line(), shares: [{ ...newSplit({ amount: '50' }), mode: 'percent' }] }],
      },
      null,
    ),
  ).toMatchObject({ ok: false, errors: { splits: expect.any(String) } });
});

it('maps a category and 33,33% contact share into exact existing split payloads', () => {
  const d: BookingDraft = {
    ...draft(),
    lines: [
      {
        ...line(),
        shares: [
          { ...newSplit({ contactId: 'contact-example' }), mode: 'percent', amount: '33,33' },
        ],
      },
    ],
  };
  expect(
    buildCreate(expand(d), null, { requireCategory: true, advanceCategoryId: 'advance-example' }),
  ).toMatchObject({
    ok: true,
    value: {
      amountCents: -10001,
      splits: [
        { categoryId: 'category-example', amountCents: -6668 },
        { categoryId: 'advance-example', contactId: 'contact-example', amountCents: -3333 },
      ],
    },
  });
});

it('keeps invalid sharing unsaveable even when the gross line sums match', () => {
  const d: BookingDraft = {
    ...draft(),
    lines: [
      {
        ...line(),
        shares: [{ ...newSplit({ contactId: 'contact-example' }), mode: 'amount', amount: '101' }],
      },
    ],
  };
  expect(buildCreate(expand(d), null)).toMatchObject({
    ok: false,
    errors: { splits: expect.any(String) },
  });
});

it('preserves split order, signed refunds and metadata on an edit round trip', () => {
  const b: ListedBooking = {
    id: 'booking-example',
    accountId: 'account-example',
    accountName: 'Konto Muster',
    date: '2026-10-01',
    amountCents: -10001,
    payeeId: null,
    payeeName: null,
    memo: null,
    status: 'reconciled',
    flag: null,
    transferId: null,
    transferAccountId: null,
    transferAccountName: null,
    projectId: null,
    currency: 'EUR',
    originalAmountCents: null,
    originalCurrency: null,
    balanceAfterCents: null,
    splits: [
      {
        id: 'split-a',
        categoryId: 'category-example',
        categoryName: 'Kategorie Muster',
        amountCents: -8001,
        memo: 'Muster A',
        contactId: null,
        incomeTypeId: 'type-example',
        transferId: null,
      },
      {
        id: 'split-b',
        categoryId: 'advance-example',
        categoryName: 'Auslagen',
        amountCents: -3000,
        memo: 'Muster B',
        contactId: 'contact-example',
        incomeTypeId: 'contact-type-example',
        transferId: null,
      },
      {
        id: 'split-c',
        categoryId: 'category-other',
        categoryName: 'Kategorie Beispiel',
        amountCents: 1000,
        memo: 'Muster C',
        contactId: null,
        incomeTypeId: null,
        transferId: null,
      },
    ],
  };
  const d = draftFromBooking(b);
  // Represent each retained row explicitly; grouping must never invent lost ledger metadata.
  const withLines = { ...d, lines: d.splits.map((s) => ({ ...s, shares: [] })) };
  expect(buildPatch(b, expand(withLines), null, false)).toEqual({ ok: true, value: {} });
});
