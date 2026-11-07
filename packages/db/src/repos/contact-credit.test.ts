import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { appSetting, contact } from '../schema';
import { withGroup } from './audit';
import { createBooking } from './bookings';
import { contactCreditRecords, saveContactCreditRecord } from './contact-credit';
import { assertContactSettlementInvariants } from './contact-invariants';
import { listContactStatements } from './contacts';
import { previewContactRepayments } from './contact-repayment-preview';
import { runWithRequestMemo } from './request-memo';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => {
  vi.restoreAllMocks();
  opened.close();
});

it.each([
  '{invalid-json',
  'null',
  '[]',
  '{}',
  JSON.stringify({ bookingId: 'other' }),
  JSON.stringify({ bookingId: 'broken', decision: {} }),
  JSON.stringify({ bookingId: 'broken', repayments: [42] }),
  ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100'].map((amountCents) =>
    JSON.stringify({
      bookingId: 'broken',
      uses: [{ receiptSplitId: 'receipt', outlaySplitId: 'outlay', amountCents }],
    }),
  ),
  JSON.stringify({ bookingId: 'broken', refunds: [{ categoryId: '', amountCents: 100 }] }),
  JSON.stringify({ bookingId: 'broken', repaymentRefunds: 'invalid' }),
])(
  'reports and skips malformed credit without blocking an unrelated contact write (%s)',
  (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    opened.db.insert(appSetting).values({ id: 'contacts.credit.broken', value }).run();
    const id = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: -100,
        splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -100 }],
      },
      testCtx,
    );
    expect(id).toBeTruthy();
    expect(listContactStatements(opened.db, '2026-09-30')).toMatchObject([
      { id: 'k1', receivableCents: 100, creditCents: 0 },
    ]);
    expect(warn).toHaveBeenCalledWith('Skipping malformed contact credit record');
    expect(
      warn.mock.calls.every(
        (call) => call.length === 1 && call[0] === 'Skipping malformed contact credit record',
      ),
    ).toBe(true);
    expect(
      opened.db.select().from(appSetting).where(eq(appSetting.id, 'contacts.credit.broken')).get()
        ?.value,
    ).toBe(value);
  },
);

it('merges only validated stored provenance when saving a record', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  opened.db.insert(appSetting).values({ id: 'contacts.credit.example', value: '{invalid' }).run();
  saveContactCreditRecord(
    opened.db,
    { bookingId: 'example', uses: [], refunds: [] },
    withGroup(testCtx),
  );
  saveContactCreditRecord(
    opened.db,
    { bookingId: 'example', repayments: ['receipt'], repaymentRefunds: [] },
    withGroup(testCtx),
  );
  expect(contactCreditRecords(opened.db)).toEqual([
    { bookingId: 'example', uses: [], refunds: [], repayments: ['receipt'], repaymentRefunds: [] },
  ]);
});

it('reads the credit settings once across contacts in a statement list and invariant transaction', () => {
  opened.db.insert(contact).values({ id: 'k2', name: 'Beispielkontakt Zwei' }).run();
  for (const contactId of ['k1', 'k2'])
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-01',
        amountCents: -100,
        splits: [{ categoryId: 'auslagen', contactId, amountCents: -100 }],
      },
      testCtx,
    );
  const prepare = vi.spyOn(opened.sqlite, 'prepare');
  const reads = () =>
    prepare.mock.calls.filter(
      ([query]) => query.includes('app_setting') && query.includes(' like '),
    );
  expect(listContactStatements(opened.db, '2026-09-30')).toHaveLength(2);
  expect(reads()).toHaveLength(1);
  prepare.mockClear();
  opened.db.transaction((tx) => assertContactSettlementInvariants(tx));
  expect(reads()).toHaveLength(1);
  for (const contactId of ['k1', 'k2'])
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-02',
        amountCents: 100,
        splits: [{ categoryId: 'auslagen', contactId, amountCents: 100 }],
      },
      testCtx,
    );
  prepare.mockClear();
  expect(previewContactRepayments(opened.db)).toHaveLength(2);
  expect(reads()).toHaveLength(1);
});

it('memoizes request reads and sees writes and rollbacks without stale credit records', () => {
  runWithRequestMemo(() => {
    const prepare = vi.spyOn(opened.sqlite, 'prepare');
    expect(contactCreditRecords(opened.db)).toEqual([]);
    expect(contactCreditRecords(opened.db)).toEqual([]);
    expect(
      prepare.mock.calls.filter(
        ([query]) => query.includes('app_setting') && query.includes(' like '),
      ),
    ).toHaveLength(1);
    expect(() =>
      opened.db.transaction((tx) => {
        saveContactCreditRecord(tx, { bookingId: 'rolled-back', uses: [] }, withGroup(testCtx));
        expect(contactCreditRecords(tx)).toEqual([{ bookingId: 'rolled-back', uses: [] }]);
        throw new Error('Synthetic rollback');
      }),
    ).toThrow('Synthetic rollback');
    expect(contactCreditRecords(opened.db)).toEqual([]);
    saveContactCreditRecord(opened.db, { bookingId: 'committed', uses: [] }, withGroup(testCtx));
    expect(contactCreditRecords(opened.db)).toEqual([{ bookingId: 'committed', uses: [] }]);
  });
});
