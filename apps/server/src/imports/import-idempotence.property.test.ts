import { createTestDatabase, importRun } from '@budget/db';
import { canonicalDump, checkProperty } from '@budget/domain/testing';
import type { TargetBooking, TargetModel } from '@budget/import-ynab';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { writeImport } from './commit';

/**
 * Randomized import idempotence (cockpit F8): writing the same synthetic target model a second time
 * (a "re-import" with the ids of the first run) must change nothing, whatever the model looks like.
 * Staging builds the target model, the commit writes it with `writeImport` (the dry run is the same
 * write rolled back), so the write is the unit under test.
 */
const ACCOUNT_IDS = ['acc-a', 'acc-b', 'acc-c'];
const CATEGORY_IDS = ['cat-1', 'cat-2'];
const MONTHS = ['2026-01', '2026-02'];
const PAYEES = ['Synthetic shop', 'Synthetic landlord', 'Synthetic employer'];

const bookingArb = (index: number): fc.Arbitrary<TargetBooking> =>
  fc
    .record({
      account: fc.constantFrom(...ACCOUNT_IDS),
      day: fc.integer({ min: 1, max: 59 }),
      sign: fc.constantFrom(1, -1),
      cents: fc.integer({ min: 1, max: 80_000 }),
      category: fc.constantFrom<string | null>(...CATEGORY_IDS, null),
      payee: fc.constantFrom(...PAYEES),
      status: fc.constantFrom('pending', 'confirmed', 'reconciled'),
      memo: fc.constantFrom('', 'synthetic memo'),
    })
    .map((b) => {
      const amountCents = b.sign * b.cents;
      const date = new Date(Date.UTC(2026, 0, b.day)).toISOString().slice(0, 10);
      return {
        id: `b${index}`,
        line: index + 1,
        accountId: b.account,
        date,
        payee: b.payee,
        systemPayee: null,
        contact: null,
        flag: '',
        status: b.status,
        memo: b.memo,
        amountCents,
        splits: [
          {
            payee: b.payee,
            amountCents,
            categoryId: b.sign === -1 ? b.category : null,
            memo: b.memo,
            transferId: null,
            transferAccountId: null,
            contact: null,
            project: null,
            incomeType: null,
            ruleId: null,
          },
        ],
        scheduled: false,
      } satisfies TargetBooking;
    });

const targetArb: fc.Arbitrary<TargetModel> = fc
  .record({
    accountCount: fc.integer({ min: 1, max: 3 }),
    openings: fc.array(fc.integer({ min: -20_000, max: 300_000 }), { minLength: 3, maxLength: 3 }),
    bookings: fc
      .integer({ min: 0, max: 8 })
      .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => bookingArb(i)))),
    assigned: fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 4, maxLength: 4 }),
  })
  .map(({ accountCount, openings, bookings, assigned }) => {
    const accountIds = ACCOUNT_IDS.slice(0, accountCount);
    return {
      startMonth: '2026-01',
      months: MONTHS,
      accounts: accountIds.map((id, i) => ({
        id,
        ynabName: `Synthetic ${id}`,
        name: `Synthetic ${id}`,
        type: 'checking' as const,
        onBudget: true,
        closedAt: null,
        openingDate: '2026-01-01',
        openingBalanceCents: openings[i] ?? 0,
        adjustments: [],
      })),
      categories: CATEGORY_IDS.map((id) => ({
        id,
        name: `Synthetic ${id}`,
        group: 'Synthetic group',
        kind: 'variable' as const,
        class: 'need' as const,
        hidden: false,
        cardAccountId: null,
        sources: [],
      })),
      bookings: bookings.filter((b) => accountIds.includes(b.accountId)),
      assigned: {
        '2026-01': { 'cat-1': assigned[0] ?? 0, 'cat-2': assigned[1] ?? 0 },
        '2026-02': { 'cat-1': assigned[2] ?? 0, 'cat-2': assigned[3] ?? 0 },
      },
      openingCarry: {},
      contacts: [],
      expectedPayments: [],
      targets: [],
      moved: [],
      shifts: [],
    } satisfies TargetModel;
  });

describe('property: import idempotence', () => {
  it('staging and committing the same synthetic import twice yields an identical canonical dump', () => {
    checkProperty(
      'import idempotence',
      fc.property(targetArb, (target) => {
        const opened = createTestDatabase();
        try {
          const { db, sqlite } = opened;
          const keys = new Map(target.bookings.map((b) => [b.id, `key-${b.id}`]));
          const write = (
            runId: string,
            previous: { accounts: Record<string, string>; categories: Record<string, string> },
          ) => {
            db.insert(importRun).values({ id: runId, source: 'ynab', status: 'staged' }).run();
            return writeImport(db, {
              runId,
              target,
              keys,
              previous,
              deleteMissing: false,
              actor: 'tester',
              today: '2026-02-28',
            });
          };
          const first = write('run-1', { accounts: {}, categories: {} });
          // The import run and audit rows record the run itself, not the imported data.
          const skip = ['audit_log', 'import_run'];
          const afterFirst = canonicalDump(sqlite, { skipTables: skip });
          const second = write('run-2', first.ids);
          expect(second.ids).toEqual(first.ids);
          expect(second.report.bookings.added, 'no booking is added again').toBe(0);
          expect(second.report.accounts.created + second.report.categories.created).toBe(0);
          expect(canonicalDump(sqlite, { skipTables: skip })).toEqual(afterFirst);
          expect(second.ledger).toEqual(first.ledger);
        } finally {
          opened.close();
        }
      }),
      30,
    );
  });
});
