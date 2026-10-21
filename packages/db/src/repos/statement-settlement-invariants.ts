import {
  assertStatementAutomationBookingWrite,
  assertStatementAutomationSourceWrite,
  assertStatementAutomationUndoTarget,
  assertStatementAutomationInvariants,
} from './statement-automation-invariants';
import { and, desc, eq, sql } from 'drizzle-orm';
import { statementBonusEvidenceSchema, type StatementBonusEvidence } from '@budget/domain';
import {
  account,
  auditLog,
  booking,
  bookingReceipt,
  bookingSplit,
  category,
  receipt,
  statementIntake,
  statementSettlement,
  statementBonus,
  statementSettlementConfig,
  INCOME_TYPES,
} from '../schema';
import { statementAutomationRun } from '../schema/statement-automation';
import { hasStatementAutomation } from './statement-automation-invariants';
import type { StatementFields } from '@budget/domain';
import { BookingInvariantError, ConflictError } from './errors';
import type { Executor } from './types';

/** Migration-copy compatibility is all-four-absent only, never a partial family. */
export function hasStatementSettlementFamily(db: Executor) {
  const row = db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('statement_settlement_config','statement_settlement','statement_bonus','statement_settlement_delivery')`,
  )!;
  if (row.n !== 0 && row.n !== 4)
    throw new BookingInvariantError('Unvollständige Abrechnungsverwaltung.');
  return row.n === 4;
}
export function statementRevision(db: Executor, table: string, id: string): string | null {
  return (
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, table), eq(auditLog.entityId, id)))
      .orderBy(desc(sql`rowid`))
      .get()?.id ?? null
  );
}
export const statementActive = (state: string, deletedAt: string | null) =>
  !deletedAt && !['withdrawn', 'superseded'].includes(state);
export function statementPair(db: Executor, cardId: string, fundingId: string) {
  const card = db.select().from(account).where(eq(account.id, cardId)).get();
  const funding = db.select().from(account).where(eq(account.id, fundingId)).get();
  if (
    !card ||
    !funding ||
    card.deletedAt ||
    funding.deletedAt ||
    card.closedAt ||
    funding.closedAt ||
    card.type !== 'credit_card' ||
    !['checking', 'savings'].includes(funding.type) ||
    card.id === funding.id ||
    card.currency !== funding.currency ||
    card.onBudget !== funding.onBudget ||
    (card.onBudget && card.currency !== 'EUR')
  )
    throw new BookingInvariantError(
      'Bitte offene Kreditkarte und getrenntes Giro-/Sparkonto gleicher Währung und Budgetzuordnung wählen.',
    );
  return { card, funding };
}
export function bonusEvidence(value: string): StatementBonusEvidence {
  if (Buffer.byteLength(value, 'utf8') > 65536)
    throw new BookingInvariantError('Abrechnungsnachweis ist zu groß.');
  return statementBonusEvidenceSchema.parse(JSON.parse(value));
}
export function assertBonusOriginals(
  db: Executor,
  cardId: string,
  currency: string,
  evidence: StatementBonusEvidence,
  checkCas = false,
) {
  for (const o of evidence.selectedOriginals) {
    const b = db.select().from(booking).where(eq(booking.id, o.bookingId)).get();
    const s = db.select().from(bookingSplit).where(eq(bookingSplit.id, o.splitId)).get();
    const a = db.select().from(account).where(eq(account.id, cardId)).get();
    const c = db.select().from(category).where(eq(category.id, o.categoryId)).get();
    if (
      !b ||
      b.deletedAt ||
      !s ||
      s.bookingId !== b.id ||
      !a ||
      a.deletedAt ||
      a.currency !== currency ||
      b.accountId !== cardId ||
      o.accountId !== cardId ||
      o.currency !== currency ||
      b.transferId ||
      s.transferId ||
      b.amountCents !== o.bookingAmountCents ||
      s.amountCents !== o.splitAmountCents ||
      s.categoryId !== o.categoryId ||
      !c ||
      c.deletedAt ||
      c.class === null ||
      ['income', 'card_payment', 'advance'].includes(c.kind) ||
      b.amountCents >= 0 ||
      s.amountCents >= 0
    )
      throw new ConflictError(
        'Der ursprüngliche Aufwand wurde geändert. Nachweis ausdrücklich neu prüfen.',
      );
    if (
      checkCas &&
      (statementRevision(db, 'booking', b.id) !== o.bookingRevision ||
        statementRevision(db, 'booking_split', s.id) !== o.splitRevision)
    )
      throw new ConflictError('Der ursprüngliche Aufwand wurde geändert. Bitte neu laden.');
  }
  const affected = new Set(evidence.selectedOriginals.map((o) => o.categoryId));
  for (const allocation of evidence.allocations) {
    const c = db.select().from(category).where(eq(category.id, allocation.categoryId)).get();
    if (
      !affected.has(allocation.categoryId) ||
      !c ||
      c.deletedAt ||
      c.class === null ||
      ['income', 'card_payment', 'advance'].includes(c.kind)
    )
      throw new BookingInvariantError(
        'Die Gutschrift darf nur den ausgewählten betroffenen Ausgabenkategorien zugeordnet werden.',
      );
  }
}
export function assertStatementSourceWrite(
  db: Executor,
  sourceId: string,
  targetAccountId?: string,
  action?: string,
) {
  assertStatementAutomationSourceWrite(db, sourceId, targetAccountId, action);
  if (!hasStatementSettlementFamily(db)) return;
  const used =
    db
      .select()
      .from(statementSettlement)
      .where(eq(statementSettlement.sourceIntakeId, sourceId))
      .all()
      .some((r) => statementActive(r.state, r.deletedAt)) ||
    db
      .select()
      .from(statementBonus)
      .where(eq(statementBonus.sourceIntakeId, sourceId))
      .all()
      .some((r) => statementActive(r.state, r.deletedAt));
  if (used)
    throw new ConflictError(
      'Die Abrechnung ist als Nachweis angenommen. Abrechnungsausgleich und Gutschrift getrennt prüfen und zuerst zurücknehmen.',
    );
}
export function assertStatementBookingWrite(
  db: Executor,
  id: string,
  action: string,
  fields: string[] = [],
) {
  assertStatementAutomationBookingWrite(db, id, action === 'update' ? fields : []);
  if (!hasStatementSettlementFamily(db)) return;
  if (action === 'update' && fields.every((f) => ['status', 'flag', 'memo'].includes(f))) return;
  const consumed =
    db
      .select()
      .from(statementSettlement)
      .all()
      .some(
        (r) =>
          statementActive(r.state, r.deletedAt) &&
          r.state === 'represented' &&
          [r.fromBookingId, r.toBookingId].includes(id),
      ) ||
    db
      .select()
      .from(statementBonus)
      .all()
      .some(
        (r) =>
          statementActive(r.state, r.deletedAt) &&
          (r.bookingId === id ||
            bonusEvidence(r.evidenceJson).selectedOriginals.some((o) => o.bookingId === id)),
      );
  if (consumed)
    throw new ConflictError(
      'Dieser Eintrag gehört zu einem angenommenen Abrechnungsnachweis. Zuerst die zugehörige Aktion zurücknehmen.',
    );
}
export function assertStatementUndoTarget(
  db: Executor,
  entries: readonly { entityType: string; groupId: string | null }[],
  partial: boolean,
) {
  assertStatementAutomationUndoTarget(db, entries, partial);
  if (!partial || !hasStatementSettlementFamily(db)) return;
  for (const group of new Set(entries.flatMap((e) => (e.groupId ? [e.groupId] : [])))) {
    const types = db
      .select({ type: auditLog.entityType })
      .from(auditLog)
      .where(eq(auditLog.groupId, group))
      .all()
      .map((e) => e.type);
    if (
      (types.some((t) => ['statement_settlement', 'statement_bonus'].includes(t)) &&
        types.some((t) => ['booking', 'booking_split'].includes(t))) ||
      (types.includes('statement_bonus') && types.includes('statement_intake'))
    )
      throw new ConflictError('Abrechnungsaktion nur als vollständige Gruppe zurücknehmen.');
  }
}
function acceptedFields(
  db: Executor,
  row: typeof statementSettlement.$inferSelect | typeof statementBonus.$inferSelect,
) {
  const source = db
    .select()
    .from(statementIntake)
    .where(eq(statementIntake.id, row.sourceIntakeId))
    .get();
  const value = JSON.parse(row.originsJson) as {
    origin?: string;
    layout?: string;
    runId?: string;
    fields?: StatementFields;
    identity?: { kind?: string; key?: string; issueDate?: string; reference?: string | null };
    previous?: { intakeId: string; sha256: string; accountId: string; currency: string };
  };
  if (value.origin !== 'machine') {
    return source?.status === 'reviewed' && source.reviewedJson
      ? (JSON.parse(source.reviewedJson) as { fields: StatementFields }).fields
      : null;
  }
  if (!hasStatementAutomation(db) || !value.runId || !value.fields || !value.identity || !source)
    return null;
  const run = db
    .select()
    .from(statementAutomationRun)
    .where(eq(statementAutomationRun.id, value.runId))
    .get();
  const prior = value.previous
    ? db.select().from(statementIntake).where(eq(statementIntake.id, value.previous.intakeId)).get()
    : null;
  const priorReceipt = prior
    ? db.select().from(receipt).where(eq(receipt.id, prior.receiptId)).get()
    : null;
  if (
    !run ||
    run.sourceIntakeId !== row.sourceIntakeId ||
    run.sourceSha256 !== row.sourceSha256 ||
    run.sourceRevision !== row.sourceRevision ||
    run.accountId !== row.cardAccountId ||
    run.identityKey !== value.identity.key ||
    value.identity.issueDate !== row.issueDate ||
    value.identity.reference !== row.reference ||
    (row.reference === null
      ? value.identity.kind !== 'issued_date'
      : value.identity.kind !== 'printed_reference') ||
    !['issued_card', 'company_card'].includes(value.layout ?? '') ||
    (value.layout === 'issued_card' &&
      (!prior ||
        prior.deletedAt ||
        prior.status === 'rejected' ||
        prior.accountId !== row.cardAccountId ||
        prior.sha256 !== value.previous!.sha256 ||
        value.previous!.accountId !== row.cardAccountId ||
        value.previous!.currency !== row.currency ||
        !priorReceipt ||
        priorReceipt.deletedAt ||
        priorReceipt.sha256 !== value.previous!.sha256)) ||
    !['pending', 'reviewed'].includes(source.status) ||
    JSON.stringify(value.fields) !==
      JSON.stringify((JSON.parse(source.proposalJson) as { fields: StatementFields }).fields) ||
    Object.values(value.fields).some((f) => f.value !== null && f.origin !== 'printed')
  )
    return null;
  return value.fields;
}
/** Schema-only final validator: safe from a write-module/audit import cycle. */
export function assertStatementSettlementInvariants(db: Executor) {
  assertStatementAutomationInvariants(db);
  if (!hasStatementSettlementFamily(db)) return;
  const settlements = db
    .select()
    .from(statementSettlement)
    .all()
    .filter((r) => statementActive(r.state, r.deletedAt));
  const bonuses = db
    .select()
    .from(statementBonus)
    .all()
    .filter((r) => statementActive(r.state, r.deletedAt));
  const splits = new Set<string>(),
    credits = new Set<string>();
  for (const r of [...settlements, ...bonuses]) {
    const source = db
      .select()
      .from(statementIntake)
      .where(eq(statementIntake.id, r.sourceIntakeId))
      .get();
    const original = db.select().from(receipt).where(eq(receipt.id, r.receiptId)).get();
    const a = db.select().from(account).where(eq(account.id, r.cardAccountId)).get();
    const cfg = db
      .select()
      .from(statementSettlementConfig)
      .where(eq(statementSettlementConfig.cardAccountId, r.cardAccountId))
      .get();
    const fields = acceptedFields(db, r);
    if (
      !source ||
      source.deletedAt ||
      source.sha256 !== r.sourceSha256 ||
      source.receiptId !== r.receiptId ||
      source.accountId !== r.cardAccountId ||
      !original ||
      original.deletedAt ||
      original.sha256 !== r.sourceSha256 ||
      !a ||
      a.deletedAt ||
      a.currency !== r.currency ||
      !cfg ||
      cfg.deletedAt ||
      !fields ||
      fields.reference?.value !== r.reference ||
      fields.issueDate?.value !== r.issueDate ||
      fields.currency?.value !== r.currency
    )
      throw new BookingInvariantError(
        'Ein angenommener Abrechnungsnachweis wäre unvollständig oder verändert.',
      );
  }
  for (const r of settlements) {
    if (r.state === 'open') statementPair(db, r.cardAccountId, r.fundingAccountId);
    const fields = acceptedFields(db, r)!;
    if (fields.payableCents?.value !== r.payableCents || fields.debitDate?.value !== r.debitDate)
      throw new BookingInvariantError(
        'Angenommener Rechnungsbetrag oder Einzugstermin stimmt nicht überein.',
      );
    if (r.state !== 'represented') continue;
    const from = db.select().from(booking).where(eq(booking.id, r.fromBookingId!)).get();
    const to = db.select().from(booking).where(eq(booking.id, r.toBookingId!)).get();
    const funding = db.select().from(account).where(eq(account.id, r.fundingAccountId)).get();
    const machine = JSON.parse(r.originsJson) as {
      origin?: string;
      linkedReference?: string | null;
    };
    if (machine.origin === 'machine') {
      const edges = db
        .select()
        .from(bookingReceipt)
        .where(eq(bookingReceipt.receiptId, r.receiptId))
        .all();
      if (
        ![r.fromBookingId, r.toBookingId].every(
          (id) => id && edges.some((edge) => edge.bookingId === id && !edge.deletedAt),
        )
      )
        throw new BookingInvariantError(
          'Automatischer Abrechnungsausgleich benötigt den Originalbeleg an beiden Transferseiten.',
        );
    }
    if (
      machine.origin === 'machine' &&
      r.representationKind === 'linked' &&
      (!machine.linkedReference ||
        ![from, to].some(
          (b) =>
            b?.source === 'bank' &&
            (b.bankRawText ?? '')
              .trim()
              .replace(/\s+/g, ' ')
              .toLocaleLowerCase('de-AT')
              .split(/[^\p{L}\p{N}_/-]+/u)
              .includes(machine.linkedReference!.trim().toLocaleLowerCase('de-AT')),
        ))
    )
      throw new BookingInvariantError(
        'Der eindeutige Banknachweis zum Abrechnungsausgleich wurde geändert.',
      );

    if (
      !from ||
      !to ||
      from.deletedAt ||
      to.deletedAt ||
      from.transferId !== r.transferId ||
      to.transferId !== r.transferId ||
      from.accountId !== r.fundingAccountId ||
      to.accountId !== r.cardAccountId ||
      from.amountCents !== -r.payableCents ||
      to.amountCents !== r.payableCents ||
      from.date !== r.debitDate ||
      to.date !== r.debitDate ||
      !funding ||
      funding.deletedAt ||
      funding.currency !== r.currency
    )
      throw new BookingInvariantError(
        'Abrechnungsausgleich benötigt beide unveränderten Transferseiten.',
      );
  }
  for (const r of bonuses) {
    const evidence = bonusEvidence(r.evidenceJson);
    assertBonusOriginals(db, r.cardAccountId, r.currency, evidence);
    for (const o of evidence.selectedOriginals) {
      if (splits.has(o.splitId))
        throw new BookingInvariantError('Ein Aufwand ist bereits einer Gutschrift zugeordnet.');
      splits.add(o.splitId);
    }
    if (
      evidence.bonusCents !== r.bonusCents ||
      evidence.creditDate !== r.creditDate ||
      (r.state === 'already_net') !== (evidence.treatment === 'already_net')
    )
      throw new BookingInvariantError('Gutschriftnachweis stimmt nicht überein.');
    if (r.state !== 'represented') continue;
    if (credits.has(r.bookingId!))
      throw new BookingInvariantError('Gutschrift ist bereits zugeordnet.');
    credits.add(r.bookingId!);
    const b = db.select().from(booking).where(eq(booking.id, r.bookingId!)).get();
    const actual = db
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, r.bookingId!))
      .all();
    // Sorted tuples retain multiplicity: A60/A60 cannot stand in for A60/B60.
    const credited = actual.map((s) => JSON.stringify([s.categoryId, s.amountCents])).sort();
    const approved = evidence.allocations
      .map((a) => JSON.stringify([a.categoryId, a.amountCents]))
      .sort();
    if (
      !b ||
      b.deletedAt ||
      b.transferId ||
      b.accountId !== r.cardAccountId ||
      b.amountCents !== r.bonusCents ||
      b.date !== r.creditDate ||
      actual.length !== evidence.allocations.length ||
      JSON.stringify(credited) !== JSON.stringify(approved) ||
      actual.some((s) => s.transferId || s.incomeTypeId !== INCOME_TYPES.refund.id)
    )
      throw new BookingInvariantError('Die zugeordnete Ausgabengutschrift wurde verändert.');
  }
}
