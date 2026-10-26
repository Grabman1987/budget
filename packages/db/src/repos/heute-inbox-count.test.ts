import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { accountReconciliation } from '../schema';
import { createBooking } from './bookings';
import { heute } from './heute';
import { readInbox, readInboxCount } from './inbox';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  // This literal two-movement fixture has a recent account review, not an additional due task.
  opened.db
    .insert(accountReconciliation)
    .values({
      id: 'recent-giro',
      accountId: 'giro',
      date: '2026-09-17',
      statementBalanceCents: 100000,
      clearedBalanceCents: 100000,
    })
    .run();
});
afterEach(() => opened.close());

const TODAY = '2026-09-17';

it('Heute "zu prüfen" equals the Prüfen pill count while overspent envelopes keep their own row (#666)', () => {
  // Fixed ledger: two overspent envelopes (nothing assigned) plus two open Umsätze without category.
  for (const [categoryId, amountCents] of [
    ['essen', -100],
    ['miete', -2_345],
  ] as const)
    createBooking(
      opened.db,
      { accountId: 'giro', date: TODAY, amountCents, splits: [{ amountCents, categoryId }] },
      testCtx,
    );
  for (const amountCents of [-1_000, -2_000])
    createBooking(
      opened.db,
      { accountId: 'giro', date: TODAY, amountCents, splits: [{ amountCents }] },
      testCtx,
    );

  const today = heute(opened.db, { today: TODAY });
  const pill = readInboxCount(opened.db, TODAY, { excludeOverspent: true }).count;
  const overspent = today.nextSteps.items.filter((i) => i.kind === 'overspent');

  // The fixture really holds overspent envelopes (still listed in Heute › Zu tun), and the unfiltered queue counts them ...
  expect(overspent.map((i) => i.categoryId).sort()).toEqual(['essen', 'miete']);
  expect(readInbox(opened.db, TODAY).entries.some((e) => e.type === 'envelope')).toBe(true);
  expect(readInboxCount(opened.db, TODAY).count).toBe(4);
  // ... but the Prüfen pill and Heute's figure hold only the two Umsätze.
  expect(pill).toBe(2);
  expect(today.attention.inboxCount).toBe(pill);
});
