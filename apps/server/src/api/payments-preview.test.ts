import {
  createTestDatabase,
  createExpectedPayment,
  addExpectedVersion,
  linkOccurrence,
  createBooking,
  accounts,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AuthGate } from '../app';
import type { PaymentsPreview } from '@budget/domain';
const asOf = '2026-10-02';
const ctx = { actor: 'test' };
const webDir = mkdtempSync(join(tmpdir(), 'preview-api-'));
writeFileSync(join(webDir, 'index.html'), '<title>Budget</title>');
const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => asOf } });
});
afterEach(() => opened.close());
const create = (name = 'Vertrag', currency = 'EUR', amountMaxCents: number | null = null) =>
  createExpectedPayment(
    opened.db,
    { name, kind: 'outflow', rhythm: 'monthly', dueDay: 1 },
    { validFrom: '2026-11-01', amountCents: 10000, currency, amountMaxCents },
    ctx,
    asOf,
  );
const read = async () => {
  const response = await app.request('/api/expected/year-preview');
  expect(response.status).toBe(200);
  return (await response.json()) as PaymentsPreview;
};
const snapshot = () => ({
  occurrences: opened.db.select().from(schema.expectedOccurrence).all(),
  audit: opened.db.select().from(schema.auditLog).all(),
});

describe('authenticated read-only contract preview', () => {
  it('projects the full exact window without any materialised dates and never writes', async () => {
    const p = create();
    addExpectedVersion(
      opened.db,
      p.payment.id,
      { validFrom: '2027-01-01', amountCents: 12000 },
      ctx,
      asOf,
    );
    createExpectedPayment(
      opened.db,
      { name: 'Jährlich', kind: 'outflow', rhythm: 'yearly', dueDay: 1, dueMonth: 3 },
      { validFrom: '2026-01-01', amountCents: 30000 },
      ctx,
      asOf,
    );
    opened.db.delete(schema.expectedOccurrence).run(); // Synthetic absent worker horizon.
    const before = snapshot();
    const r = await read();
    expect(r).toMatchObject({ asOf, from: '2026-11-01', to: '2027-10-31', eurComplete: true });
    expect(r.currencies[0]!.total.baseCents).toBe(170000);
    expect(r.rows.flatMap((row) => row.events)).toHaveLength(13);
    expect(r.rows.flatMap((row) => row.events).every((e) => e.stored === null)).toBe(true);
    await read();
    expect(snapshot()).toEqual(before);
  });
  it('overlays exact stored identities once, retains status/link, and uses booking currency independently', async () => {
    accounts.create(
      opened.db,
      {
        id: 'account',
        name: 'Testkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-01-01',
      },
      ctx,
    );
    const p = create();
    const occurrence = opened.db
      .select()
      .from(schema.expectedOccurrence)
      .where(eq(schema.expectedOccurrence.dueDate, '2026-11-01'))
      .get()!;
    const bookingId = createBooking(
      opened.db,
      {
        accountId: 'account',
        date: '2026-11-01',
        amountCents: -10000,
        splits: [{ categoryId: null, amountCents: -10000 }],
      },
      ctx,
    );
    linkOccurrence(opened.db, occurrence.id, bookingId, ctx);
    addExpectedVersion(
      opened.db,
      p.payment.id,
      { validFrom: '2026-10-01', amountCents: 15000, currency: 'USD' },
      ctx,
      asOf,
    );
    // Later EUR version starts Nov; move it away to reproduce protected historical currency change.
    opened.db
      .update(schema.expectedPaymentVersion)
      .set({ deletedAt: '2026-10-02T00:00:00Z' })
      .where(eq(schema.expectedPaymentVersion.id, p.version.id))
      .run();
    const before = snapshot();
    const r = await read();
    expect(r.eurComplete).toBe(false);
    const usd = r.rows.find((row) => row.currency === 'USD')!;
    expect(usd.events).toHaveLength(12);
    expect(usd.total!.baseCents).toBe(180000);
    expect(usd.events[0]).toMatchObject({
      currency: 'USD',
      contract: { baseCents: 15000 },
      stored: {
        occurrenceId: occurrence.id,
        status: 'received',
        bookingId,
        storedExpectedCents: -10000,
        bookedCurrency: 'EUR',
        bookedAmountCents: -10000,
      },
    });
    expect(snapshot()).toEqual(before);
    opened.db
      .update(schema.booking)
      .set({ deletedAt: '2026-10-02T00:00:00Z' })
      .where(eq(schema.booking.id, bookingId))
      .run();
    const afterDelete = snapshot();
    expect((await read()).rows[0]!.events[0]!.stored).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
    expect(snapshot()).toEqual(afterDelete);
  });
  it('retains ranges and unknown contracts, excludes deleted payments/versions and inflows', async () => {
    const ranged = create('Bereich', 'EUR', 15000);
    const usd = create('Fremdwährung', 'USD');
    createExpectedPayment(
      opened.db,
      { name: 'Einnahme', kind: 'inflow', rhythm: 'monthly', dueDay: 1 },
      { validFrom: '2026-11-01', amountCents: 99999 },
      ctx,
      asOf,
    );
    const del = create('Gelöscht');
    opened.db
      .update(schema.expectedPayment)
      .set({ deletedAt: '2026-10-02T00:00:00Z' })
      .where(eq(schema.expectedPayment.id, del.payment.id))
      .run();
    const first = await read();
    expect(first.rows).toHaveLength(2);
    expect(first.currencies[0]!.total).toEqual({ baseCents: 120000, upperCents: 180000 });
    expect(first.currencies[1]!.total.baseCents).toBe(120000);
    expect(first.eurComplete).toBe(false);
    opened.db
      .update(schema.expectedPaymentVersion)
      .set({ deletedAt: '2026-10-02T00:00:00Z' })
      .where(eq(schema.expectedPaymentVersion.id, usd.version.id))
      .run();
    const unknown = await read();
    expect(unknown.unavailableCount).toBe(12);
    expect(unknown.rows.find((row) => row.paymentId === usd.payment.id)!.total).toBeNull();
    expect(unknown.rows.find((row) => row.paymentId === ranged.payment.id)!.total!.upperCents).toBe(
      180000,
    );
  });
  it('keeps an empty preview honest and requires authentication at the application boundary', async () => {
    expect((await read()).rows).toEqual([]);
    const denied = createApp({
      webDir,
      auth: { ...auth, requireSession: async (c) => c.json({ error: 'unauthorized' }, 401) },
      ledger: { db: opened.db, today: () => asOf },
    });
    expect((await denied.request('/api/expected/year-preview')).status).toBe(401);
  });
});
