import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { createLedgerApi } from './index';

let opened: OpenedDatabase | undefined;
afterEach(() => opened?.close());

it('prepares only the source-filtered, dated response page while retaining full counts', async () => {
  opened = createTestDatabase();
  const accountId = randomUUID();
  opened.db
    .insert(schema.account)
    .values({
      id: accountId,
      name: 'Synthetic account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 0,
    })
    .run();
  const consentId = randomUUID();
  opened.db
    .insert(schema.bankSyncConsent)
    .values({
      id: consentId,
      initiator: 'synthetic',
      stateHash: randomUUID(),
      label: 'Synthetic bank',
      expiresAt: '2027-01-01T00:00:00Z',
      nextRunAt: '2027-01-01T00:00:00Z',
    })
    .run();
  const sources = [randomUUID(), randomUUID()];
  for (const sourceId of sources)
    opened.db
      .insert(schema.bankSyncAccount)
      .values({
        id: sourceId,
        consentId,
        secret: 'synthetic-unused',
        label: sourceId,
        currency: 'EUR',
        accountId,
      })
      .run();
  for (let index = 0; index < 160; index++) {
    const id = randomUUID();
    opened.db
      .insert(schema.bankSyncCandidate)
      .values({
        id,
        accountId,
        sourceId: sources[index % 2]!,
        dedupeKey: id,
        date: index < 158 ? '2026-10-18' : '2026-10-20',
        amountCents: -1201,
        currency: 'EUR',
        memo: `Synthetic ${index}`,
      })
      .run();
    opened.db
      .insert(schema.inboxItem)
      .values({
        id,
        kind: 'import',
        title: 'Bankumsatz prüfen',
        refType: 'bank-sync-candidate',
        refId: id,
        createdAt: `2026-10-20T${String(index % 24).padStart(2, '0')}:00:00Z`,
      })
      .run();
  }
  const app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-20',
    stepUp: async (_c, next) => next(),
  });
  const statements = vi.spyOn(opened.sqlite, 'prepare');
  const response = await app.request(
    `/inbox?bankSource=${sources[0]}&segment=umsaetze&fromDate=2026-10-20&limit=1`,
  );
  const statementCount = statements.mock.calls.length;
  statements.mockRestore();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.bankProgress).toEqual({ reviewed: 0, total: 80 });
  expect(body.totalEntries).toBe(1);
  expect(body.entries).toHaveLength(1);
  expect(body.entries[0].bankCandidate.suggestion).toEqual({
    label: 'Kategorie prüfen · Zu verteilen',
    needsReview: true,
  });
  // A page of one must not perform per-row preparation for the other 159 candidates.
  expect(statementCount).toBeLessThan(100);
});
