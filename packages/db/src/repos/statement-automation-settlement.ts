import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { statementPayableState, type StatementAutomationExecution } from '@budget/domain';
import { booking, bookingReceipt, statementSettlement, statementSettlementConfig } from '../schema';
import { insertTracked, type GroupedContext } from './audit';
import { createTransfer } from './bookings';
import { linkReceipt } from './receipts';
import { statementActive, statementPair, statementRevision } from './statement-settlement-invariants';
import { upcoming } from './expected';
import { statementAutomationConfig } from '../schema/statement-automation';
import type { StatementScheduledPayment } from '@budget/domain';
import { ConflictError } from './errors';
import type { Executor } from './types';

type Configuration = typeof statementSettlementConfig.$inferSelect;
type Pair = { transferId: string; fromBookingId: string; toBookingId: string };
export type MachineSettlementPlan = { legacyPaymentId: string | null; legacyDueDate: string | null; config: Configuration; pair: Pair | null; payableCents: number; debitDate: string };

/** Printed issued amount only. Never use the current card balance or later purchases. */
export function planMachineSettlement(db: Executor, input: StatementAutomationExecution): MachineSettlementPlan | string {
  const doc = input.document, f = doc.summary.fields;
  if (!doc.layout) return 'settlement_source_review_required';
  if (!doc.identity || !doc.totalsVerified || doc.reasons.length || (doc.layout === 'issued_card' && !doc.previous) ||
    [f.issueDate, f.debitDate, f.payableCents, f.currency].some((field) => field.origin !== 'printed' || field.value === null || field.candidates.length !== 1) ||
    doc.summary.warnings.some((w) => w.startsWith('ambiguous')))
    return 'settlement_source_review_required';
  const cfg = db.select().from(statementSettlementConfig).where(eq(statementSettlementConfig.cardAccountId, input.source.accountId)).get();
  if (statementRevision(db, 'statement_settlement_config', input.source.accountId) !== input.settlementConfigRevision)
    throw new ConflictError('Einzugskonto wurde geändert. Bitte neu laden.');
  if (!cfg || cfg.deletedAt || !cfg.enabled || !input.settlementConfigRevision) return 'settlement_configuration_required';
  const pair = statementPair(db, cfg.cardAccountId, cfg.fundingAccountId);
  if (pair.card.currency !== f.currency.value) return 'settlement_currency_review_required';
  if (db.select().from(statementSettlement).all().some((s) => statementActive(s.state, s.deletedAt) &&
    (s.sourceIntakeId === input.source.intakeId || (s.cardAccountId === input.source.accountId && s.issueDate === f.issueDate.value &&
      (s.reference === null || doc.identity!.reference === null || s.reference === doc.identity!.reference)))))
    return 'settlement_already_accepted';
  const payableCents = f.payableCents.value!, debitDate = f.debitDate.value!;
  const automation = db.select().from(statementAutomationConfig).where(eq(statementAutomationConfig.accountId, input.source.accountId)).get();
  const configured = automation ? JSON.parse(automation.scheduledPaymentJson) as StatementScheduledPayment : null;
  if (!configured) return 'settlement_recurring_identity_review_required';
  let legacyPaymentId: string | null = null, legacyDueDate: string | null = null;
  if (configured.mode === 'existing') {
    const occurrences = upcoming(db, debitDate, debitDate).filter((o) => o.paymentId === configured.paymentId);
    if (occurrences.length !== 1 || occurrences[0]!.accountId !== cfg.fundingAccountId || occurrences[0]!.currency !== f.currency.value ||
      occurrences[0]!.amountCents >= 0 || occurrences[0]!.bookingId || ['skipped', 'missed'].includes(occurrences[0]!.status))
      return 'settlement_recurring_identity_review_required';
    legacyPaymentId = configured.paymentId; legacyDueDate = debitDate;
  }
  if (payableCents <= 0) return { legacyPaymentId, legacyDueDate, config: cfg, pair: null, payableCents, debitDate };
  const possible = db.select().from(booking).where(and(inArray(booking.accountId, [cfg.cardAccountId, cfg.fundingAccountId]),
    eq(booking.date, debitDate), isNull(booking.deletedAt))).all();
  const matching: Pair[] = [];
  for (const from of possible.filter((b) => b.accountId === cfg.fundingAccountId && b.amountCents === -payableCents && b.transferId)) {
    const to = possible.filter((b) => b.accountId === cfg.cardAccountId && b.amountCents === payableCents && b.transferId === from.transferId);
    const reference = doc.identity.reference;
    const hasReference = !!reference && [from, ...to].some((b) => b.source === 'bank' &&
      (b.bankRawText ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-AT').split(/[^\p{L}\p{N}_/-]+/u)
        .includes(reference.trim().toLocaleLowerCase('de-AT')));
    if (hasReference && from.currency === f.currency.value && to.length === 1 && to[0]!.currency === f.currency.value && db.select().from(booking).where(and(eq(booking.transferId, from.transferId!), isNull(booking.deletedAt))).all().length === 2)
      matching.push({ transferId: from.transferId!, fromBookingId: from.id, toBookingId: to[0]!.id });
  }
  if (matching.length > 1) return 'settlement_multiple_existing_matches';
  if (matching.length === 1) {
    if (db.select().from(statementSettlement).all().some((s) => statementActive(s.state, s.deletedAt) && s.transferId === matching[0]!.transferId))
      return 'settlement_existing_match_consumed';
    return { legacyPaymentId, legacyDueDate, config: cfg, pair: matching[0]!, payableCents, debitDate };
  }
  // A plausible unpaired movement is review work, never permission to create another payment.
  if (possible.some((b) => (b.accountId === cfg.fundingAccountId && b.amountCents === -payableCents) ||
    (b.accountId === cfg.cardAccountId && b.amountCents === payableCents))) return 'settlement_existing_movement_requires_review';
  return { legacyPaymentId, legacyDueDate, config: cfg, pair: null, payableCents, debitDate };
}

export function executeMachineSettlement(db: Executor, input: StatementAutomationExecution, plan: MachineSettlementPlan,
  runId: string, group: GroupedContext) {
  const { source, document: doc } = input, f = doc.summary.fields;
  // Internal provenance is explicit; this neither supplies an invented reference nor pretends to be owner review.
  const originsJson = JSON.stringify({ origin: 'machine', schemaVersion: 1, parserVersion: doc.parserVersion,
    runId, layout: doc.layout, linkedReference: plan.pair ? doc.identity!.reference : null, identity: doc.identity, fields: f, previous: doc.previous });
  const id = randomUUID();
  let pair = plan.pair;
  if (plan.payableCents > 0 && !pair) pair = createTransfer(db, { fromAccountId: plan.config.fundingAccountId,
    toAccountId: plan.config.cardAccountId, amountCents: plan.payableCents, date: plan.debitDate,
    // A document proves an issued obligation, never bank confirmation or reconciliation.
    status: 'pending', source: 'import', memo: 'Abrechnungsausgleich', importKey: `statement:${source.sha256}:settlement` }, group);
  insertTracked(db, statementSettlement, { id, sourceIntakeId: source.intakeId, receiptId: source.receiptId,
    sourceSha256: source.sha256, sourceRevision: source.revision, cardAccountId: source.accountId,
    reference: doc.identity!.reference, issueDate: doc.identity!.issueDate, currency: f.currency.value!, originsJson,
    legacyPaymentId: plan.legacyPaymentId, legacyDueDate: plan.legacyDueDate,
    fundingAccountId: plan.config.fundingAccountId, debitDate: plan.debitDate, payableCents: plan.payableCents,
    state: pair ? 'represented' : statementPayableState(plan.payableCents) as 'zero' | 'credit_manual',
    representationKind: pair ? plan.pair ? 'linked' : 'created' : null, actionGroupId: pair ? group.groupId : null,
    transferId: pair?.transferId ?? null, fromBookingId: pair?.fromBookingId ?? null, toBookingId: pair?.toBookingId ?? null }, group);
  let receiptLinks = 0;
  if (pair) for (const bookingId of [pair.fromBookingId, pair.toBookingId]) {
    const edge = db.select().from(bookingReceipt).where(and(eq(bookingReceipt.bookingId, bookingId), eq(bookingReceipt.receiptId, source.receiptId))).get();
    if (!edge || edge.deletedAt) { linkReceipt(db, source.receiptId, bookingId, group); receiptLinks++; }
  }
  return { settlementId: id, receiptLinks };
}
