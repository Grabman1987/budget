import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { parseStatementText, type SettlementSource } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, category, categoryGroup, payee, statementSettlement } from '../schema';
import { createBooking, getBooking, markBankBookingTransfer } from './bookings';
import { accounts } from './entities';
import { history, undo } from './audit';
import { balanceSeries } from './ledger-queries';
import { prepareInboxBankSuggestions, readInbox } from './inbox';
import { budget } from './queries';
import { applyBookingAssignment, readBookingAssignments } from './assignment-rules';
import { mutateStatementIntake, stageStatementIntake } from './statement-intake';
import { performStatementAction } from './statement-settlement';

// All data is synthetic. Amounts in cents.
const FUND = '13190000-0000-4000-8000-000000000001';
const CARD = '13190000-0000-4000-8000-000000000002';
const OTHER_CARD = '13190000-0000-4000-8000-000000000003';
const TODAY = '2026-11-25';
const ISSUER = 'SYNTHETIC CARD ISSUER GMBH';
let opened: OpenedDatabase;
const ctx = { actor: 'synthetic-1319' };
const act = (body: unknown) => performStatementAction(opened.db, body, ctx);

beforeEach(() => {
  opened = createTestDatabase();
  const { db } = opened;
  for (const [id, name, type] of [
    [FUND, 'Synthetic funding', 'checking'],
    [CARD, 'Synthetic card', 'credit_card'],
    [OTHER_CARD, 'Synthetic other card', 'credit_card'],
  ] as const)
    accounts.create(
      db,
      {
        id,
        name,
        type,
        role: 'budget',
        onBudget: true,
        openingDate: '2026-09-01',
        openingBalanceCents: type === 'checking' ? 5_000_000 : 0,
      },
      ctx,
    );
  db.insert(categoryGroup).values({ id: 'grp', name: 'Gruppe' }).run();
  db.insert(category)
    .values({
      id: 'cat-fee',
      name: 'Synthetic yearly fee',
      groupId: 'grp',
      kind: 'fixed',
      class: 'need',
    })
    .run();
  db.insert(payee).values({ id: 'p-issuer', name: 'Synthetic Card Issuer' }).run();
});
afterEach(() => opened.close());

function bankDebit(date: string, amountCents: number, status: 'pending' | 'confirmed' = 'pending') {
  const id = createBooking(
    opened.db,
    {
      accountId: FUND,
      date,
      amountCents,
      status,
      splits: [{ amountCents }],
    },
    ctx,
  );
  opened.db
    .update(booking)
    .set({ source: 'bank', bankSourceId: 'synthetic-source', bankRawPayee: ISSUER })
    .where(eq(booking.id, id))
    .run();
  return id;
}

function statementSource(amount: number, sha = 'a'.repeat(64), reference = 'SYNTHETIC-1319') {
  const proposal = parseStatementText(
    `Rechnungsnummer ${reference}\nRechnungsdatum 01.10.2026\nAbrechnungsbetrag 1,00 EUR`,
    sha,
  );
  const intake = stageStatementIntake(
    opened.db,
    { accountId: CARD, sha256: sha, sizeBytes: 50, filename: 'synthetic.pdf', proposal },
    ctx,
  ).intake;
  const reviewed = mutateStatementIntake(
    opened.db,
    intake.id,
    intake,
    'review',
    {
      facts: {
        reference,
        issueDate: '2026-10-01',
        periodFrom: null,
        periodTo: null,
        payableCents: amount,
        currency: 'EUR',
        debitDate: '2026-10-10',
        accountHint: null,
      },
    },
    ctx,
  ).intake;
  return {
    intakeId: reviewed.id,
    accountId: CARD,
    sha256: sha,
    revision: reviewed.revision,
  } satisfies SettlementSource;
}

const configure = (enabled = true) =>
  act({
    operation: 'configure',
    key: 'synthetic-1319-config-' + enabled,
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled,
  }).configRevision!;

/** Earlier card bill: a bank debit of 1.000,00 on 2026-10-10, linked to an accepted statement. */
function priorSettlement() {
  const configRevision = configure();
  const debit = bankDebit('2026-10-10', -100_000, 'confirmed');
  const pair = markBankBookingTransfer(opened.db, debit, CARD, null, ctx);
  const source = statementSource(100_000);
  const confirmed = act({
    operation: 'confirm',
    key: 'synthetic-1319-confirm',
    source,
    configRevision,
  });
  const transferId = getBooking(opened.db, debit)!.transferId!;
  act({
    operation: 'link_transfer',
    key: 'synthetic-1319-link',
    source,
    configRevision,
    settlementId: confirmed.settlementId,
    expectedRevision: confirmed.settlementRevision,
    transferId,
    fromBookingId: debit,
    toBookingId: pair.counterpartId,
    fromRevision: history(opened.db, 'booking', debit)[0]!.id,
    toRevision: history(opened.db, 'booking', pair.counterpartId)[0]!.id,
  });
  return { configRevision };
}

const balance = (id: string, date: string) =>
  balanceSeries(opened.db, id, { from: date, to: date })[0]!.balanceCents;
const toDistribute = () => budget(opened.db, ['2026-11'])[0]!.toBeAssignedCents;
const entryFor = (id: string) =>
  prepareInboxBankSuggestions(opened.db, readInbox(opened.db, TODAY).entries).find(
    (e) => e.type === 'booking' && e.bookingId === id,
  );

it('proposes a transfer to the card, never a category, for a known card bill', () => {
  // Control: with only a category history the line would get that category.
  for (const date of ['2026-08-01', '2026-09-02'])
    opened.db
      .update(booking)
      .set({ payeeId: 'p-issuer' })
      .where(
        eq(
          booking.id,
          createBooking(
            opened.db,
            {
              accountId: FUND,
              date,
              amountCents: -5_000,
              status: 'confirmed',
              splits: [{ amountCents: -5_000, categoryId: 'cat-fee' }],
            },
            ctx,
          ),
        ),
      )
      .run();
  const { configRevision } = priorSettlement();
  expect(configRevision).toBeTruthy();
  const open = bankDebit('2026-11-23', -123_456);
  const entry = entryFor(open);
  expect(entry).toMatchObject({
    suggestion: {
      categoryId: null,
      categoryName: null,
      transfer: {
        ruleId: 'card-settlement:' + CARD,
        accountId: CARD,
        label: 'Kartenabrechnung → Umbuchung auf Synthetic card',
      },
    },
  });
  expect(readBookingAssignments(opened.db, open).suggestions[0]).toMatchObject({
    id: 'card-settlement:' + CARD,
    actions: { transferAccountId: CARD },
    unavailable: null,
  });
});

it('accepts as exactly one transfer, keeps the funding balance and undoes exactly', () => {
  priorSettlement();
  const open = bankDebit('2026-11-23', -123_456);
  const before = getBooking(opened.db, open);
  const rule = readBookingAssignments(opened.db, open).suggestions[0]!;
  const fundBefore = balance(FUND, '2026-11-25');
  const cardBefore = balance(CARD, '2026-11-25');
  expect([fundBefore, cardBefore]).toEqual([4_776_544, 100_000]);
  expect(toDistribute()).toBe(4_876_544); // the uncategorised outflow lowers Zu verteilen
  const rowsBefore = opened.db.select().from(booking).all().length;
  const applied = applyBookingAssignment(opened.db, open, rule.id, ctx, rule.revision);
  const after = getBooking(opened.db, open)!;
  expect(after.transferId).toBeTruthy();
  expect(after.splits).toHaveLength(1);
  expect(after.splits[0]!.categoryId).toBeNull();
  expect(opened.db.select().from(booking).all()).toHaveLength(rowsBefore + 1);
  expect(balance(FUND, '2026-11-25')).toBe(fundBefore);
  expect(balance(CARD, '2026-11-25')).toBe(cardBefore + 123_456);
  expect(balance(CARD, '2026-11-25')).toBe(223_456);
  expect(toDistribute()).toBe(5_000_000); // a card payment is neutral for Zu verteilen
  // The line left Prüfen.
  expect(entryFor(open)).toBeUndefined();
  undo(opened.db, { groupId: applied.groupId }, ctx);
  expect(getBooking(opened.db, open)).toEqual(before);
  expect(balance(FUND, '2026-11-25')).toBe(4_776_544);
  expect(balance(CARD, '2026-11-25')).toBe(100_000);
  expect(toDistribute()).toBe(4_876_544);
});

it('refuses a stale proposal revision', () => {
  priorSettlement();
  const open = bankDebit('2026-11-23', -123_456);
  expect(() =>
    applyBookingAssignment(opened.db, open, 'card-settlement:' + CARD, ctx, 'f'.repeat(64)),
  ).toThrow();
});

it('proposes nothing without an enabled configuration or without an earlier settlement of that payee', () => {
  // No configuration at all.
  const first = bankDebit('2026-11-23', -123_456);
  expect(readBookingAssignments(opened.db, first).suggestions).toEqual([]);
  priorSettlement();
  // Different counterparty: never settled this card.
  const stranger = bankDebit('2026-11-24', -2_000);
  opened.db
    .update(booking)
    .set({ bankRawPayee: 'SYNTHETIC UNRELATED SHOP' })
    .where(eq(booking.id, stranger))
    .run();
  expect(readBookingAssignments(opened.db, stranger).suggestions).toEqual([]);
  // Inflow on the funding account is never a card bill.
  const inflow = bankDebit('2026-11-24', 2_000);
  expect(readBookingAssignments(opened.db, inflow).suggestions).toEqual([]);
  // Configuration switched off.
  configureOff();
  expect(readBookingAssignments(opened.db, first).suggestions).toEqual([]);
});

function configureOff() {
  const revision = opened.sqlite.prepare('SELECT 1').get();
  expect(revision).toBeTruthy();
  opened.sqlite.prepare('UPDATE statement_settlement_config SET enabled = 0').run();
}

it('a statement for the same period links the existing transfer instead of paying twice', () => {
  const { configRevision } = priorSettlement();
  // The bill of the next period was already booked as a transfer in Prüfen (debit 2026-10-10 is
  // taken by the first settlement, so use the second statement with its own debit date).
  const open = bankDebit('2026-10-10', -250_000);
  const rule = readBookingAssignments(opened.db, open).suggestions[0]!;
  expect(rule.id).toBe('card-settlement:' + CARD);
  applyBookingAssignment(opened.db, open, rule.id, ctx, rule.revision);
  const transfersBefore = opened.db.select().from(booking).all().length;
  const second = statementSource(250_000, 'b'.repeat(64), 'SYNTHETIC-1319-B');
  const confirmed = act({
    operation: 'confirm',
    key: 'synthetic-1319-confirm-b',
    source: second,
    configRevision,
  });
  const created = act({
    operation: 'create_transfer',
    key: 'synthetic-1319-pay-b',
    source: second,
    configRevision,
    settlementId: confirmed.settlementId,
    expectedRevision: confirmed.settlementRevision,
    status: 'pending',
  });
  expect(created.transferId).toBe(getBooking(opened.db, open)!.transferId);
  // No second transfer: the bank debit and its counter leg are the only legs.
  expect(opened.db.select().from(booking).all()).toHaveLength(transfersBefore);
  const row = opened.db
    .select()
    .from(statementSettlement)
    .where(eq(statementSettlement.reference, 'SYNTHETIC-1319-B'))
    .get()!;
  expect(row).toMatchObject({
    state: 'represented',
    representationKind: 'linked',
    fromBookingId: open,
    payableCents: 250_000,
  });
  expect(balance(FUND, '2026-11-25')).toBe(5_000_000 - 100_000 - 250_000);
  expect(balance(CARD, '2026-11-25')).toBe(350_000);
});

it('creates its own transfer when no matching payment exists (unchanged behaviour)', () => {
  const { configRevision } = priorSettlement();
  const second = statementSource(250_000, 'c'.repeat(64), 'SYNTHETIC-1319-C');
  const confirmed = act({
    operation: 'confirm',
    key: 'synthetic-1319-confirm-c',
    source: second,
    configRevision,
  });
  act({
    operation: 'create_transfer',
    key: 'synthetic-1319-pay-c',
    source: second,
    configRevision,
    settlementId: confirmed.settlementId,
    expectedRevision: confirmed.settlementRevision,
    status: 'pending',
  });
  const row = opened.db
    .select()
    .from(statementSettlement)
    .where(eq(statementSettlement.reference, 'SYNTHETIC-1319-C'))
    .get()!;
  expect(row.representationKind).toBe('created');
  expect(balance(FUND, '2026-11-25')).toBe(5_000_000 - 100_000 - 250_000);
});
