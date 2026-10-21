import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  matchesAssignment,
  planCardRows,
  type CardAssignment,
  type CardBookingCandidate,
  type StatementAutomationConfig,
  type StatementAutomationConfigInput,
  type StatementAutomationExecution,
  type StatementAutomationOutcome,
  type StatementAutomationPreparation,
  type StatementAutomationSource,
  type StatementCas,
} from '@budget/domain';
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
  statementSettlement,
  statementBonus,
  statementSettlementConfig,
  expectedPayment,
  expectedPaymentVersion,
} from '../schema';
import {
  statementAutomationConfig,
  statementAutomationRow,
  statementAutomationRun,
} from '../schema/statement-automation';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { createBooking } from './bookings';
import { listAssignmentRules } from './assignment-rules';
import { assertStatementCas, getStatementIntake } from './statement-intake';
import {
  statementRevision,
  assertStatementSettlementInvariants,
} from './statement-settlement-invariants';
import { planMachineSettlement, executeMachineSettlement } from './statement-automation-settlement';
import { assertStatementAutomationInvariants } from './statement-automation-invariants';
import { linkReceipt } from './receipts';
import { ConflictError } from './errors';
import { runInTransaction, type Executor } from './types';

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-AT');
const scheduledPayment = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }).strict(),
    z.object({ mode: z.literal('existing'), paymentId: z.string().uuid() }).strict(),
  ])
  .nullable();
const configInput = z
  .object({
    accountId: z.string().uuid(),
    expectedRevision: z.string().nullable(),
    enabled: z.boolean(),
    scheduledPayment,
    mappedCards: z
      .array(
        z
          .object({ token: z.string().regex(/^[a-f0-9]{64}$/), accountId: z.string().uuid() })
          .strict(),
      )
      .max(64),
  })
  .strict();
function cardAccount(db: Executor, id: string) {
  const row = db.select().from(account).where(eq(account.id, id)).get();
  if (!row || row.deletedAt || row.closedAt || row.type !== 'credit_card')
    throw new ConflictError('Bitte eine offene Kreditkarte wählen.');
  return row;
}
export function readStatementAutomationConfig(
  db: Executor,
  accountId: string,
): StatementAutomationConfig {
  cardAccount(db, accountId);
  const row = db
    .select()
    .from(statementAutomationConfig)
    .where(eq(statementAutomationConfig.accountId, accountId))
    .get();
  const mappedCards =
    row && !row.deletedAt
      ? configInput.shape.mappedCards.parse(JSON.parse(row.mappedCardsJson))
      : [];
  const enabled = !!row && !row.deletedAt && row.enabled;
  const revision = row ? statementRevision(db, 'statement_automation_config', accountId) : null;
  const scheduled =
    row && !row.deletedAt ? scheduledPayment.parse(JSON.parse(row.scheduledPaymentJson)) : null;
  return {
    accountId,
    enabled,
    revision,
    mappedCards,
    scheduledPayment: scheduled,
    mappingKey: hash([accountId, revision, enabled, mappedCards, scheduled]),
  };
}
export function saveStatementAutomationConfig(
  db: Executor,
  raw: StatementAutomationConfigInput,
  ctx: AuditContext,
) {
  const input = configInput.parse(raw),
    group = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = readStatementAutomationConfig(tx, input.accountId);
    if (current.revision !== input.expectedRevision)
      throw new ConflictError('Zuordnung wurde geändert. Bitte neu laden.');
    // This version deliberately supports one source account only. Unknown/multiple card accounts stay review work.
    if (
      new Set(input.mappedCards.map((m) => m.token)).size !== input.mappedCards.length ||
      input.mappedCards.some((m) => m.accountId !== input.accountId)
    )
      throw new ConflictError('Karten eindeutig dem ausgewählten Konto zuordnen.');
    if (input.scheduledPayment?.mode === 'existing') {
      const cfg = tx
        .select()
        .from(statementSettlementConfig)
        .where(eq(statementSettlementConfig.cardAccountId, input.accountId))
        .get();
      const payment = tx
        .select()
        .from(expectedPayment)
        .where(eq(expectedPayment.id, input.scheduledPayment.paymentId))
        .get();
      const versions = tx
        .select()
        .from(expectedPaymentVersion)
        .where(
          and(
            eq(expectedPaymentVersion.expectedPaymentId, input.scheduledPayment.paymentId),
            isNull(expectedPaymentVersion.deletedAt),
          ),
        )
        .all();
      if (
        !cfg ||
        cfg.deletedAt ||
        !cfg.enabled ||
        !payment ||
        payment.deletedAt ||
        payment.kind !== 'outflow' ||
        payment.accountId !== cfg.fundingAccountId ||
        !versions.length ||
        versions.some((v) => v.currency !== cardAccount(tx, input.accountId).currency)
      )
        throw new ConflictError(
          'Bestehende Abbuchung benötigt das konfigurierte Einzugskonto und dieselbe Währung.',
        );
    }
    const values = {
      enabled: input.enabled,
      scheduledPaymentJson: JSON.stringify(input.scheduledPayment),
      mappedCardsJson: JSON.stringify(input.mappedCards),
      deletedAt: null,
    };
    const old = tx
      .select()
      .from(statementAutomationConfig)
      .where(eq(statementAutomationConfig.accountId, input.accountId))
      .get();
    if (old) updateTracked(tx, statementAutomationConfig, [input.accountId], values, group);
    else
      insertTracked(
        tx,
        statementAutomationConfig,
        { accountId: input.accountId, ...values },
        group,
      );
    return { config: readStatementAutomationConfig(tx, input.accountId), groupId: group.groupId };
  });
}
function source(db: Executor, id: string, cas?: StatementCas): StatementAutomationSource {
  const view = cas ? assertStatementCas(db, id, cas) : getStatementIntake(db, id);
  const original = db.select().from(receipt).where(eq(receipt.id, view.receiptId)).get();
  if (
    view.deletedAt ||
    !original ||
    original.deletedAt ||
    original.sha256 !== view.sha256 ||
    !view.revision
  )
    throw new ConflictError('Abrechnungsquelle nicht verfügbar.');
  return {
    intakeId: id,
    revision: view.revision,
    sha256: view.sha256,
    accountId: view.accountId,
    receiptId: view.receiptId,
    sizeBytes: original.sizeBytes,
    issueDate: view.proposal.fields.issueDate.value,
  };
}
export function prepareStatementAutomation(
  db: Executor,
  intakeId: string,
  cas: StatementCas,
): StatementAutomationPreparation {
  const current = source(db, intakeId, cas),
    config = readStatementAutomationConfig(db, current.accountId);
  const a = cardAccount(db, current.accountId),
    view = getStatementIntake(db, intakeId),
    reasons: string[] = [];
  if (view.status !== 'pending' || view.proposal.draft) reasons.push('source_review_required');
  if (!config.enabled || !config.revision) reasons.push('automation_not_enabled');
  // This selects an I/O candidate, NOT trusted previous-source proof. The service re-extracts it.
  const eligible = db
    .select({ id: statementIntake.id })
    .from(statementIntake)
    .where(and(eq(statementIntake.accountId, current.accountId), isNull(statementIntake.deletedAt)))
    .all()
    .filter((s) => s.id !== intakeId)
    .map((s) => getStatementIntake(db, s.id))
    .filter(
      (s) =>
        s.status !== 'rejected' &&
        s.proposal.fields.issueDate.origin === 'printed' &&
        s.proposal.fields.currency.origin === 'printed' &&
        s.proposal.fields.currency.value === a.currency &&
        s.proposal.fields.payableCents.origin === 'printed' &&
        s.proposal.fields.payableCents.value !== null &&
        !!s.proposal.fields.issueDate.value &&
        !!current.issueDate &&
        s.proposal.fields.issueDate.value < current.issueDate,
    )
    .sort((x, y) =>
      y.proposal.fields.issueDate.value!.localeCompare(x.proposal.fields.issueDate.value!),
    );
  const latest = eligible[0]?.proposal.fields.issueDate.value;
  const previous =
    latest && eligible.filter((s) => s.proposal.fields.issueDate.value === latest).length === 1
      ? source(db, eligible[0]!.id)
      : null;
  if (!previous) reasons.push('previous_source_required');
  return {
    source: current,
    config,
    previous,
    reasons,
    settlementConfigRevision: statementRevision(
      db,
      'statement_settlement_config',
      current.accountId,
    ),
    context: {
      accountId: a.id,
      currency: a.currency,
      mappingKey: config.mappingKey,
      mappedCardAccounts: Object.fromEntries(config.mappedCards.map((m) => [m.token, m.accountId])),
    },
  };
}
export function readStatementAutomationOutcome(
  db: Executor,
  intakeId: string,
): StatementAutomationOutcome | null {
  const run = db
    .select()
    .from(statementAutomationRun)
    .where(eq(statementAutomationRun.sourceIntakeId, intakeId))
    .all()
    .at(-1);
  if (!run) return null;
  const result = JSON.parse(run.resultJson) as StatementAutomationOutcome;
  const rows = db
    .select()
    .from(statementAutomationRow)
    .where(eq(statementAutomationRow.runId, run.id))
    .all();
  const settlements = db
    .select()
    .from(statementSettlement)
    .where(eq(statementSettlement.sourceIntakeId, intakeId))
    .all()
    .filter((s) => (JSON.parse(s.originsJson) as { runId?: string }).runId === run.id);
  const liveRows = rows.filter((r) => !r.deletedAt),
    liveSettlements = settlements.filter(
      (s) => !s.deletedAt && !['withdrawn', 'superseded'].includes(s.state),
    );
  const items: NonNullable<StatementAutomationOutcome['items']> = [];
  for (const r of liveRows) {
    items.push({
      bookingId: r.bookingId,
      accountId: r.accountId,
      role: r.kind === 'created' ? 'created' : r.kind === 'linked' ? 'matched' : 'credit',
    });
    if (r.originalBookingId)
      items.push({ bookingId: r.originalBookingId, accountId: r.accountId, role: 'original' });
  }
  for (const s of liveSettlements)
    if (s.state === 'represented') {
      items.push(
        { bookingId: s.fromBookingId!, accountId: s.fundingAccountId, role: 'settlement' },
        { bookingId: s.toBookingId!, accountId: s.cardAccountId, role: 'settlement' },
      );
    }
  const liveIds = new Set(
    items.length
      ? db
          .select({ id: booking.id })
          .from(booking)
          .where(
            and(
              inArray(
                booking.id,
                items.map((i) => i.bookingId),
              ),
              isNull(booking.deletedAt),
            ),
          )
          .all()
          .map((b) => b.id)
      : [],
  );
  return {
    ...result,
    items: items.filter((i) => liveIds.has(i.bookingId)),
    status:
      (rows.length || settlements.length) && !liveRows.length && !liveSettlements.length
        ? 'undone'
        : result.status,
  };
}
function candidates(db: Executor, input: StatementAutomationExecution): CardBookingCandidate[] {
  const dates = [
    ...new Set(input.document.rows.flatMap((row) => (row.bookingDate ? [row.bookingDate] : []))),
  ];
  if (!dates.length) return [];
  const bookings = db
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.accountId, input.source.accountId),
        isNull(booking.deletedAt),
        gte(booking.date, [...dates].sort()[0]!),
        lte(booking.date, input.document.identity?.issueDate ?? [...dates].sort().at(-1)!),
      ),
    )
    .all();
  if (!bookings.length) return [];
  const ids = bookings.map((b) => b.id),
    splitRows = db.select().from(bookingSplit).where(inArray(bookingSplit.bookingId, ids)).all();
  const splits = new Map<string, typeof splitRows>();
  for (const s of splitRows) {
    const own = splits.get(s.bookingId) ?? [];
    own.push(s);
    splits.set(s.bookingId, own);
  }
  const categoryIds = [...new Set(splitRows.flatMap((s) => (s.categoryId ? [s.categoryId] : [])))];
  const expenseCategories = new Set(
    (categoryIds.length
      ? db
          .select()
          .from(category)
          .where(and(inArray(category.id, categoryIds), isNull(category.deletedAt)))
          .all()
      : []
    )
      .filter((c) => c.class !== null && !['income', 'card_payment', 'advance'].includes(c.kind))
      .map((c) => c.id),
  );
  const payeeIds = [...new Set(bookings.flatMap((b) => (b.payeeId ? [b.payeeId] : [])))];
  const names = new Map(
    (payeeIds.length
      ? db
          .select()
          .from(payee)
          .where(and(inArray(payee.id, payeeIds), isNull(payee.deletedAt)))
          .all()
      : []
    ).map((p) => [p.id, p.name]),
  );
  const consumedSplits = new Set<string>();
  for (const r of db
    .select()
    .from(statementBonus)
    .all()
    .filter((r) => !r.deletedAt && !['withdrawn', 'superseded'].includes(r.state))) {
    const evidence = JSON.parse(r.evidenceJson) as { selectedOriginals: { splitId: string }[] };
    for (const original of evidence.selectedOriginals) consumedSplits.add(original.splitId);
  }
  const consumedBookings = new Set(
    db
      .select()
      .from(statementAutomationRow)
      .all()
      .filter((r) => !r.deletedAt && r.kind === 'rebate')
      .map((r) => r.originalBookingId),
  );
  const revisions = new Map<string, string>();
  for (const r of db
    .select({ id: auditLog.id, type: auditLog.entityType, entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.entityType, ['booking', 'booking_split']),
        inArray(auditLog.entityId, [...ids, ...splitRows.map((s) => s.id)]),
      ),
    )
    .orderBy(desc(sql`rowid`))
    .all()) {
    const key = `${r.type}:${r.entityId}`;
    if (!revisions.has(key)) revisions.set(key, r.id);
  }
  return bookings.map((b) => {
    const own = splits.get(b.id) ?? [],
      single =
        own.length === 1 &&
        !b.transferId &&
        !own[0]!.transferId &&
        !own[0]!.contactId &&
        !own[0]!.incomeTypeId &&
        expenseCategories.has(own[0]!.categoryId ?? '')
          ? own[0]!
          : null;
    return {
      id: b.id,
      revision: revisions.get(`booking:${b.id}`) ?? '',
      accountId: b.accountId,
      currency: b.currency,
      date: b.date,
      amountCents: b.amountCents,
      counterpartyKey: normalize(
        b.bankRawPayee || (b.payeeId ? names.get(b.payeeId) : '') || b.memo || '',
      ),
      creditCategoryIds:
        b.amountCents > 0
          ? own
              .filter(
                (s) => !s.transferId && !s.contactId && expenseCategories.has(s.categoryId ?? ''),
              )
              .map((s) => s.categoryId!)
          : [],
      rebateConsumed: consumedBookings.has(b.id) || (!!single && consumedSplits.has(single.id)),
      singleExpenseCategoryId: single?.categoryId ?? null,
      singleExpenseSplitId: single?.id ?? null,
      singleExpenseSplitRevision: single
        ? (revisions.get(`booking_split:${single.id}`) ?? null)
        : null,
    };
  });
}
function assignments(db: Executor, input: StatementAutomationExecution): CardAssignment[] {
  const rules = listAssignmentRules(db),
    out: CardAssignment[] = [];
  for (const row of input.document.rows) {
    // Preserve existing ordered-rule semantics: a preceding manual rule is not bypassed.
    const first = rules.find(
      (r) =>
        r.enabled &&
        matchesAssignment(r.match, {
          accountId: input.source.accountId,
          amountCents: row.amountCents,
          payeeId: null,
          rawText: row.description,
          counterparty: row.description,
          source: 'import',
        }),
    );
    if (
      !first?.automatic ||
      !first.actions.categoryId ||
      first.actions.splits ||
      first.actions.transferAccountId ||
      first.actions.incomeTypeId ||
      (first.actions.accountId && first.actions.accountId !== input.source.accountId)
    )
      continue;
    const c = db.select().from(category).where(eq(category.id, first.actions.categoryId)).get();
    if (
      !c ||
      c.deletedAt ||
      c.class === null ||
      ['income', 'card_payment', 'advance'].includes(c.kind)
    )
      continue;
    out.push({ rowKey: row.key, categoryId: c.id, ruleId: first.id, ruleRevision: first.revision });
  }
  return out;
}
function baseOutcome(input: StatementAutomationExecution): StatementAutomationOutcome {
  const hints = [
    ...new Map(
      input.document.rows
        .filter((r) => r.cardToken)
        .map((r) => [r.cardToken, { token: r.cardToken, hint: r.cardHint }]),
    ).values(),
  ];
  return {
    intakeId: input.source.intakeId,
    runId: null,
    groupId: null,
    status: 'review',
    items: [],
    created: 0,
    matched: 0,
    credits: 0,
    receiptLinks: 0,
    pending: [],
    reasons: [],
    suggestedCardTokens: hints.map((h) => h.token),
    suggestedCardHints: hints,
  };
}
/** Only the in-process source-verified service may call this; public request bodies never contain a plan. */
export function performStatementAutomation(
  db: Executor,
  input: StatementAutomationExecution,
  ctx: AuditContext,
): StatementAutomationOutcome {
  const group = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = source(tx, input.source.intakeId, input.source),
      cfg = readStatementAutomationConfig(tx, current.accountId);
    if (
      JSON.stringify(current) !== JSON.stringify(input.source) ||
      cfg.revision !== input.configRevision ||
      !cfg.enabled ||
      input.document.sha256 !== current.sha256 ||
      input.document.accountId !== current.accountId
    )
      throw new ConflictError('Quelle oder Zuordnung wurde geändert. Bitte neu laden.');
    if (input.document.previous) {
      const p = input.document.previous,
        prior = source(tx, p.intakeId, p);
      if (
        prior.accountId !== current.accountId ||
        cfg.mappingKey !== p.mappingKey ||
        prior.sha256 !== p.sha256
      )
        throw new ConflictError('Vorherige Abrechnungsquelle wurde geändert.');
    }
    const view = getStatementIntake(tx, current.intakeId),
      result = baseOutcome(input);
    const old = readStatementAutomationOutcome(tx, current.intakeId);
    // Also block after Undo and after reparse/config changes: never turn a replay into a new post.
    if (old)
      return { ...old, status: old.status === 'undone' ? 'undone' : 'unchanged', groupId: null };
    if (view.status !== 'pending' || view.proposal.draft) {
      result.reasons.push('source_review_required');
      return result;
    }
    if (!input.document.identity) {
      result.reasons.push('identity_required');
      return result;
    }
    const identity = input.document.identity;
    const amended = tx
      .select()
      .from(statementAutomationRun)
      .where(
        and(
          eq(statementAutomationRun.accountId, current.accountId),
          eq(statementAutomationRun.issueDate, identity.issueDate),
        ),
      )
      .all()
      .some((r) => r.sourceSha256 !== current.sha256);
    const sameDaySource = tx
      .select({ id: statementIntake.id })
      .from(statementIntake)
      .where(
        and(eq(statementIntake.accountId, current.accountId), isNull(statementIntake.deletedAt)),
      )
      .all()
      .some(
        (candidate) =>
          candidate.id !== current.intakeId &&
          (() => {
            const prior = getStatementIntake(tx, candidate.id);
            return (
              prior.sha256 !== current.sha256 &&
              prior.proposal.fields.issueDate.origin === 'printed' &&
              prior.proposal.fields.issueDate.value === identity.issueDate
            );
          })(),
      );
    if (amended || sameDaySource || view.proposal.relatedIntakeIds.length) {
      result.reasons.push('possible_amendment');
      return result;
    }
    const a = cardAccount(tx, current.accountId);
    if (
      input.document.summary.fields.currency.value !== a.currency ||
      input.document.rows.some(
        (r) => cfg.mappedCards.find((m) => m.token === r.cardToken)?.accountId !== r.accountId,
      )
    ) {
      result.reasons.push('card_mapping_required');
      return result;
    }
    const settlement = planMachineSettlement(tx, input);
    const actions = planCardRows(input.document, candidates(tx, input), assignments(tx, input));
    result.reasons = [...input.document.reasons];
    const runId = randomUUID(),
      actionable = actions.filter((p) => p.kind !== 'pending');
    for (const action of actions)
      if (action.kind === 'pending')
        result.pending.push({
          rowKey: action.row.key,
          line: action.row.line,
          reason: action.reason,
        });
    if (typeof settlement === 'string' && settlement !== 'settlement_not_applicable')
      result.reasons.push(settlement);
    if (!actionable.length && typeof settlement === 'string') return result;
    // Claim before writes within the same transaction. Unique keys and the source row index protect concurrent deliveries.
    tx.insert(statementAutomationRun)
      .values({
        id: runId,
        key: input.key,
        sourceIntakeId: current.intakeId,
        sourceSha256: current.sha256,
        sourceRevision: current.revision,
        accountId: a.id,
        identityKey: identity.key,
        issueDate: identity.issueDate,
        configRevision: input.configRevision,
        planHash: hash(actions),
        sourceProofJson: JSON.stringify({
          parserVersion: input.document.parserVersion,
          layout: input.document.layout,
          identity: input.document.identity,
          summary: input.document.summary,
          previous: input.document.previous,
          mappingKey: cfg.mappingKey,
        }),
        resultJson: JSON.stringify(result),
        actionGroupId: group.groupId,
      })
      .run();
    for (const action of actionable) {
      const row = action.row;
      if (!row.bookingDate) throw new ConflictError('Unvollständige Buchungsprüfung.');
      let bookingId: string;
      if (action.kind === 'link') {
        bookingId = action.booking.id;
        result.matched++;
      } else {
        const categoryId =
          action.kind === 'create'
            ? action.assignment.categoryId
            : action.booking.singleExpenseCategoryId!;
        const c = tx.select().from(category).where(eq(category.id, categoryId)).get();
        if (
          !c ||
          c.deletedAt ||
          c.class === null ||
          ['income', 'card_payment', 'advance'].includes(c.kind)
        )
          throw new ConflictError('Ausgabenkategorie wurde geändert.');
        const amountCents = action.kind === 'rebate' ? action.creditCents : row.amountCents;
        bookingId = createBooking(
          tx,
          {
            accountId: a.id,
            date: row.bookingDate,
            amountCents,
            currency: row.currency,
            source: 'import',
            status: 'pending',
            memo: row.description,
            importKey: `statement:${current.sha256}:${row.key}:${action.kind}`,
            splits: [
              {
                categoryId,
                amountCents,
                ...(action.kind === 'rebate' ? { incomeTypeId: INCOME_TYPES.refund.id } : {}),
              },
            ],
          },
          group,
        );
        if (action.kind === 'rebate') result.credits++;
        else result.created++;
      }
      const linkedIds = action.kind === 'rebate' ? [bookingId, action.booking.id] : [bookingId];
      for (const linkedId of linkedIds) {
        const edge = tx
          .select()
          .from(bookingReceipt)
          .where(
            and(
              eq(bookingReceipt.bookingId, linkedId),
              eq(bookingReceipt.receiptId, current.receiptId),
            ),
          )
          .get();
        if (!edge || edge.deletedAt) {
          linkReceipt(tx, current.receiptId, linkedId, group);
          result.receiptLinks++;
        }
      }
      insertTracked(
        tx,
        statementAutomationRow,
        {
          id: randomUUID(),
          runId,
          sourceIntakeId: current.intakeId,
          sourceSha256: current.sha256,
          rowKey: row.key,
          accountId: a.id,
          receiptId: current.receiptId,
          bookingId,
          originalBookingId: action.kind === 'rebate' ? action.booking.id : null,
          kind: action.kind === 'create' ? 'created' : action.kind === 'link' ? 'linked' : 'rebate',
          proofJson: JSON.stringify(action),
          actionGroupId: group.groupId,
        },
        group,
      );
    }
    if (typeof settlement !== 'string') {
      const accepted = executeMachineSettlement(tx, input, settlement, runId, group);
      result.receiptLinks += accepted.receiptLinks;
    }
    result.runId = runId;
    result.groupId = group.groupId;
    result.status = result.pending.length || result.reasons.length ? 'review' : 'saved';
    tx.update(statementAutomationRun)
      .set({ resultJson: JSON.stringify(result) })
      .where(eq(statementAutomationRun.id, runId))
      .run();
    assertStatementAutomationInvariants(tx);
    // Accepted machine settlement uses the same final money validator as manual settlement actions.
    assertStatementSettlementInvariants(tx);
    return readStatementAutomationOutcome(tx, current.intakeId)!;
  });
}
