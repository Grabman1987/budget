import { and, eq, sql } from 'drizzle-orm';
import type { CardRowAction, CardBoundary, StatementProposal } from '@budget/domain';
import {
  account,
  auditLog,
  booking,
  bookingReceipt,
  bookingSplit,
  category,
  INCOME_TYPES,
  payee,
  receipt,
  statementIntake,
  statementBonus,
  statementSettlement,
} from '../schema';
import { statementAutomationRow, statementAutomationRun } from '../schema/statement-automation';
import { BookingInvariantError, ConflictError } from './errors';
import type { Executor } from './types';

export function hasStatementAutomation(db: Executor) {
  const row = db.get<{ n: number }>(
    sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('statement_automation_config','statement_automation_run','statement_automation_row')`,
  )!;
  if (row.n !== 0 && row.n !== 3)
    throw new BookingInvariantError('Unvollständige Abrechnungsautomatik.');
  return row.n === 3;
}
export function assertStatementAutomationBookingWrite(
  db: Executor,
  id: string,
  fields: readonly string[] = [],
) {
  if (!hasStatementAutomation(db)) return;
  if (fields.length && fields.every((f) => ['status', 'flag', 'memo'].includes(f))) return;
  if (
    db
      .select()
      .from(statementAutomationRow)
      .all()
      .some((r) => !r.deletedAt && [r.bookingId, r.originalBookingId].includes(id))
  )
    throw new ConflictError(
      'Dieser Eintrag gehört zu einer Dokumentbuchung. Zuerst die vollständige Importaktion zurücknehmen.',
    );
}
export function assertStatementAutomationSourceWrite(
  db: Executor,
  sourceId: string,
  targetAccountId?: string,
  action?: string,
) {
  if (!hasStatementAutomation(db)) return;
  const activeRows = db
    .select()
    .from(statementAutomationRow)
    .all()
    .filter((r) => !r.deletedAt);
  const activeRunIds = new Set(activeRows.map((r) => r.runId));
  for (const settlement of db
    .select()
    .from(statementSettlement)
    .all()
    .filter((s) => !s.deletedAt && !['withdrawn', 'superseded'].includes(s.state))) {
    const origins = JSON.parse(settlement.originsJson) as { origin?: string; runId?: string };
    if (origins.origin === 'machine' && origins.runId) activeRunIds.add(origins.runId);
  }
  for (const run of db
    .select()
    .from(statementAutomationRun)
    .all()
    .filter((run) => activeRunIds.has(run.id))) {
    const proof = JSON.parse(run.sourceProofJson) as { previous?: CardBoundary | null };
    if (proof.previous?.intakeId === sourceId)
      throw new ConflictError(
        'Diese Quelle belegt bereits die vorherige Abrechnungsgrenze. Zuerst den abhängigen Import zurücknehmen.',
      );
  }
  const used = activeRows.some((r) => !r.deletedAt && r.sourceIntakeId === sourceId);
  // Reparse/review may complete still-pending fields. Account remapping may not move already posted money.
  const current = db.select().from(statementIntake).where(eq(statementIntake.id, sourceId)).get();
  if (
    used &&
    (['delete', 'reject'].includes(action ?? '') ||
      (targetAccountId && targetAccountId !== current?.accountId))
  )
    throw new ConflictError(
      'Gebuchte Dokumentzeilen bleiben an ihr Quellkonto gebunden. Zuerst die Importaktion zurücknehmen.',
    );
}
export function assertStatementAutomationReceiptWrite(
  db: Executor,
  receiptId: string,
  bookingId?: string,
) {
  if (!hasStatementAutomation(db)) return;
  const usedByRows = db
    .select()
    .from(statementAutomationRow)
    .all()
    .some(
      (r) =>
        !r.deletedAt &&
        r.receiptId === receiptId &&
        (!bookingId || [r.bookingId, r.originalBookingId].includes(bookingId)),
    );
  const usedBySettlement = db
    .select()
    .from(statementSettlement)
    .where(eq(statementSettlement.receiptId, receiptId))
    .all()
    .some(
      (s) =>
        !s.deletedAt &&
        s.state === 'represented' &&
        (JSON.parse(s.originsJson) as { origin?: string }).origin === 'machine' &&
        (!bookingId || [s.fromBookingId, s.toBookingId].includes(bookingId)),
    );
  if (usedByRows || usedBySettlement)
    throw new ConflictError(
      'Der Beleg gehört zu einer Dokumentbuchung. Zuerst die vollständige Importaktion zurücknehmen.',
    );
}
export function assertStatementAutomationUndoTarget(
  db: Executor,
  entries: readonly { entityType: string; groupId: string | null }[],
  partial: boolean,
) {
  if (!partial || !hasStatementAutomation(db)) return;
  for (const id of new Set(entries.flatMap((e) => (e.groupId ? [e.groupId] : [])))) {
    const types = db
      .select({ type: auditLog.entityType })
      .from(auditLog)
      .where(eq(auditLog.groupId, id))
      .all()
      .map((e) => e.type);
    if (
      types.includes('statement_automation_row') &&
      types.some((t) => ['booking', 'booking_split', 'booking_receipt'].includes(t))
    )
      throw new ConflictError('Dokumentbuchung nur als vollständige Gruppe zurücknehmen.');
  }
}
/** Called after normal mutations and forced Undo; no dependency on audit/writer modules. */
export function assertStatementAutomationInvariants(db: Executor) {
  if (!hasStatementAutomation(db)) return;
  const rows = db
    .select()
    .from(statementAutomationRow)
    .all()
    .filter((r) => !r.deletedAt);
  const originals = new Set<string>();
  const manuallyConsumed = new Set<string>();
  for (const bonus of db
    .select()
    .from(statementBonus)
    .all()
    .filter((b) => !b.deletedAt && !['withdrawn', 'superseded'].includes(b.state))) {
    const evidence = JSON.parse(bonus.evidenceJson) as { selectedOriginals: { splitId: string }[] };
    for (const original of evidence.selectedOriginals) manuallyConsumed.add(original.splitId);
  }
  for (const r of rows) {
    const s = db
      .select()
      .from(statementIntake)
      .where(eq(statementIntake.id, r.sourceIntakeId))
      .get();
    const blob = db.select().from(receipt).where(eq(receipt.id, r.receiptId)).get();
    const b = db.select().from(booking).where(eq(booking.id, r.bookingId)).get();
    const a = db.select().from(account).where(eq(account.id, r.accountId)).get();
    const edge = db
      .select()
      .from(bookingReceipt)
      .where(
        and(eq(bookingReceipt.bookingId, r.bookingId), eq(bookingReceipt.receiptId, r.receiptId)),
      )
      .get();
    const proof = JSON.parse(r.proofJson) as CardRowAction;
    const run = db
      .select()
      .from(statementAutomationRun)
      .where(eq(statementAutomationRun.id, r.runId))
      .get();
    const sourceProof = run
      ? (JSON.parse(run.sourceProofJson) as {
          layout: string;
          previous: CardBoundary | null;
          summary: StatementProposal;
          mappingKey: string;
        })
      : null;
    if (
      !run ||
      !sourceProof ||
      run.sourceIntakeId !== r.sourceIntakeId ||
      run.sourceSha256 !== r.sourceSha256 ||
      run.accountId !== r.accountId ||
      sourceProof.summary.sha256 !== r.sourceSha256
    )
      throw new BookingInvariantError('Unvollständiger Importnachweis.');
    if (sourceProof.layout === 'issued_card') {
      const previous = sourceProof.previous;
      const prior = previous
        ? db.select().from(statementIntake).where(eq(statementIntake.id, previous.intakeId)).get()
        : null;
      const priorBlob = prior
        ? db.select().from(receipt).where(eq(receipt.id, prior.receiptId)).get()
        : null;
      if (
        !previous ||
        !prior ||
        prior.deletedAt ||
        prior.status === 'rejected' ||
        prior.sha256 !== previous.sha256 ||
        prior.accountId !== r.accountId ||
        previous.accountId !== r.accountId ||
        previous.currency !== proof.row.currency ||
        previous.mappingKey !== sourceProof.mappingKey ||
        !priorBlob ||
        priorBlob.deletedAt ||
        priorBlob.sha256 !== previous.sha256
      )
        throw new BookingInvariantError('Vorherige Abrechnungsquelle ist nicht mehr vollständig.');
    }
    if (
      !s ||
      s.deletedAt ||
      s.status === 'rejected' ||
      s.accountId !== r.accountId ||
      s.sha256 !== r.sourceSha256 ||
      s.receiptId !== r.receiptId ||
      !blob ||
      blob.deletedAt ||
      blob.sha256 !== r.sourceSha256 ||
      !b ||
      b.deletedAt ||
      b.accountId !== r.accountId ||
      !a ||
      a.deletedAt ||
      a.currency !== b.currency ||
      !edge ||
      edge.deletedAt ||
      proof.kind === 'pending' ||
      proof.row.key !== r.rowKey ||
      proof.row.accountId !== r.accountId ||
      proof.row.currency !== b.currency
    )
      throw new BookingInvariantError(
        'Dokumentbuchung oder unveränderlicher Beleg ist nicht mehr vollständig.',
      );
    const expectedAmount = proof.kind === 'rebate' ? proof.creditCents : proof.row.amountCents;
    if (b.amountCents !== expectedAmount || b.date !== proof.row.bookingDate)
      throw new BookingInvariantError('Der dokumentierte Betrag oder Buchungstag wurde geändert.');
    if (proof.kind === 'link' || proof.kind === 'rebate') {
      const matched =
        proof.kind === 'link'
          ? b
          : db.select().from(booking).where(eq(booking.id, proof.booking.id)).get();
      const p = matched?.payeeId
        ? db.select().from(payee).where(eq(payee.id, matched.payeeId)).get()
        : null;
      const currentKey = (
        matched?.bankRawPayee ||
        (p && !p.deletedAt ? p.name : '') ||
        matched?.memo ||
        ''
      )
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('de-AT');
      const own = db
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.bookingId, proof.booking.id))
        .all();
      if (
        !matched ||
        matched.deletedAt ||
        matched.transferId ||
        currentKey !== proof.booking.counterpartyKey ||
        own.length !== 1 ||
        own[0]!.transferId ||
        own[0]!.contactId ||
        own[0]!.id !== proof.booking.singleExpenseSplitId ||
        own[0]!.categoryId !== proof.booking.singleExpenseCategoryId ||
        own[0]!.amountCents !== matched.amountCents ||
        matched.amountCents !== proof.booking.amountCents ||
        matched.date !== proof.booking.date ||
        matched.accountId !== proof.booking.accountId ||
        matched.currency !== proof.booking.currency
      )
        throw new BookingInvariantError(
          'Dokumentierter ursprünglicher Aufwand oder Empfängernachweis wurde geändert.',
        );
      const matchedCategory = own[0]!.categoryId
        ? db.select().from(category).where(eq(category.id, own[0]!.categoryId!)).get()
        : null;
      if (
        own[0]!.incomeTypeId ||
        !matchedCategory ||
        matchedCategory.deletedAt ||
        matchedCategory.class === null ||
        ['income', 'card_payment', 'advance'].includes(matchedCategory.kind)
      )
        throw new BookingInvariantError(
          'Dokumentierter Aufwand benötigt eine unveränderte Ausgabenkategorie.',
        );
      if (proof.kind === 'link') continue;
    }
    const splits = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, b.id)).all();
    const categoryId =
      proof.kind === 'create' ? proof.assignment.categoryId : proof.booking.singleExpenseCategoryId;
    const c = categoryId
      ? db.select().from(category).where(eq(category.id, categoryId)).get()
      : null;
    if (
      b.transferId ||
      splits.length !== 1 ||
      splits[0]!.transferId ||
      splits[0]!.contactId ||
      !c ||
      c.deletedAt ||
      c.class === null ||
      ['income', 'card_payment', 'advance'].includes(c.kind) ||
      splits[0]!.categoryId !== categoryId ||
      splits[0]!.amountCents !== expectedAmount ||
      (proof.kind === 'rebate' && splits[0]!.incomeTypeId !== INCOME_TYPES.refund.id)
    )
      throw new BookingInvariantError('Dokumentierte Ausgabenaufteilung wurde geändert.');
    if (proof.kind === 'rebate') {
      const original = db.select().from(booking).where(eq(booking.id, proof.booking.id)).get();
      const originalSplits = db
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.bookingId, proof.booking.id))
        .all();
      const rebate = proof.row.rebate;
      const originalEdge = db
        .select()
        .from(bookingReceipt)
        .where(
          and(
            eq(bookingReceipt.bookingId, proof.booking.id),
            eq(bookingReceipt.receiptId, r.receiptId),
          ),
        )
        .get();
      if (
        manuallyConsumed.has(proof.booking.singleExpenseSplitId!) ||
        !originalEdge ||
        originalEdge.deletedAt ||
        originals.has(proof.booking.id) ||
        r.originalBookingId !== proof.booking.id ||
        !rebate ||
        !original ||
        original.deletedAt ||
        original.transferId ||
        original.accountId !== r.accountId ||
        original.currency !== b.currency ||
        original.amountCents !== -rebate.originalGrossCents ||
        original.date !== proof.row.bookingDate ||
        rebate.originalGrossCents - rebate.chargedGrossCents !== proof.creditCents ||
        rebate.chargedGrossCents !== -proof.row.amountCents ||
        originalSplits.length !== 1 ||
        originalSplits[0]!.id !== proof.booking.singleExpenseSplitId ||
        originalSplits[0]!.categoryId !== categoryId ||
        originalSplits[0]!.amountCents !== original.amountCents ||
        originalSplits[0]!.transferId ||
        originalSplits[0]!.contactId
      )
        throw new BookingInvariantError(
          'Der nachgewiesene ursprüngliche Bruttoaufwand wurde geändert oder doppelt verwendet.',
        );
      originals.add(proof.booking.id);
    }
  }
}
