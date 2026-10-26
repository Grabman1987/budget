import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, eq, getTableColumns, inArray, isNull, or, sql, type SQLWrapper } from 'drizzle-orm';
import {
  PAYSLIP_PARSER_VERSION,
  payrollTotals,
  payslipInput,
  payslipSourceConfig,
  type ParsedPayrollDocument,
} from '@budget/domain';
import {
  account,
  appSetting,
  auditLog,
  bankSyncAccount,
  bankSyncCandidate,
  bankSyncConsent,
  booking,
  bookingReceipt,
  bookingSplit,
  expectedOccurrence,
  expectedPayment,
  importMapping,
  importRun,
  INCOME_TYPES,
  inboxItem,
  payee,
  payslip,
  type payslipIntake,
  receipt,
  receiptSplit,
} from '../schema';
import { history, type AuditContext, type AuditEntry, type Snapshot } from './audit';
import { updateBooking } from './bookings';
import { assertContactBookingWrite } from './contact-invariants';
import { ConflictError } from './errors';
import { assertTradeSettlementBookingWrite } from './invariants';
import { assertStatementBookingWrite } from './statement-settlement-invariants';
import type { Executor } from './types';

type Source = typeof payslipIntake.$inferSelect & { parsed: ParsedPayrollDocument };
export type PayoutSplitContext = {
  accountId: string | null;
  payoutDate: string | null;
  expectedOccurrenceId: string | null;
};
export type PayoutSplitPreview = {
  status: 'eligible' | 'already_correct' | 'locked' | 'unavailable';
  token?: string;
  salaryCents?: number;
  reimbursementsCents?: number;
};
const unavailable: PayoutSplitPreview = { status: 'unavailable' };

/** Require complete original SQL-column snapshots, including identities and unrelated metadata. */
function originalSnapshot(
  columns: Record<string, { name: string }>,
  row: Record<string, unknown>,
  snapshot: Snapshot | null,
) {
  const current = Object.fromEntries(
    Object.entries(columns).map(([prop, column]) => [column.name, row[prop] ?? null]),
  );
  return snapshot !== null && isDeepStrictEqual(current, snapshot);
}

/** Project only mapping evidence. Neither credentials nor credential-bearing audit JSON is read. */
function mappingSnapshot(column: SQLWrapper) {
  return sql<string | null>`CASE WHEN ${column} IS NULL THEN NULL ELSE json_object(
    'id', json_extract(${column}, '$.id'),
    'consent_id', json_extract(${column}, '$.consent_id'),
    'currency', json_extract(${column}, '$.currency'),
    'account_id', json_extract(${column}, '$.account_id'),
    'from_date', json_extract(${column}, '$.from_date'),
    'last_sync_at', json_extract(${column}, '$.last_sync_at'),
    'complete', (json_type(${column}, '$.id') IS NOT NULL
      AND json_type(${column}, '$.consent_id') IS NOT NULL
      AND json_type(${column}, '$.currency') IS NOT NULL
      AND json_type(${column}, '$.account_id') IS NOT NULL
      AND json_type(${column}, '$.from_date') IS NOT NULL
      AND json_type(${column}, '$.last_sync_at') IS NOT NULL)
  ) END`;
}

/** Additional bank proof is limited to a fresh provider stage followed by explicit confirmation. */
function originalBankProof(
  db: Executor,
  payout: typeof booking.$inferSelect,
  creation: AuditEntry,
) {
  if (
    !payout.bankSourceId ||
    payout.importRunId ||
    payout.status !== 'confirmed' ||
    !/^bank-sync:[a-f0-9]{64}$/.test(payout.importKey ?? '') ||
    creation.actor !== 'owner'
  )
    return;
  const candidate = db
    .select()
    .from(bankSyncCandidate)
    .where(
      and(
        eq(bankSyncCandidate.accountId, payout.accountId),
        eq(bankSyncCandidate.dedupeKey, payout.importKey!.slice('bank-sync:'.length)),
      ),
    )
    .get();
  if (
    !candidate ||
    candidate.bankStatus !== 'booked' ||
    candidate.sourceId !== payout.bankSourceId ||
    candidate.date !== payout.date ||
    candidate.amountCents !== payout.amountCents ||
    candidate.currency !== payout.currency ||
    candidate.memo !== payout.bankRawText ||
    candidate.rawPayee !== payout.bankRawPayee
  )
    return;
  const candidateHistory = history(db, 'bank_sync_candidate', candidate.id);
  const staged = candidateHistory[0];
  if (
    candidateHistory.length !== 1 ||
    !staged ||
    staged.action !== 'create' ||
    staged.before !== null ||
    staged.undoOfId ||
    staged.actor !== 'bank-sync' ||
    !staged.groupId ||
    !originalSnapshot(getTableColumns(bankSyncCandidate), candidate, staged.after)
  )
    return;
  // A later provider change leaves the retained candidate intact and opens a separate warning.
  const position = (id: string) =>
    db
      .select({ value: sql<number>`rowid` })
      .from(auditLog)
      .where(eq(auditLog.id, id))
      .get()!.value;
  const stagedAt = position(staged.id),
    createdAt = position(creation.id);
  if (stagedAt >= createdAt) return;
  const warningId = `bank-changed:${candidate.id}`;
  if (
    db.select({ id: inboxItem.id }).from(inboxItem).where(eq(inboxItem.id, warningId)).get() ||
    history(db, 'inbox_item', warningId).length
  )
    return;
  const mapping = db
    .select({
      id: bankSyncAccount.id,
      consentId: bankSyncAccount.consentId,
      currency: bankSyncAccount.currency,
      accountId: bankSyncAccount.accountId,
      fromDate: bankSyncAccount.fromDate,
      lastSyncAt: bankSyncAccount.lastSyncAt,
    })
    .from(bankSyncAccount)
    .where(eq(bankSyncAccount.id, candidate.sourceId!))
    .get();
  if (
    !mapping ||
    mapping.accountId !== payout.accountId ||
    mapping.currency !== 'EUR' ||
    !mapping.fromDate ||
    mapping.fromDate > candidate.date ||
    !mapping.lastSyncAt
  )
    return;
  const mappingHistory = db
    .select({
      id: auditLog.id,
      position: sql<number>`rowid`,
      action: auditLog.action,
      actor: auditLog.actor,
      groupId: auditLog.groupId,
      undoOfId: auditLog.undoOfId,
      before: mappingSnapshot(auditLog.beforeJson),
      after: mappingSnapshot(auditLog.afterJson),
    })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, 'bank_sync_account'), eq(auditLog.entityId, mapping.id)))
    .orderBy(sql`rowid`)
    .all()
    .map((entry) => ({
      ...entry,
      before: entry.before ? (JSON.parse(entry.before) as Snapshot) : null,
      after: entry.after ? (JSON.parse(entry.after) as Snapshot) : null,
    }));
  const initial = mappingHistory[0],
    mapped = mappingHistory[1];
  const safe = {
    id: mapping.id,
    consent_id: mapping.consentId,
    currency: mapping.currency,
    account_id: mapping.accountId,
    from_date: mapping.fromDate,
    last_sync_at: mapping.lastSyncAt,
    complete: 1,
  };
  const blank = { ...safe, account_id: null, from_date: null, last_sync_at: null };
  const selected = { ...safe, last_sync_at: null };
  if (
    !initial ||
    !mapped ||
    mappingHistory.length < 3 ||
    initial.action !== 'create' ||
    initial.before !== null ||
    initial.undoOfId ||
    initial.actor !== 'owner' ||
    !initial.groupId ||
    !isDeepStrictEqual(initial.after, blank) ||
    mapped.action !== 'update' ||
    mapped.undoOfId ||
    mapped.actor !== 'owner' ||
    !mapped.groupId ||
    !isDeepStrictEqual(mapped.before, blank) ||
    !isDeepStrictEqual(mapped.after, selected) ||
    mapped.position >= stagedAt
  )
    return;
  // Exactly one initial map; subsequent provider refreshes may advance only the watermark in this projection.
  for (let i = 2; i < mappingHistory.length; i++) {
    const entry = mappingHistory[i]!;
    if (
      entry.action !== 'update' ||
      entry.undoOfId ||
      entry.actor !== 'bank-sync' ||
      !isDeepStrictEqual(entry.before, mappingHistory[i - 1]!.after) ||
      !entry.after ||
      !isDeepStrictEqual({ ...entry.after, last_sync_at: null }, selected)
    )
      return;
  }
  if (
    !isDeepStrictEqual(mappingHistory.at(-1)!.after, safe) ||
    !mappingHistory
      .slice(2)
      .some(
        (entry) =>
          entry.groupId === staged.groupId &&
          entry.after?.['last_sync_at'] &&
          entry.position > stagedAt &&
          entry.position < createdAt,
      )
  )
    return;
  const consent = db
    .select({ id: bankSyncConsent.id, status: bankSyncConsent.status })
    .from(bankSyncConsent)
    .where(eq(bankSyncConsent.id, mapping.consentId))
    .get();
  if (!consent || !['active', 'error'].includes(consent.status)) return;
  // Callback activation and provider-account creation are one audited action; select no secret fields.
  const activation = db
    .select({ id: auditLog.id, position: sql<number>`rowid` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'bank_sync_consent'),
        eq(auditLog.entityId, consent.id),
        eq(auditLog.groupId, initial.groupId),
        eq(auditLog.actor, 'owner'),
        eq(auditLog.action, 'update'),
        isNull(auditLog.undoOfId),
        eq(sql`json_extract(${auditLog.beforeJson}, '$.status')`, 'pending'),
        eq(sql`json_extract(${auditLog.afterJson}, '$.status')`, 'active'),
      ),
    )
    .get();
  if (!activation || activation.position >= initial.position) return;
  const item = db.select().from(inboxItem).where(eq(inboxItem.id, candidate.id)).get();
  const itemHistory = history(db, 'inbox_item', candidate.id);
  const decision = itemHistory[0],
    original = itemHistory[1];
  if (
    !item ||
    item.kind !== 'import' ||
    item.refType !== 'bank-sync-candidate' ||
    item.refId !== candidate.id ||
    !item.resolvedAt ||
    item.resolution !== `Bestätigt: ${payout.id}` ||
    itemHistory.length !== 2 ||
    !original ||
    original.action !== 'create' ||
    original.before !== null ||
    original.undoOfId ||
    original.actor !== 'bank-sync' ||
    original.groupId !== staged.groupId ||
    !original.after ||
    original.after['resolved_at'] !== null ||
    original.after['resolution'] !== null ||
    !decision ||
    decision.action !== 'update' ||
    decision.undoOfId ||
    decision.actor !== 'owner' ||
    decision.groupId !== creation.groupId ||
    !isDeepStrictEqual(decision.before, original.after) ||
    !originalSnapshot(getTableColumns(inboxItem), item, decision.after) ||
    position(original.id) <= stagedAt ||
    position(original.id) >= createdAt ||
    position(decision.id) <= createdAt
  )
    return;
  const consentHistory = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, 'bank_sync_consent'), eq(auditLog.entityId, consent.id)))
    .orderBy(sql`rowid`)
    .all();
  return {
    candidate,
    candidateHistory: candidateHistory.map((entry) => entry.id),
    mapping,
    mappingHistory,
    consent,
    activation,
    consentHistory,
    item,
    itemHistory: itemHistory.map((entry) => entry.id),
  };
}

/** Read-only eligibility for an explicit action; amount/date matching alone never authorizes it. */
export function previewPayslipPayoutSplit(
  db: Executor,
  source: Source,
  bookingId: string,
  context: PayoutSplitContext,
): PayoutSplitPreview {
  const payout = db
    .select()
    .from(booking)
    .where(and(eq(booking.id, bookingId), isNull(booking.deletedAt)))
    .get();
  if (!payout) return unavailable;
  if (payout.status === 'reconciled') return { status: 'locked' };
  const parsed = source.parsed;
  const draft = parsed.draft;
  if (
    !draft ||
    source.status !== 'pending' ||
    parsed.documentType !== 'payslip' ||
    parsed.parserVersion !== PAYSLIP_PARSER_VERSION ||
    parsed.periodSource !== 'content' ||
    parsed.warnings.length ||
    parsed.unmappedWageTypes?.length ||
    !context.payoutDate ||
    !parsed.payoutDate ||
    context.payoutDate !== parsed.payoutDate ||
    !Number.isFinite(Date.parse(context.payoutDate)) ||
    !Number.isFinite(Date.parse(payout.date)) ||
    context.accountId !== payout.accountId ||
    payout.currency !== 'EUR' ||
    payout.amountCents !== draft.netCents ||
    payout.amountCents <= 0 ||
    payout.transferId ||
    payout.projectId ||
    payout.originalAmountCents !== null ||
    Math.abs(Date.parse(payout.date) - Date.parse(context.payoutDate)) > 5 * 86_400_000
  )
    return unavailable;
  const totals = payrollTotals([draft]);
  const difference = totals.calculatedNetCents - draft.netCents;
  const salaryCents = draft.netCents - totals.reimbursementsCents;
  if (
    !Number.isSafeInteger(difference) ||
    Math.abs(difference) > 1 ||
    difference !== parsed.differenceCents ||
    !Number.isSafeInteger(salaryCents) ||
    salaryCents <= 0 ||
    !Number.isSafeInteger(totals.reimbursementsCents) ||
    totals.reimbursementsCents < 0 ||
    !payslipInput.safeParse({
      ...draft,
      lines: [
        ...draft.lines,
        ...(difference
          ? [
              {
                section: 'deduction',
                label: 'Rundung (Summenprüfung)',
                amountCents: difference,
              },
            ]
          : []),
      ],
    }).success
  )
    return unavailable;
  const target = db.select().from(account).where(eq(account.id, payout.accountId)).get();
  const original = db.select().from(receipt).where(eq(receipt.id, source.receiptId)).get();
  const configRow = db.select().from(appSetting).where(eq(appSetting.id, 'payslip.source')).get();
  let config: ReturnType<typeof payslipSourceConfig.parse> | undefined;
  try {
    config = configRow ? payslipSourceConfig.parse(JSON.parse(configRow.value)) : undefined;
  } catch {
    return unavailable;
  }
  const sender = payout.payeeId
    ? db.select().from(payee).where(eq(payee.id, payout.payeeId)).get()
    : undefined;
  if (
    !target ||
    target.deletedAt ||
    target.closedAt ||
    target.currency !== 'EUR' ||
    payout.date < target.openingDate ||
    !original ||
    original.deletedAt ||
    original.mime !== 'application/pdf' ||
    original.sha256 !== source.sha256 ||
    !Number.isSafeInteger(original.sizeBytes) ||
    original.sizeBytes <= 0 ||
    original.sizeBytes > 15 * 1024 * 1024 ||
    !config ||
    config.salaryAccountId !== payout.accountId ||
    !config.automation ||
    config.automation.payeeId !== payout.payeeId ||
    !sender ||
    sender.deletedAt ||
    sender.systemKind
  )
    return unavailable;
  const splits = db
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const salaryType = draft.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id;
  const plain = (split: typeof bookingSplit.$inferSelect) =>
    !split.categoryId && !split.contactId && !split.transferId && !split.memo;
  if (
    splits.length === (totals.reimbursementsCents ? 2 : 1) &&
    splits.every(plain) &&
    splits[0]?.incomeTypeId === salaryType &&
    splits[0].amountCents === salaryCents &&
    (!totals.reimbursementsCents ||
      (splits[1]?.incomeTypeId === INCOME_TYPES.refund.id &&
        splits[1].amountCents === totals.reimbursementsCents))
  )
    return { status: 'already_correct' };
  // Only a single untouched original salary lump is a supported normalization source.
  if (
    splits.length !== 1 ||
    !plain(splits[0]!) ||
    splits[0]!.incomeTypeId !== salaryType ||
    splits[0]!.amountCents !== payout.amountCents
  )
    return unavailable;
  const bookingHistory = history(db, 'booking', bookingId);
  const creation = bookingHistory[0];
  if (
    bookingHistory.length !== 1 ||
    !creation ||
    creation.action !== 'create' ||
    creation.before !== null ||
    creation.undoOfId ||
    !creation.groupId ||
    !originalSnapshot(getTableColumns(booking), payout, creation.after)
  )
    return unavailable;
  let run: typeof importRun.$inferSelect | undefined;
  let mapping: typeof importMapping.$inferSelect | undefined;
  let bankProof: ReturnType<typeof originalBankProof>;
  if (['import', 'migration'].includes(payout.source)) {
    // Preserve the existing committed-import contract unchanged.
    if (!payout.importRunId || !payout.importKey) return unavailable;
    run = db.select().from(importRun).where(eq(importRun.id, payout.importRunId)).get();
    mapping = run?.mappingVersion
      ? db
          .select()
          .from(importMapping)
          .where(
            and(
              eq(importMapping.importRunId, run.id),
              eq(importMapping.version, run.mappingVersion),
            ),
          )
          .get()
      : undefined;
    if (
      !run ||
      run.status !== 'committed' ||
      !run.committedAt ||
      run.revertedAt ||
      !['ynab', 'bank', 'csv'].includes(run.source) ||
      !mapping ||
      creation.groupId !== `import:${run.id}`
    )
      return unavailable;
  } else if (payout.source === 'manual') {
    // A direct original create has no adopted bank/import identity. Later edits/Undo failed above.
    if (
      payout.importRunId ||
      payout.importKey ||
      payout.bankSourceId ||
      payout.bankRawText !== null ||
      payout.bankRawPayee !== null
    )
      return unavailable;
  } else if (payout.source === 'bank') {
    bankProof = originalBankProof(db, payout, creation);
    if (!bankProof) return unavailable;
  } else return unavailable;
  // Query all historical children, including originals later removed/recreated or moved away.
  const childHistory = db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'booking_split'),
        or(
          eq(sql`json_extract(${auditLog.beforeJson}, '$.booking_id')`, bookingId),
          eq(sql`json_extract(${auditLog.afterJson}, '$.booking_id')`, bookingId),
        ),
      ),
    )
    .all();
  if (
    childHistory.length !== splits.length ||
    childHistory.some((entry) => {
      const split = splits.find((item) => item.id === entry.entityId);
      if (
        !split ||
        entry.action !== 'create' ||
        entry.beforeJson !== null ||
        entry.undoOfId ||
        entry.groupId !== creation.groupId ||
        !entry.afterJson
      )
        return true;
      try {
        return !originalSnapshot(
          getTableColumns(bookingSplit),
          split,
          JSON.parse(entry.afterJson) as Snapshot,
        );
      } catch {
        return true;
      }
    })
  )
    return unavailable;
  if (
    db.select().from(payslip).where(eq(payslip.bookingId, bookingId)).get() ||
    db.select().from(expectedOccurrence).where(eq(expectedOccurrence.bookingId, bookingId)).get() ||
    db.select().from(bookingReceipt).where(eq(bookingReceipt.bookingId, bookingId)).get() ||
    db
      .select()
      .from(receiptSplit)
      .where(
        inArray(
          receiptSplit.splitId,
          splits.map((split) => split.id),
        ),
      )
      .get()
  )
    return unavailable;
  // Refuse a consumed-and-undone association too; returning to equal values is not fresh provenance.
  const priorAssociation = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      or(
        and(
          inArray(auditLog.entityType, [
            'expected_occurrence',
            'statement_settlement',
            'statement_bonus',
            'statement_automation_run',
          ]),
          sql`(instr(coalesce(${auditLog.beforeJson}, ''), ${bookingId}) > 0 OR instr(coalesce(${auditLog.afterJson}, ''), ${bookingId}) > 0)`,
        ),
        and(
          eq(auditLog.entityType, 'receipt_split'),
          or(
            inArray(
              sql`json_extract(${auditLog.beforeJson}, '$.split_id')`,
              splits.map((split) => split.id),
            ),
            inArray(
              sql`json_extract(${auditLog.afterJson}, '$.split_id')`,
              splits.map((split) => split.id),
            ),
          ),
        ),
      ),
    )
    .get();
  if (priorAssociation) return unavailable;
  try {
    assertStatementBookingWrite(db, bookingId, 'update', ['splits']);
    assertTradeSettlementBookingWrite(db, bookingId, 'update', ['splits']);
    assertContactBookingWrite(db, bookingId, 'update', ['splits']);
  } catch {
    return unavailable;
  }
  const occurrence = context.expectedOccurrenceId
    ? db
        .select()
        .from(expectedOccurrence)
        .where(eq(expectedOccurrence.id, context.expectedOccurrenceId))
        .get()
    : null;
  const expected = occurrence
    ? db
        .select()
        .from(expectedPayment)
        .where(eq(expectedPayment.id, occurrence.expectedPaymentId))
        .get()
    : null;
  if (
    context.expectedOccurrenceId &&
    (!occurrence ||
      occurrence.deletedAt ||
      occurrence.bookingId ||
      occurrence.status !== 'expected' ||
      !expected ||
      expected.deletedAt ||
      expected.kind !== 'inflow' ||
      expected.accountId !== target.id ||
      expected.incomeTypeId !== salaryType ||
      occurrence.dueDate.slice(0, 7) !== draft.month)
  )
    return unavailable;
  const stamp = (table: string, id: string) => history(db, table, id).map((entry) => entry.id);
  const token = createHash('sha256')
    .update(
      JSON.stringify({
        source,
        context,
        payout,
        splits,
        original,
        target,
        sender,
        configRow,
        run,
        mapping,
        bankProof,
        occurrence,
        expected,
        bookingHistory: bookingHistory.map((entry) => entry.id),
        childHistory: childHistory.map((entry) => entry.id).sort(),
        sourceHistory: stamp('payslip_intake', source.id),
        receiptHistory: stamp('receipt', original.id),
        accountHistory: stamp('account', target.id),
        senderHistory: stamp('payee', sender.id),
        configHistory: stamp('app_setting', 'payslip.source'),
        occurrenceHistory: occurrence ? stamp('expected_occurrence', occurrence.id) : [],
        expectedHistory: expected ? stamp('expected_payment', expected.id) : [],
      }),
    )
    .digest('hex');
  return {
    status: 'eligible',
    token,
    salaryCents,
    reimbursementsCents: totals.reimbursementsCents,
  };
}

/** Called inside the existing intake decision transaction and its one financial audit group. */
export function applyPayslipPayoutSplit(
  db: Executor,
  source: Source,
  bookingId: string,
  context: PayoutSplitContext,
  token: string,
  ctx: AuditContext,
) {
  const preview = previewPayslipPayoutSplit(db, source, bookingId, context);
  if (preview.status !== 'eligible' || preview.token !== token)
    throw new ConflictError(
      'Die Auszahlung oder der Nachweis wurde geändert. Bitte die Aufteilung neu prüfen.',
    );
  updateBooking(
    db,
    bookingId,
    {
      splits: [
        {
          categoryId: null,
          incomeTypeId:
            source.parsed.draft!.kind === 'special'
              ? INCOME_TYPES.special.id
              : INCOME_TYPES.salary.id,
          amountCents: preview.salaryCents!,
        },
        ...(preview.reimbursementsCents
          ? [
              {
                categoryId: null,
                incomeTypeId: INCOME_TYPES.refund.id,
                amountCents: preview.reimbursementsCents,
              },
            ]
          : []),
      ],
    },
    ctx,
  );
}
