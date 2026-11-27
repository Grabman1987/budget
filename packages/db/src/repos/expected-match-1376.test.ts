import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { expectedOccurrence, inboxItem } from '../schema';
import { createBooking, createTransfer } from './bookings';
import {
  createExpectedPayment,
  linkOccurrence,
  matchOccurrences,
  unlinkOccurrence,
} from './expected';
import { LINK_PROPOSAL_REF } from './expected-auto-link';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const TODAY = '2026-03-30';

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const occurrences = (paymentId: string) =>
  db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, paymentId))
    .all();
const proposals = () =>
  db
    .select()
    .from(inboxItem)
    .all()
    .filter((i) => i.refType === LINK_PROPOSAL_REF);

describe('matching closes the window but keeps decisions open (#1376)', () => {
  it('(a) a past occurrence is missed, its open link proposal stays confirmable', () => {
    // Two equal payments and one booking: ambiguous, so a proposal opens and nothing is linked.
    const mk = (name: string) =>
      createExpectedPayment(
        db,
        {
          name,
          accountId: 'giro',
          payeeId: 'p1',
          categoryId: 'miete',
          dueDay: 10,
          startDate: '2026-03-01',
        },
        { validFrom: '2026-01-01', amountCents: 2_800 },
        ctx,
        TODAY,
      ).payment;
    const a = mk('Abo A');
    const b = mk('Abo B');
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-10',
        amountCents: -2_800,
        payeeId: 'p1',
        splits: [{ amountCents: -2_800, categoryId: 'miete' }],
      },
      ctx,
    );
    const summary = matchOccurrences(db, TODAY);
    expect(summary.proposed).toBeGreaterThan(0);
    const march = (id: string) => occurrences(id).find((o) => o.dueDate === '2026-03-10')!;
    const proposed = proposals().map((p) => p.refId);
    // A past date never stays an open bill; the proposal remains for the owner to confirm.
    for (const id of [a.id, b.id]) expect(march(id).status).toBe('missed');
    expect(proposed.length).toBeGreaterThan(0);
  });

  it('(b) proposes a recurring transfer against its transfer leg', () => {
    const p = createExpectedPayment(
      db,
      { name: 'Umbuchung Sparen', accountId: 'giro', dueDay: 10, startDate: '2026-03-01' },
      { validFrom: '2026-01-01', amountCents: 5_000 },
      ctx,
      TODAY,
    ).payment;
    createTransfer(
      db,
      { date: '2026-03-10', fromAccountId: 'giro', toAccountId: 'spar', amountCents: 5_000 },
      ctx,
    );
    const summary = matchOccurrences(db, TODAY);
    const march = occurrences(p.id).find((o) => o.dueDate === '2026-03-10')!;
    expect(summary.proposed + summary.received).toBeGreaterThan(0);
    expect(proposals().map((i) => i.refId)).toContain(march.id);
    // Past its window the date is missed; confirming the proposal links it.
    expect(march.status).toBe('missed');
  });

  it('(b) a plain booking never fits a payment without any counterparty', () => {
    const p = createExpectedPayment(
      db,
      { name: 'Umbuchung', accountId: 'giro', dueDay: 10, startDate: '2026-03-01' },
      { validFrom: '2026-01-01', amountCents: 5_000 },
      ctx,
      TODAY,
    ).payment;
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-10',
        amountCents: -5_000,
        splits: [{ amountCents: -5_000, categoryId: 'essen' }],
      },
      ctx,
    );
    matchOccurrences(db, TODAY);
    expect(proposals()).toEqual([]);
    expect(occurrences(p.id).find((o) => o.dueDate === '2026-03-10')!.bookingId).toBeNull();
  });

  it('(c) never sets missed for a due date ahead, in matching or when unlinking', () => {
    const p = createExpectedPayment(
      db,
      {
        name: 'Gehalt',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        categoryId: 'miete',
        dueDay: 15,
        startDate: '2026-03-01',
      },
      { validFrom: '2026-01-01', amountCents: 100_000 },
      ctx,
      TODAY,
    ).payment;
    matchOccurrences(db, TODAY);
    const future = occurrences(p.id).filter((o) => o.dueDate > TODAY);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((o) => o.status === 'expected')).toBe(true);

    // Linking a far booking by hand and unlinking it again must not leave the future date missed.
    const target = future[0]!;
    const bookingId = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-29',
        amountCents: 100_000,
        payeeId: 'p1',
        splits: [{ amountCents: 100_000, categoryId: 'miete' }],
      },
      ctx,
    );
    linkOccurrence(db, target.id, bookingId, ctx);
    unlinkOccurrence(db, target.id, ctx, TODAY);
    expect(
      db.select().from(expectedOccurrence).where(eq(expectedOccurrence.id, target.id)).get(),
    ).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
  });
});
