import { afterEach, beforeEach, expect, it } from 'vitest';
import { parseCardDocument, parseStatementText, type StatementAutomationExecution } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { categoryGroup, INCOME_TYPES } from '../schema';
import { accounts, categories, createEntity } from './entities';
import { createBooking, deleteBooking, getBooking, updateBooking } from './bookings';
import { history, undo } from './audit';
import { balanceSeries } from './ledger-queries';
import { saveAssignmentRule } from './assignment-rules';
import { getStatementIntake, mutateStatementIntake, stageStatementIntake } from './statement-intake';
import { performStatementAction } from './statement-settlement';
import { removeReceipt, unlinkReceipt } from './receipts';
import {
  performStatementAutomation, prepareStatementAutomation, readStatementAutomationOutcome,
  saveStatementAutomationConfig,
} from './statement-automation';

let opened: OpenedDatabase;
const ctx = { actor: 'synthetic-card-owner-741' };
const CARD = '74100000-0000-4000-8000-000000000001';
const FUND = '74100000-0000-4000-8000-000000000002';
const GROUP = '74100000-0000-4000-8000-000000000003';
const FUEL = '74100000-0000-4000-8000-000000000004';
const TOKEN = 'c'.repeat(64), SHA = 'a'.repeat(64);
const columns = (cells: readonly (readonly [number, string])[]) => {
  let line = '';
  for (const [at, text] of cells) {
    if (line.length > at) throw new Error('Synthetic columns overlap');
    line = line.padEnd(at) + text;
  }
  return line;
};
const syntheticText = () => [
  'Rechnungsnummer SYNTHETIC-741', 'Rechnungsdatum 04.01.2031', 'Einzugsdatum 12.01.2031',
  'Kartennummer: 1111',
  columns([[0, 'Datum'], [12, 'Bezogen von'], [36, 'Produkt'], [52, 'Menge'], [64, 'Einheit'],
    [74, 'Preis pro'], [88, 'Rabatt pro'], [104, 'Total Netto'], [122, 'MwSt'], [136, 'MwSt'], [150, 'Total Brutto in']]),
  columns([[104, 'Netto in EUR'], [122, 'Satz %'], [136, 'Betrag'], [150, 'EUR']]),
  columns([[0, '30.12.2030'], [12, 'Synthetic station'], [36, 'Diesel'], [52, '50,000'],
    [64, 'Liter'], [74, '1,500000'], [88, '0,020000'], [104, '74,00'], [122, '20,00%'], [136, '14,80'], [150, '88,80']]),
  ...['Gesamt Kartensumme', 'Gesamt Firmensumme'].map((label) =>
    columns([[0, label], [104, '74,00'], [136, '14,80'], [150, '88,80']])),
].join('\n');

beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(opened.db, { id: FUND, name: 'Synthetic funding', type: 'checking', role: 'budget',
    onBudget: true, openingDate: '2030-12-01', openingBalanceCents: 50000 }, ctx);
  accounts.create(opened.db, { id: CARD, name: 'Synthetic card', type: 'credit_card', role: 'budget',
    onBudget: true, openingDate: '2030-12-01', openingBalanceCents: 0 }, ctx);
  createEntity(opened.db, categoryGroup, { id: GROUP, name: 'Synthetic expenses' }, ctx);
  categories.create(opened.db, { id: FUEL, groupId: GROUP, name: 'Synthetic fuel', class: 'need' }, ctx);
});
afterEach(() => opened.close());

function configure() {
  performStatementAction(opened.db, { operation: 'configure', key: 'synthetic-settlement-config',
    cardAccountId: CARD, fundingAccountId: FUND, expectedRevision: null, enabled: true }, ctx);
  return saveStatementAutomationConfig(opened.db, { accountId: CARD, expectedRevision: null,
    enabled: true, mappedCards: [{ token: TOKEN, accountId: CARD }], scheduledPayment: { mode: 'none' } }, ctx).config;
}
function rule(automatic = true) {
  return saveAssignmentRule(opened.db, null, { name: 'Synthetic station rule', enabled: true, automatic,
    match: { mode: 'all', conditions: [{ type: 'counterparty', text: 'Synthetic station Diesel' }] },
    actions: { categoryId: FUEL } }, ctx);
}
function preparation(text = syntheticText(), sha = SHA): StatementAutomationExecution {
  const intake = stageStatementIntake(opened.db, { accountId: CARD, sha256: sha,
    sizeBytes: 250, filename: 'synthetic-card-741.pdf', proposal: parseStatementText(text, sha) }, ctx).intake;
  const p = prepareStatementAutomation(opened.db, intake.id, intake);
  const document = parseCardDocument(text, sha, { ...p.context, previous: null,
    cardIdentity: () => ({ fingerprint: TOKEN, hint: '****1111' }) });
  expect(document.reasons).toEqual([]);
  return { source: p.source, configRevision: p.config.revision!,
    settlementConfigRevision: p.settlementConfigRevision, document, key: 'synthetic-delivery-' + sha };
}
const perform = (input: StatementAutomationExecution) => performStatementAutomation(opened.db, input, ctx);
const original = (amountCents: number) => getBooking(opened.db, createBooking(opened.db, {
  accountId: CARD, date: '2030-12-30', amountCents, status: 'confirmed', memo: 'Synthetic station Diesel',
  splits: [{ categoryId: FUEL, amountCents }],
}, ctx))!;
const rows = (name: string) => opened.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all();
const snapshot = () => JSON.stringify((opened.sqlite.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).all() as { name: string }[]).map(({ name }) => [name, rows(name)]));
const balances = () => [FUND, CARD].map((id) =>
  balanceSeries(opened.db, id, { from: '2031-01-12', to: '2031-01-12' })[0]!.balanceCents);
const liveBookings = () => opened.sqlite.prepare(
  'SELECT id, account_id, date, amount_cents, status, source, transfer_id FROM booking WHERE deleted_at IS NULL ORDER BY account_id, amount_cents',
).all();

it('posts the issued 8880 cents rather than the later deficit, with pending status and one audited receipt-linked action', () => {
  configure(); rule();
  createBooking(opened.db, { accountId: CARD, date: '2031-01-06', amountCents: -2300,
    splits: [{ categoryId: FUEL, amountCents: -2300 }] }, ctx);
  const input = preparation(), result = perform(input);
  expect(result).toMatchObject({ status: 'saved', created: 1, matched: 0, credits: 0, receiptLinks: 3, pending: [], reasons: [] });
  expect(balances()).toEqual([41120, -2300]);
  const own = result.items!.filter((i) => i.role !== 'original').map((i) => getBooking(opened.db, i.bookingId)!);
  expect(own.map((b) => b.amountCents).sort((a, b) => a - b)).toEqual([-8880, -8880, 8880]);
  expect(own.every((b) => b.status === 'pending' && b.source === 'import')).toBe(true);
  expect(own.filter((b) => b.transferId).map((b) => b.date)).toEqual(['2031-01-12', '2031-01-12']);
  expect(own.filter((b) => !b.transferId).map((b) => b.date)).toEqual(['2030-12-30']);
  const audit = opened.sqlite.prepare('SELECT actor, entity_type FROM audit_log WHERE group_id = ?').all(result.groupId) as { actor: string; entity_type: string }[];
  expect(audit.length).toBeGreaterThan(5);
  expect(audit.every((a) => a.actor === ctx.actor)).toBe(true);
  expect(audit.map((a) => a.entity_type)).toEqual(expect.arrayContaining(['booking', 'booking_split', 'booking_receipt', 'statement_automation_row', 'statement_settlement']));
  expect(rows('statement_automation_run')).toHaveLength(1);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
});

it('preserves the existing gross booking and adds only its independently proven 120-cent refund', () => {
  configure();
  const gross = original(-9000), before = getBooking(opened.db, gross.id), audit = history(opened.db, 'booking', gross.id);
  const input = preparation(), result = perform(input);
  expect(result).toMatchObject({ status: 'saved', created: 0, matched: 0, credits: 1, receiptLinks: 4 });
  expect(getBooking(opened.db, gross.id)).toEqual(before);
  expect(history(opened.db, 'booking', gross.id)).toEqual(audit);
  const credit = getBooking(opened.db, result.items!.find((i) => i.role === 'credit')!.bookingId)!;
  expect(credit).toMatchObject({ accountId: CARD, amountCents: 120, date: '2030-12-30', status: 'pending' });
  expect(credit.splits).toMatchObject([{ categoryId: FUEL, amountCents: 120, incomeTypeId: INCOME_TYPES.refund.id }]);
  expect(balances()).toEqual([41120, 0]);
});

it('links an already-net original without modifying it or adding a second rebate', () => {
  configure();
  const net = original(-8880), before = getBooking(opened.db, net.id), audit = history(opened.db, 'booking', net.id);
  const result = perform(preparation());
  expect(result).toMatchObject({ status: 'saved', created: 0, matched: 1, credits: 0, receiptLinks: 3 });
  expect(getBooking(opened.db, net.id)).toEqual(before);
  expect(history(opened.db, 'booking', net.id)).toEqual(audit);
  expect(liveBookings()).toHaveLength(3);
  expect(balances()).toEqual([41120, 0]);
});

it('retains validated purchases when debit date is absent, without inventing a settlement date', () => {
  configure(); rule();
  const input = preparation(syntheticText().replace('Einzugsdatum 12.01.2031\n', ''));
  const result = perform(input);
  expect(result).toMatchObject({ status: 'review', created: 1, credits: 0, receiptLinks: 1,
    reasons: ['settlement_source_review_required'] });
  expect(rows('statement_settlement')).toEqual([]);
  expect(liveBookings()).toMatchObject([{ amount_cents: -8880, date: '2030-12-30', status: 'pending' }]);
  expect(balances()).toEqual([50000, -8880]);
});

it('is delivery-idempotent including a changed request key, and never reposts a whole action after Undo', () => {
  configure(); rule();
  const input = preparation(), result = perform(input), posted = snapshot();
  expect(perform({ ...input, key: 'another-delivery-key' })).toMatchObject({ status: 'unchanged', groupId: null, runId: result.runId });
  expect(snapshot()).toBe(posted);
  const reversed = undo(opened.db, { groupId: result.groupId! }, ctx), undone = snapshot();
  expect(balances()).toEqual([50000, 0]);
  expect(readStatementAutomationOutcome(opened.db, input.source.intakeId)).toMatchObject({ status: 'undone', items: [] });
  expect(perform(input)).toMatchObject({ status: 'undone', groupId: null, runId: result.runId });
  expect(snapshot()).toBe(undone);
  expect(rows('statement_automation_run')).toHaveLength(1);
  undo(opened.db, { groupId: reversed.groupId }, ctx);
  expect(balances()).toEqual([41120, 0]);
  expect(readStatementAutomationOutcome(opened.db, input.source.intakeId)).toMatchObject({ status: 'saved' });
  expect(rows('statement_automation_run')).toHaveLength(1);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
});

it.each([false, true])('rejects partial document Undo even with force=%s without any table change', (force) => {
  configure(); rule();
  const result = perform(preparation()), created = result.items!.find((i) => i.role === 'created')!;
  const entry = history(opened.db, 'booking', created.bookingId)[0]!, before = snapshot();
  expect(() => undo(opened.db, { auditId: entry.id }, ctx, { force })).toThrow();
  expect(snapshot()).toBe(before);
});

it('protects represented money, source and receipt while permitting a status-only confirmation', () => {
  configure(); rule();
  const input = preparation(), result = perform(input), id = result.items!.find((i) => i.role === 'created')!.bookingId;
  for (const action of [
    () => deleteBooking(opened.db, id, ctx),
    () => updateBooking(opened.db, id, { amountCents: -8881, splits: [{ categoryId: FUEL, amountCents: -8881 }] }, ctx),
    () => removeReceipt(opened.db, input.source.receiptId, ctx),
    () => unlinkReceipt(opened.db, input.source.receiptId, id, ctx),
    () => mutateStatementIntake(opened.db, input.source.intakeId, getStatementIntake(opened.db, input.source.intakeId), 'reject', {}, ctx),
  ]) {
    const before = snapshot();
    expect(action).toThrow();
    expect(snapshot()).toBe(before);
  }
  updateBooking(opened.db, id, { status: 'confirmed' }, ctx);
  expect(getBooking(opened.db, id)).toMatchObject({ amountCents: -8880, status: 'confirmed' });
});

it.each(['source', 'automation', 'settlement'] as const)('rejects a stale %s snapshot before any financial write', (changed) => {
  const config = configure(); rule();
  const input = preparation();
  if (changed === 'source') mutateStatementIntake(opened.db, input.source.intakeId,
    getStatementIntake(opened.db, input.source.intakeId), 'reject', {}, ctx);
  else if (changed === 'automation') saveStatementAutomationConfig(opened.db, {
    accountId: CARD, expectedRevision: config.revision, enabled: false,
    mappedCards: config.mappedCards, scheduledPayment: { mode: 'none' },
  }, ctx);
  else performStatementAction(opened.db, { operation: 'configure', key: 'changed-funding-config',
    cardAccountId: CARD, fundingAccountId: FUND, expectedRevision: input.settlementConfigRevision, enabled: false }, ctx);
  const before = snapshot();
  expect(() => perform(input)).toThrow();
  expect(snapshot()).toBe(before);
});

it('re-reads current rules and candidates instead of trusting a prepared automatic category', () => {
  configure();
  const saved = rule(), input = preparation(syntheticText().replace('Einzugsdatum 12.01.2031\n', ''));
  saveAssignmentRule(opened.db, saved.id, { name: 'Now manual', enabled: true, automatic: false,
    match: { mode: 'all', conditions: [{ type: 'counterparty', text: 'Synthetic station Diesel' }] },
    actions: { categoryId: FUEL } }, ctx);
  const before = snapshot(), blocked = perform(input);
  expect(blocked).toMatchObject({ status: 'review', runId: null, created: 0, matched: 0, credits: 0 });
  expect(blocked.pending).toMatchObject([{ reason: 'automatic_category_required' }]);
  expect(snapshot()).toBe(before);
  const net = original(-8880), linked = perform(input);
  expect(linked).toMatchObject({ created: 0, matched: 1, credits: 0 });
  expect(linked.items).toEqual([{ bookingId: net.id, accountId: CARD, role: 'matched' }]);
});

it('rolls back the run claim, money, links and audit together when a late financial write fails', () => {
  configure(); rule();
  const input = preparation();
  opened.sqlite.exec("CREATE TRIGGER synthetic_741_failure BEFORE INSERT ON statement_settlement BEGIN SELECT RAISE(ABORT, 'synthetic 741 late failure'); END");
  const before = snapshot();
  expect(() => perform(input)).toThrow('synthetic 741 late failure');
  expect(snapshot()).toBe(before);
  expect(rows('statement_automation_run')).toEqual([]);
  opened.sqlite.exec('DROP TRIGGER synthetic_741_failure');
  expect(perform(input)).toMatchObject({ status: 'saved', created: 1 });
});
