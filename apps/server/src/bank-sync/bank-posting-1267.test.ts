import { randomUUID } from 'node:crypto';
import { eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  accountBalances,
  createBooking,
  createTestDatabase,
  deleteBooking,
  holdWrites,
  releaseWrites,
  schema,
  undoAuditGroups,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { BankSync } from './service';

// Synthetic stored bank candidates only; recovery never reads a provider or its secrets.
let opened: OpenedDatabase;
let sync: BankSync;
const now = new Date('2026-11-01T12:00:00Z');
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  opened.db
    .insert(schema.bankSyncConsent)
    .values({
      id: 'consent',
      initiator: 'synthetic',
      stateHash: 'synthetic',
      expiresAt: now.toISOString(),
      label: 'Synthetic bank',
      nextRunAt: now.toISOString(),
    })
    .run();
  opened.db
    .insert(schema.bankSyncAccount)
    .values({
      id: 'source',
      consentId: 'consent',
      secret: 'not-used',
      label: 'Synthetic account',
      currency: 'EUR',
      accountId: 'giro',
    })
    .run();
  sync = new BankSync(opened.db, null as never, null as never, '', () => now);
});
afterEach(() => opened.close());

function candidate(amountCents: number, bankStatus: 'booked' | 'pending' = 'booked') {
  const id = randomUUID();
  opened.db
    .insert(schema.bankSyncCandidate)
    .values({
      id,
      accountId: 'giro',
      dedupeKey: id,
      bankStatus,
      date: '2026-10-30',
      amountCents,
      currency: 'EUR',
      memo: 'Synthetic bank text',
      rawPayee: 'Synthetic shop',
      sourceId: 'source',
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
    })
    .run();
  return id;
}
const balance = () =>
  accountBalances(opened.db, '2026-11-01').find((a) => a.accountId === 'giro')!.balanceCents;
const live = () =>
  opened.db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all();
const item = (id: string) =>
  opened.db.select().from(schema.inboxItem).where(eq(schema.inboxItem.id, id)).get()!;

it('previews without writes, posts literal cents once and restores the entire run with one Undo', () => {
  const first = candidate(-1201);
  const second = candidate(2302);
  const pending = candidate(-301, 'pending');
  const beforeAudit = opened.db.select().from(schema.auditLog).all();
  expect(balance()).toBe(100000);
  expect(sync.postExistingBooked()).toEqual({
    created: 2,
    linked: 0,
    resolved: 2,
    remaining: 0,
    groupId: '',
  });
  expect(balance()).toBe(100000);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(beforeAudit);
  const result = sync.postExistingBooked({ apply: true });
  expect(result).toMatchObject({ created: 2, linked: 0, resolved: 2, remaining: 0 });
  expect(balance()).toBe(101101);
  expect(live()).toHaveLength(2);
  expect(
    live().every((b) => b.status === 'pending' && b.source === 'bank' && !b.incomeNextMonth),
  ).toBe(true);
  expect(opened.db.select().from(schema.bookingSplit).all()).toMatchObject([
    { categoryId: null, incomeTypeId: null },
    { categoryId: null, incomeTypeId: null },
  ]);
  expect(item(pending).resolvedAt).toBeNull();
  expect(sync.postExistingBooked({ apply: true })).toMatchObject({
    created: 0,
    resolved: 0,
    groupId: '',
  });
  expect(balance()).toBe(101101);
  const audit = opened.db.select().from(schema.auditLog).all().slice(beforeAudit.length);
  expect(new Set(audit.map((a) => a.groupId))).toEqual(new Set([result.groupId]));
  expect(audit.every((a) => a.actor === 'operator')).toBe(true);
  undoAuditGroups(opened.db, [result.groupId], { actor: 'operator' });
  expect(balance()).toBe(100000);
  expect(live()).toHaveLength(0);
  expect(item(first).resolvedAt).toBeNull();
  expect(item(second).resolvedAt).toBeNull();
  // Recovery respects the same tombstones as an automatic fetch; it cannot recreate undone cash.
  expect(sync.postExistingBooked({ apply: true }).created).toBe(0);
  expect(balance()).toBe(100000);
});

it('links a unique four-day existing booking without changing cash or its classification', () => {
  const id = candidate(-1201);
  const existing = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-26',
      amountCents: -1201,
      status: 'confirmed',
      splits: [{ amountCents: -1201, categoryId: 'essen' }],
    },
    { actor: 'owner' },
  );
  expect(balance()).toBe(98799);
  const result = sync.postExistingBooked({ apply: true });
  expect(result).toMatchObject({ created: 0, linked: 1, resolved: 1 });
  expect(live()).toHaveLength(1);
  expect(live()[0]).toMatchObject({ id: existing, date: '2026-10-26', status: 'confirmed' });
  expect(item(id).resolvedAt).not.toBeNull();
  expect(balance()).toBe(98799);
});

it('keeps ambiguous matches, foreign currency, closed accounts and already dismissed rows untouched', () => {
  const ambiguous = candidate(-1201);
  for (let i = 0; i < 2; i++)
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-10-30',
        amountCents: -1201,
        splits: [{ amountCents: -1201 }],
      },
      { actor: 'owner' },
    );
  const foreign = candidate(-302);
  opened.db
    .update(schema.bankSyncCandidate)
    .set({ currency: 'USD' })
    .where(eq(schema.bankSyncCandidate.id, foreign))
    .run();
  const dismissed = candidate(-403);
  opened.db
    .update(schema.inboxItem)
    .set({ resolvedAt: now.toISOString() })
    .where(eq(schema.inboxItem.id, dismissed))
    .run();
  const result = sync.postExistingBooked({ apply: true });
  expect(result).toMatchObject({ created: 0, remaining: 1 });
  expect(result.groupId).not.toBe('');
  expect(item(ambiguous).resolvedAt).toBeNull();
  expect(item(foreign).resolvedAt).toBeNull();
  expect(item(ambiguous).detail).toContain('Mehrdeutige Zuordnung');
  undoAuditGroups(opened.db, [result.groupId], { actor: 'operator' });
  expect(item(ambiguous).detail).toBeNull();
  opened.db
    .update(schema.account)
    .set({ closedAt: '2026-11-01' })
    .where(eq(schema.account.id, 'giro'))
    .run();
  expect(sync.postExistingBooked({ apply: true })).toMatchObject({ created: 0, remaining: 0 });
});

it('bounds new bookings to 25 by default and rejects invalid limits, active fetches and held writes', () => {
  for (let i = 0; i < 26; i++) candidate(-1001 - i);
  expect(sync.postExistingBooked({ apply: true })).toMatchObject({ created: 25, remaining: 1 });
  expect(live()).toHaveLength(25);
  for (const maxBookings of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(() => sync.postExistingBooked({ maxBookings })).toThrow('positive safe integer');
  opened.db.update(schema.bankSyncConsent).set({ leaseUntil: '2026-11-01T12:01:00Z' }).run();
  expect(() => sync.postExistingBooked({ apply: true })).toThrow('Abruf läuft');
  opened.db.update(schema.bankSyncConsent).set({ leaseUntil: null }).run();
  holdWrites(opened.db);
  try {
    expect(() => sync.postExistingBooked({ apply: true })).toThrow('gesperrt');
  } finally {
    releaseWrites(opened.db);
  }
  expect(sync.postExistingBooked({ apply: true, maxBookings: 1 })).toMatchObject({
    created: 1,
    remaining: 0,
  });
});

it('does not recreate a deleted booking with an existing source identity', () => {
  const id = candidate(-1201);
  const existing = createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-10-30',
      amountCents: -1201,
      source: 'bank',
      importKey: 'bank-sync:' + id,
      splits: [{ amountCents: -1201 }],
    },
    { actor: 'owner' },
  );
  deleteBooking(opened.db, existing, { actor: 'owner' });
  expect(sync.postExistingBooked({ apply: true })).toMatchObject({ created: 0, resolved: 1 });
  expect(live()).toHaveLength(0);
  expect(balance()).toBe(100000);
});
