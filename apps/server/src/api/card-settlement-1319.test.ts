/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON API boundary. */
import {
  accounts,
  createBooking,
  createTestDatabase,
  getBooking,
  history,
  markBankBookingTransfer,
  mutateStatementIntake,
  performStatementAction,
  schema,
  stageStatementIntake,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { parseStatementText } from '@budget/domain';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';

// Synthetic data only. #1319: a card bill debit is proposed as a transfer to the card.
const FUND = '13190000-0000-4000-8000-0000000000a1';
const CARD = '13190000-0000-4000-8000-0000000000a2';
const ctx = { actor: 'synthetic-1319-api' };
let opened: OpenedDatabase;
let app: Hono;

beforeEach(() => {
  opened = createTestDatabase();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-11-25',
    stepUp: async (_c, next) => next(),
  });
  for (const [id, name, type] of [
    [FUND, 'Synthetic funding', 'checking'],
    [CARD, 'Synthetic card', 'credit_card'],
  ] as const)
    accounts.create(
      opened.db,
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
});
afterEach(() => opened.close());

function bankDebit(date: string, amountCents: number, status: 'pending' | 'confirmed') {
  const id = createBooking(
    opened.db,
    { accountId: FUND, date, amountCents, status, splits: [{ amountCents }] },
    ctx,
  );
  opened.db
    .update(schema.booking)
    .set({
      source: 'bank',
      bankSourceId: 'synthetic-source',
      bankRawPayee: 'SYNTHETIC CARD ISSUER',
    })
    .where(eq(schema.booking.id, id))
    .run();
  return id;
}

function priorSettlement() {
  const configRevision = performStatementAction(
    opened.db,
    {
      operation: 'configure',
      key: 'synthetic-1319-api-config',
      cardAccountId: CARD,
      fundingAccountId: FUND,
      expectedRevision: null,
      enabled: true,
    },
    ctx,
  ).configRevision!;
  const debit = bankDebit('2026-10-10', -100_000, 'confirmed');
  const pair = markBankBookingTransfer(opened.db, debit, CARD, null, ctx);
  const sha = 'd'.repeat(64);
  const intake = stageStatementIntake(
    opened.db,
    {
      accountId: CARD,
      sha256: sha,
      sizeBytes: 50,
      filename: 'synthetic.pdf',
      proposal: parseStatementText(
        'Rechnungsnummer SYNTHETIC-API\nRechnungsdatum 01.10.2026\nAbrechnungsbetrag 1,00 EUR',
        sha,
      ),
    },
    ctx,
  ).intake;
  const reviewed = mutateStatementIntake(
    opened.db,
    intake.id,
    intake,
    'review',
    {
      facts: {
        reference: 'SYNTHETIC-API',
        issueDate: '2026-10-01',
        periodFrom: null,
        periodTo: null,
        payableCents: 100_000,
        currency: 'EUR',
        debitDate: '2026-10-10',
        accountHint: null,
      },
    },
    ctx,
  ).intake;
  const source = {
    intakeId: reviewed.id,
    accountId: CARD,
    sha256: sha,
    revision: reviewed.revision,
  };
  const confirmed = performStatementAction(
    opened.db,
    { operation: 'confirm', key: 'synthetic-1319-api-confirm', source, configRevision },
    ctx,
  );
  performStatementAction(
    opened.db,
    {
      operation: 'link_transfer',
      key: 'synthetic-1319-api-link',
      source,
      configRevision,
      settlementId: confirmed.settlementId,
      expectedRevision: confirmed.settlementRevision,
      transferId: getBooking(opened.db, debit)!.transferId!,
      fromBookingId: debit,
      toBookingId: pair.counterpartId,
      fromRevision: history(opened.db, 'booking', debit)[0]!.id,
      toRevision: history(opened.db, 'booking', pair.counterpartId)[0]!.id,
    },
    ctx,
  );
}

async function post(path: string, body: unknown) {
  const response = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const inboxBooking = async (id: string) =>
  ((await (await app.request('/inbox')).json()) as any).entries.find(
    (e: any) => e.type === 'booking' && e.bookingId === id,
  );

it('serves the card-bill transfer proposal inline, applies it once and undoes it exactly', async () => {
  priorSettlement();
  const open = bankDebit('2026-11-23', -123_456, 'pending');
  const before = getBooking(opened.db, open);
  const entry = await inboxBooking(open);
  expect(entry.suggestion.categoryId).toBeNull();
  expect(entry.suggestion.transfer).toMatchObject({
    accountId: CARD,
    label: 'Kartenabrechnung → Umbuchung auf Synthetic card',
  });
  const applied = await post('/assignment-rules/bookings/' + open + '/apply', {
    ruleId: entry.suggestion.transfer.ruleId,
    revision: entry.suggestion.transfer.revision,
  });
  expect(applied.status).toBe(200);
  const legs = opened.db
    .select()
    .from(schema.booking)
    .all()
    .filter((b) => b.transferId === getBooking(opened.db, open)!.transferId);
  expect(legs.map((b) => b.amountCents).sort((a, b) => a - b)).toEqual([-123_456, 123_456]);
  expect(await inboxBooking(open)).toBeUndefined();
  // A stale revision is refused with nothing written.
  expect(
    (
      await post('/assignment-rules/bookings/' + open + '/apply', {
        ruleId: entry.suggestion.transfer.ruleId,
        revision: 'e'.repeat(64),
      })
    ).status,
  ).toBeGreaterThanOrEqual(400);
  undo(opened.db, { groupId: applied.body.groupId }, ctx);
  expect(getBooking(opened.db, open)).toEqual(before);
  expect((await inboxBooking(open)).suggestion.transfer.accountId).toBe(CARD);
});

it('serves no transfer proposal for a payee that never settled the card', async () => {
  priorSettlement();
  const other = bankDebit('2026-11-23', -2_000, 'pending');
  opened.db
    .update(schema.booking)
    .set({ bankRawPayee: 'SYNTHETIC UNRELATED SHOP' })
    .where(eq(schema.booking.id, other))
    .run();
  expect((await inboxBooking(other)).suggestion.transfer).toBeUndefined();
});
