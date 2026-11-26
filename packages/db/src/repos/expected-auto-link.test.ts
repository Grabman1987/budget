import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, booking, expectedOccurrence, inboxItem, payee } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import {
  createExpectedPayment,
  linkOccurrence,
  matchOccurrences,
  unlinkOccurrence,
} from './expected';
import { LINK_PROPOSAL_REF } from './expected-auto-link';
import { heute } from './heute';
import { readInbox, resolveInboxItem } from './inbox';
import { forecastInputs, loadFacts } from './rule-inputs';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const TODAY = '2026-03-20';

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

const payment = (name: string, amountCents: number, over = {}) =>
  createExpectedPayment(
    db,
    {
      name,
      accountId: 'giro',
      payeeId: 'p1',
      categoryId: 'miete',
      dueDay: 22,
      startDate: '2026-03-01',
      ...over,
    },
    { validFrom: '2026-01-01', amountCents },
    ctx,
    TODAY,
  ).payment;

const debit = (date: string, amountCents: number) =>
  createBooking(
    db,
    {
      accountId: 'giro',
      date,
      amountCents,
      payeeId: 'p1',
      splits: [{ amountCents, categoryId: 'miete' }],
    },
    ctx,
  );

const march = (paymentId: string) =>
  db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, paymentId))
    .all()
    .find((o) => o.dueDate === '2026-03-22')!;
const proposals = () =>
  db
    .select()
    .from(inboxItem)
    .all()
    .filter((i) => i.refType === LINK_PROPOSAL_REF);
const openOutflowCents = () => heute(db, { today: TODAY, period: 'payday' }).lead.openCents;
const forecastDays = (label: string) =>
  forecastInputs(loadFacts(db, TODAY), TODAY, { byAccount: { giro: 100_000 } })
    .items.filter((i) => i.label === label)
    .map((i) => i.day);

describe('automatic link of recurring debits (#1102)', () => {
  it('links an unambiguous debit, marks it paid and undoes in one step', () => {
    const rent = payment('Miete', 40_000);
    const bookingId = debit('2026-03-20', -40_000);
    expect(openOutflowCents()).toBe(40_000);
    expect(forecastDays('Miete')).toContain('2026-03-22');

    const summary = matchOccurrences(db, TODAY);
    expect(summary).toMatchObject({ received: 1, proposed: 0 });
    expect(summary.links).toHaveLength(1);
    expect(march(rent.id)).toMatchObject({ status: 'received', bookingId });
    expect(proposals()).toEqual([]);

    // Heute "Frei bis Gehalt" and the liquidity forecast no longer count the paid occurrence.
    expect(openOutflowCents()).toBe(0);
    expect(forecastDays('Miete')).not.toContain('2026-03-22');
    expect(forecastDays('Miete')).toContain('2026-04-22');

    // Audited with its own group; one undo step reopens it.
    const { groupId } = summary.links[0]!;
    const entries = db.select().from(auditLog).where(eq(auditLog.groupId, groupId)).all();
    expect(entries.map((e) => e.entityType)).toEqual(['expected_occurrence']);
    undo(db, { groupId }, ctx);
    expect(march(rent.id)).toMatchObject({ status: 'expected', bookingId: null });
    expect(openOutflowCents()).toBe(40_000);
    expect(forecastDays('Miete')).toContain('2026-03-22');

    // The system never re-links a pairing the owner undid.
    expect(matchOccurrences(db, TODAY).links).toEqual([]);
    expect(march(rent.id).bookingId).toBeNull();
    expect(proposals()).toEqual([]);
    expect(db.select().from(booking).all()).toHaveLength(1);
  });

  it('keeps an ambiguous pairing a proposal under Prüfen until the owner confirms', () => {
    const a = payment('Abo A', 2_800);
    const b = payment('Abo B', 2_800);
    const bookingId = debit('2026-03-22', -2_800);

    const summary = matchOccurrences(db, TODAY);
    expect(summary).toMatchObject({ received: 0, deviating: 0, proposed: 1, links: [] });
    expect(march(a.id).bookingId).toBeNull();
    expect(march(b.id).bookingId).toBeNull();
    expect(openOutflowCents()).toBe(5_600);

    const [proposal] = proposals();
    expect(proposal).toMatchObject({ kind: 'expected_payment', resolvedAt: null });
    const listed = readInbox(db, TODAY).entries.filter((e) => e.id === proposal!.id);
    expect(listed).toHaveLength(1);
    // A second run does not open the same proposal twice.
    expect(matchOccurrences(db, TODAY).proposed).toBe(0);
    expect(proposals()).toHaveLength(1);

    // Confirming one occurrence links it and closes the proposal in the same audit group.
    const target = proposal!.refId!;
    const { groupId } = linkOccurrence(db, target, bookingId, ctx);
    expect(proposals()[0]).toMatchObject({ resolution: 'Verknüpft.' });
    // The linked booking is dated after today, so it is not in the balance yet: it still counts.
    expect(openOutflowCents()).toBe(5_600);
    undo(db, { groupId }, ctx);
    expect(proposals()[0]!.resolvedAt).toBeNull();
  });

  it('proposes a debit whose amount is outside the tolerance instead of linking it', () => {
    const rent = payment('Miete', 40_000);
    debit('2026-03-20', -42_000);
    const summary = matchOccurrences(db, TODAY);
    expect(summary).toMatchObject({ received: 0, deviating: 0, proposed: 1, links: [] });
    expect(march(rent.id)).toMatchObject({ status: 'expected', bookingId: null });
    expect(openOutflowCents()).toBe(40_000);
  });

  it('links within the configured tolerance', () => {
    const rent = payment('Miete', 40_000, { amountToleranceCents: 100 });
    debit('2026-03-20', -40_050);
    expect(matchOccurrences(db, TODAY).links).toHaveLength(1);
    expect(march(rent.id).status).toBe('received');
  });

  it('shows the proposal in Prüfen with its pairing and remembers a dismissal', () => {
    payment('Abo A', 2_800);
    payment('Abo B', 2_800);
    const bookingId = debit('2026-03-22', -2_800);
    matchOccurrences(db, TODAY);
    const [proposal] = proposals();
    const entry = readInbox(db, TODAY).entries.find((e) => e.id === proposal!.id);
    expect(entry).toMatchObject({
      type: 'stored',
      refType: LINK_PROPOSAL_REF,
      linkProposal: {
        occurrenceId: proposal!.refId,
        bookingId,
        view: {
          paymentName: expect.stringMatching(/^Abo [AB]$/),
          dueDate: '2026-03-22',
          expectedAmountCents: -2_800,
          bookingDate: '2026-03-22',
          bookingAmountCents: -2_800,
          currency: 'EUR',
        },
      },
    });

    // "Nicht zuordnen": the owner's no is not asked again, the other occurrence may still be.
    resolveInboxItem(db, proposal!.id, ctx);
    expect(matchOccurrences(db, TODAY)).toMatchObject({ links: [], proposed: 1 });
    expect(proposals().filter((p) => p.resolvedAt === null)).toHaveLength(1);
    expect(proposals().find((p) => p.resolvedAt === null)!.refId).not.toBe(proposal!.refId);
  });

  it('never links on its own a booking of another payee that only shares the category', () => {
    const rent = payment('Miete', 40_000);
    db.insert(payee).values({ id: 'p2', name: 'Anderer Empfänger' }).run();
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-20',
        amountCents: -40_000,
        payeeId: 'p2',
        splits: [{ amountCents: -40_000, categoryId: 'miete' }],
      },
      ctx,
    );
    const summary = matchOccurrences(db, TODAY);
    expect(summary).toMatchObject({ links: [], proposed: 1 });
    expect(march(rent.id).bookingId).toBeNull();
  });

  it.each([false, true])(
    'proposes a payee-less debit instead of linking it (autoOnly %s)',
    (autoOnly) => {
      const rent = payment('Miete', 40_000);
      const bookingId = createBooking(
        db,
        {
          accountId: 'giro',
          date: '2026-03-20',
          amountCents: -40_000,
          splits: [{ amountCents: -40_000, categoryId: 'miete' }],
        },
        ctx,
      );
      const summary = matchOccurrences(db, TODAY, ctx, { autoOnly });
      expect(summary).toMatchObject({ received: 0, proposed: 1, links: [] });
      expect(march(rent.id)).toMatchObject({ status: 'expected', bookingId: null });
      expect(readInbox(db, TODAY).entries).toContainEqual(
        expect.objectContaining({
          linkProposal: expect.objectContaining({ occurrenceId: march(rent.id).id, bookingId }),
        }),
      );
    },
  );

  it('shows a proposal again when the pairing it was closed for falls away', () => {
    const a = payment('Abo A', 2_800);
    const b = payment('Abo B', 2_800);
    const bookingId = debit('2026-03-22', -2_800);
    matchOccurrences(db, TODAY);
    const [first] = proposals();
    const other = first!.refId === march(a.id).id ? march(b.id) : march(a.id);
    // The owner settles the other occurrence: this proposal is superseded ...
    linkOccurrence(db, other.id, bookingId, ctx);
    expect(proposals().find((p) => p.id === first!.id)!.resolvedAt).not.toBeNull();
    // ... and when that link is removed, the pairing is a task again.
    unlinkOccurrence(db, other.id, ctx);
    matchOccurrences(db, TODAY);
    expect(proposals().filter((p) => p.resolvedAt === null).length).toBeGreaterThan(0);
  });

  it('never forecasts received income twice and counts a future-linked debit on its booking day', () => {
    const salary = payment('Gehalt', 200_000, { kind: 'inflow', categoryId: null, dueDay: 21 });
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-20',
        amountCents: 200_000,
        payeeId: 'p1',
        splits: [{ amountCents: 200_000, categoryId: null }],
      },
      ctx,
    );
    const rent = payment('Miete', 40_000);
    const bookingId = debit('2026-03-25', -40_000);
    matchOccurrences(db, TODAY);
    // The salary booked on 20.03. is settled by the existing income matching and already in the
    // starting balance (#1109): it must not arrive a second time, the next one still does.
    expect(
      db
        .select()
        .from(expectedOccurrence)
        .where(eq(expectedOccurrence.expectedPaymentId, salary.id))
        .all()
        .find((o) => o.dueDate === '2026-03-21'),
    ).toMatchObject({ status: 'received' });
    expect(forecastDays('Gehalt')).not.toContain('2026-03-21');
    expect(forecastDays('Gehalt')).toContain('2026-04-21');
    // SPEC "Financial terms": the link is settled, but the balance does not contain the future
    // booking yet. Both the forecast and the lead deduct it exactly once, on its booking date.
    expect(march(rent.id)).toMatchObject({ status: 'received', bookingId });
    expect(forecastDays('Miete').filter((d) => d <= '2026-03-31')).toEqual(['2026-03-25']);
    expect(openOutflowCents()).toBe(40_000);
  });

  it('a deviating income already in the balance is not forecast again (300000 expected, 310000 booked)', () => {
    const salary = payment('Gehalt', 300_000, { kind: 'inflow', categoryId: null, dueDay: 21 });
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-20',
        amountCents: 310_000,
        payeeId: 'p1',
        splits: [{ amountCents: 310_000, categoryId: null }],
      },
      ctx,
    );
    matchOccurrences(db, TODAY);
    const row = db
      .select()
      .from(expectedOccurrence)
      .where(eq(expectedOccurrence.expectedPaymentId, salary.id))
      .all()
      .find((o) => o.dueDate === '2026-03-21');
    expect(row).toMatchObject({ status: 'deviating' });
    expect(forecastDays('Gehalt')).not.toContain('2026-03-21');
    expect(forecastDays('Gehalt')).toContain('2026-04-21');
  });

  it('a linked debit booked after today counts once, on its booking date, in lead and forecast', () => {
    const rent = payment('Miete', 40_000, { dueDay: 20 });
    const bookingId = debit('2026-03-22', -40_000);
    matchOccurrences(db, TODAY);
    const row = db
      .select()
      .from(expectedOccurrence)
      .where(eq(expectedOccurrence.expectedPaymentId, rent.id))
      .all()
      .find((o) => o.dueDate === '2026-03-20');
    expect(row).toMatchObject({ bookingId });
    expect(forecastDays('Miete').filter((d) => d <= '2026-03-31')).toEqual(['2026-03-22']);
    expect(openOutflowCents()).toBe(40_000);
  });

  it('an overdue open debit is in the lead and on the first forecast day', () => {
    payment('Miete', 40_000, { dueDay: 18 });
    matchOccurrences(db, TODAY);
    expect(openOutflowCents()).toBe(40_000);
    // SPEC "Financial terms": overdue open payments reduce projected day zero, not a later item.
    const forecast = forecastInputs(loadFacts(db, TODAY), TODAY, { byAccount: { giro: 100_000 } });
    expect(forecast.startCents).toBe(60_000);
    expect(forecastDays('Miete').filter((d) => d <= '2026-03-31')).toEqual([]);
    expect(forecastDays('Miete').filter((d) => d <= '2026-04-30')).toEqual(['2026-04-18']);
  });

  it('leaves recurring income to the existing matching (no proposal, no own group)', () => {
    const salary = payment('Gehalt', 200_000, { kind: 'inflow', categoryId: null, payeeId: 'p1' });
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-21',
        amountCents: 200_000,
        payeeId: 'p1',
        splits: [{ amountCents: 200_000, categoryId: null }],
      },
      ctx,
    );
    const summary = matchOccurrences(db, TODAY);
    expect(summary.links).toEqual([]);
    expect(proposals()).toEqual([]);
    expect(march(salary.id)).toMatchObject({ status: 'received' });
  });
});
