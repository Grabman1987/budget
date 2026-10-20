import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  canonicalStatementAction,
  statementSettlementActionSchema,
  statementPayableState,
  type StatementSettlementAction,
  type StatementActionReceipt,
  type SettlementSource,
  type StatementBonusEvidence,
} from '@budget/domain';
import {
  bookingSplit,
  expectedOccurrence,
  INCOME_TYPES,
  statementSettlementConfig,
  statementSettlement,
  statementBonus,
  statementSettlementDelivery,
} from '../schema';
import {
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
  type GroupedContext,
} from './audit';
import { createBooking, createTransfer } from './bookings';
import { assertStatementCas, mutateStatementIntake } from './statement-intake';
import {
  assertBonusOriginals,
  assertStatementSettlementInvariants,
  bonusEvidence,
  statementActive,
  statementPair,
  statementRevision,
} from './statement-settlement-invariants';
import { ConflictError, BookingInvariantError, EntityNotFoundError } from './errors';
import { upcoming } from './expected';
import { runInTransaction, type Executor } from './types';

type Settlement = typeof statementSettlement.$inferSelect;
type Bonus = typeof statementBonus.$inferSelect;
const conflict = () =>
  new ConflictError(
    'Stand oder Zuordnung wurde geändert. Bitte ausdrücklich neu laden und prüfen.',
  );
const hash = (input: StatementSettlementAction) =>
  createHash('sha256').update(canonicalStatementAction(input)).digest('hex');
function currentRevision(db: Executor, table: string, id: string, expected: string | null) {
  if (statementRevision(db, table, id) !== expected) throw conflict();
}
/** Also used before asynchronous source I/O; the transaction repeats this exact replay check. */
export function replayStatementAction(
  db: Executor,
  raw: unknown,
): StatementActionReceipt | undefined {
  const input = statementSettlementActionSchema.parse(raw);
  const old = db
    .select()
    .from(statementSettlementDelivery)
    .where(eq(statementSettlementDelivery.key, input.key))
    .get();
  if (!old) return undefined;
  if (old.operation !== input.operation || old.requestHash !== hash(input))
    throw new ConflictError('Dieser Sendeschlüssel wurde bereits mit anderen Feldern verwendet.');
  return JSON.parse(old.responseJson) as StatementActionReceipt;
}
function config(db: Executor, cardId: string, revision: string) {
  const row = db
    .select()
    .from(statementSettlementConfig)
    .where(eq(statementSettlementConfig.cardAccountId, cardId))
    .get();
  currentRevision(db, 'statement_settlement_config', cardId, revision);
  if (!row || row.deletedAt || !row.enabled)
    throw new BookingInvariantError('Abrechnungsausgleich ist für diese Karte nicht aktiviert.');
  statementPair(db, row.cardAccountId, row.fundingAccountId);
  return row;
}
function sourceTerms(db: Executor, source: SettlementSource) {
  const s = assertStatementCas(db, source.intakeId, source);
  const f = s.reviewed?.fields;
  if (
    s.status !== 'reviewed' ||
    !f ||
    !f.reference.value ||
    !f.issueDate.value ||
    !f.debitDate.value ||
    !f.currency.value ||
    f.payableCents.value === null
  )
    throw new BookingInvariantError(
      'Bitte den Abrechnungsnachweis einschließlich Referenz, Betrag und Einzugstermin vollständig prüfen.',
    );
  const originsJson = JSON.stringify(f);
  if (Buffer.byteLength(originsJson, 'utf8') > 16384)
    throw new BookingInvariantError('Abrechnungsnachweis ist zu groß.');
  return {
    sourceIntakeId: s.id,
    receiptId: s.receiptId,
    sourceSha256: s.sha256,
    sourceRevision: s.revision,
    cardAccountId: s.accountId,
    reference: f.reference.value,
    issueDate: f.issueDate.value,
    currency: f.currency.value,
    originsJson,
    debitDate: f.debitDate.value,
    payableCents: f.payableCents.value,
  };
}
function checkSourceIdentity(r: Settlement | Bonus, source: SettlementSource) {
  if (
    r.sourceIntakeId !== source.intakeId ||
    r.sourceSha256 !== source.sha256 ||
    r.sourceRevision !== source.revision ||
    r.cardAccountId !== source.accountId
  )
    throw conflict();
}
function settlementCas(db: Executor, id: string, revision: string) {
  const r = db.select().from(statementSettlement).where(eq(statementSettlement.id, id)).get();
  if (!r || r.deletedAt) throw new EntityNotFoundError('statement_settlement', id);
  currentRevision(db, 'statement_settlement', id, revision);
  return r;
}
function bonusCas(db: Executor, id: string, revision: string) {
  const r = db.select().from(statementBonus).where(eq(statementBonus.id, id)).get();
  if (!r || r.deletedAt) throw new EntityNotFoundError('statement_bonus', id);
  currentRevision(db, 'statement_bonus', id, revision);
  return r;
}
const settlementReceipt = (
  db: Executor,
  r: Settlement,
  operation: StatementActionReceipt['operation'],
  groupId: string | null,
): StatementActionReceipt => ({
  operation,
  groupId,
  settlementId: r.id,
  settlementRevision: statementRevision(db, 'statement_settlement', r.id)!,
});
const bonusReceipt = (
  db: Executor,
  r: Bonus,
  operation: StatementActionReceipt['operation'],
  groupId: string | null,
): StatementActionReceipt => ({
  operation,
  groupId,
  bonusId: r.id,
  bonusRevision: statementRevision(db, 'statement_bonus', r.id)!,
});
function legacyIdentity(
  db: Executor,
  legacy: { paymentId: string; dueDate: string } | undefined,
  funding: string,
  currency: string,
) {
  if (!legacy) return { legacyPaymentId: null, legacyDueDate: null };
  const occurrence = upcoming(db, legacy.dueDate, legacy.dueDate).find(
    (o) => o.paymentId === legacy.paymentId && o.dueDate === legacy.dueDate,
  );
  if (
    !occurrence ||
    occurrence.accountId !== funding ||
    occurrence.currency !== currency ||
    occurrence.amountCents >= 0 ||
    occurrence.bookingId ||
    ['skipped', 'missed'].includes(occurrence.status)
  )
    throw new ConflictError(
      'Die ausgewählte bestehende Zahlung muss als offene Abbuchung dieses Kontos überprüft werden.',
    );
  return { legacyPaymentId: legacy.paymentId, legacyDueDate: legacy.dueDate };
}
function confirmSettlement(
  db: Executor,
  input: Extract<StatementSettlementAction, { operation: 'confirm' | 'amend' }>,
  group: GroupedContext,
  supersedesId: string | null = null,
) {
  const terms = sourceTerms(db, input.source),
    cfg = config(db, terms.cardAccountId, input.configRevision);
  const pair = statementPair(db, terms.cardAccountId, cfg.fundingAccountId);
  if (pair.card.currency !== terms.currency)
    throw new BookingInvariantError('Die Abrechnungswährung stimmt nicht mit dem Konto überein.');
  const values = {
    ...terms,
    fundingAccountId: cfg.fundingAccountId,
    ...legacyIdentity(db, input.legacy, cfg.fundingAccountId, terms.currency),
    state: statementPayableState(terms.payableCents) as 'open' | 'zero' | 'credit_manual',
  };
  const duplicate = db
    .select()
    .from(statementSettlement)
    .all()
    .find(
      (r) =>
        statementActive(r.state, r.deletedAt) &&
        (r.sourceIntakeId === terms.sourceIntakeId ||
          (r.cardAccountId === terms.cardAccountId &&
            r.reference === terms.reference &&
            r.issueDate === terms.issueDate)),
    );
  if (duplicate) {
    if (
      !Object.entries(values)
        .filter(([k]) => k !== 'state')
        .every(([k, v]) => duplicate[k as keyof Settlement] === v)
    )
      throw new ConflictError(
        'Abrechnung bereits angenommen. Änderung ausdrücklich als neue Fassung prüfen.',
      );
    return settlementReceipt(db, duplicate, input.operation, null);
  }
  const id = randomUUID();
  insertTracked(db, statementSettlement, { id, ...values, supersedesId }, group);
  return settlementReceipt(
    db,
    db.select().from(statementSettlement).where(eq(statementSettlement.id, id)).get()!,
    input.operation,
    group.groupId,
  );
}
function assertOriginalRequest(
  evidence: StatementBonusEvidence,
  originals: {
    bookingId: string;
    bookingRevision: string;
    splitId: string;
    splitRevision: string;
  }[],
) {
  if (
    originals.length !== evidence.selectedOriginals.length ||
    !originals.every((o) =>
      evidence.selectedOriginals.some(
        (e) =>
          e.bookingId === o.bookingId &&
          e.bookingRevision === o.bookingRevision &&
          e.splitId === o.splitId &&
          e.splitRevision === o.splitRevision,
      ),
    )
  )
    throw conflict();
}
function confirmBonus(
  db: Executor,
  input: Extract<StatementSettlementAction, { operation: 'confirm_bonus' | 'amend_bonus' }>,
  group: GroupedContext,
  supersedesId: string | null = null,
) {
  const accepted = sourceTerms(db, input.source);
  const terms = {
    sourceIntakeId: accepted.sourceIntakeId,
    receiptId: accepted.receiptId,
    sourceSha256: accepted.sourceSha256,
    sourceRevision: accepted.sourceRevision,
    cardAccountId: accepted.cardAccountId,
    reference: accepted.reference,
    issueDate: accepted.issueDate,
    currency: accepted.currency,
    originsJson: accepted.originsJson,
  };
  const cfg = config(db, terms.cardAccountId, input.configRevision);
  if (statementPair(db, terms.cardAccountId, cfg.fundingAccountId).card.currency !== terms.currency)
    throw new BookingInvariantError('Abrechnungswährung stimmt nicht überein.');
  assertBonusOriginals(db, terms.cardAccountId, terms.currency, input.evidence, true);
  const evidenceJson = JSON.stringify(input.evidence);
  const duplicate = db
    .select()
    .from(statementBonus)
    .all()
    .find(
      (r) =>
        statementActive(r.state, r.deletedAt) &&
        (r.sourceIntakeId === terms.sourceIntakeId ||
          (r.cardAccountId === terms.cardAccountId &&
            r.reference === terms.reference &&
            r.issueDate === terms.issueDate)),
    );
  if (duplicate) {
    if (
      duplicate.sourceIntakeId !== terms.sourceIntakeId ||
      duplicate.sourceRevision !== terms.sourceRevision ||
      duplicate.evidenceJson !== evidenceJson
    )
      throw new ConflictError(
        'Gutschriftnachweis bereits angenommen. Änderung ausdrücklich prüfen.',
      );
    return bonusReceipt(db, duplicate, input.operation, null);
  }
  const id = randomUUID();
  insertTracked(
    db,
    statementBonus,
    {
      id,
      ...terms,
      supersedesId,
      bonusCents: input.evidence.bonusCents,
      creditDate: input.evidence.creditDate,
      state: input.evidence.treatment === 'already_net' ? 'already_net' : 'ready',
      evidenceJson,
    },
    group,
  );
  return bonusReceipt(
    db,
    db.select().from(statementBonus).where(eq(statementBonus.id, id)).get()!,
    input.operation,
    group.groupId,
  );
}
function noLegacyConsumption(db: Executor, ids: string[], r: Settlement | null = null) {
  const used = db
    .select()
    .from(expectedOccurrence)
    .where(isNull(expectedOccurrence.deletedAt))
    .all()
    .filter((o) => o.bookingId && ids.includes(o.bookingId));
  if (
    used.some(
      (o) => !r || o.expectedPaymentId !== r.legacyPaymentId || o.dueDate !== r.legacyDueDate,
    )
  )
    throw new ConflictError('Der Eintrag ist bereits einer anderen erwarteten Zahlung zugeordnet.');
}
/** A source reassessment changes documentary evidence, never the accepted credit. */
function reassessRepresentedBonus(
  db: Executor,
  r: Bonus,
  input: Extract<StatementSettlementAction, { operation: 'amend_bonus' }>,
  group: GroupedContext,
) {
  if (!input.sourceReview || r.state !== 'represented' || !r.bookingId) throw conflict();
  if (
    r.sourceIntakeId !== input.source.intakeId ||
    r.sourceSha256 !== input.source.sha256 ||
    r.cardAccountId !== input.source.accountId
  )
    throw conflict();
  sourceTerms(db, input.source);
  config(db, r.cardAccountId, input.configRevision);
  assertStatementSettlementInvariants(db);
  const financialTerms = (e: StatementBonusEvidence) =>
    JSON.stringify({
      bonusCents: e.bonusCents,
      creditDate: e.creditDate,
      treatment: e.treatment,
      originals: e.selectedOriginals
        .map((o) => ({
          bookingId: o.bookingId,
          splitId: o.splitId,
          accountId: o.accountId,
          currency: o.currency,
          bookingAmountCents: o.bookingAmountCents,
          splitAmountCents: o.splitAmountCents,
          categoryId: o.categoryId,
        }))
        .sort((a, b) => a.splitId.localeCompare(b.splitId)),
      allocations: e.allocations.map((a) => [a.categoryId, a.amountCents]).sort(),
    });
  if (financialTerms(bonusEvidence(r.evidenceJson)) !== financialTerms(input.evidence))
    throw conflict();
  assertBonusOriginals(db, r.cardAccountId, r.currency, input.evidence, true);
  // Remove only this consumer before using the ordinary, independently guarded source actions.
  updateTracked(
    db,
    statementBonus,
    [r.id],
    {
      state: 'superseded',
      bookingId: null,
      representationKind: null,
      actionGroupId: null,
    },
    group,
  );
  const reopened = mutateStatementIntake(
    db,
    input.source.intakeId,
    input.source,
    'reopen',
    {},
    group,
  ).intake;
  const reviewed = mutateStatementIntake(
    db,
    reopened.id,
    reopened,
    'review',
    { facts: input.sourceReview.facts },
    group,
  ).intake;
  const refreshed = { ...input, source: { ...input.source, revision: reviewed.revision } };
  const result = confirmBonus(db, refreshed, group, r.id);
  updateTracked(
    db,
    statementBonus,
    [result.bonusId!],
    {
      state: 'represented',
      bookingId: r.bookingId,
      representationKind: 'linked',
      actionGroupId: group.groupId,
    },
    group,
  );
  noLegacyConsumption(db, [r.bookingId]);
  const replacement = db
    .select()
    .from(statementBonus)
    .where(eq(statementBonus.id, result.bonusId!))
    .get()!;
  return {
    ...bonusReceipt(db, replacement, input.operation, group.groupId),
    bookingId: r.bookingId,
  };
}
function execute(
  db: Executor,
  input: StatementSettlementAction,
  group: GroupedContext,
): StatementActionReceipt {
  if (input.operation === 'configure') {
    currentRevision(db, 'statement_settlement_config', input.cardAccountId, input.expectedRevision);
    statementPair(db, input.cardAccountId, input.fundingAccountId);
    const old = db
      .select()
      .from(statementSettlementConfig)
      .where(eq(statementSettlementConfig.cardAccountId, input.cardAccountId))
      .get();
    if (
      db
        .select()
        .from(statementSettlement)
        .all()
        .some(
          (r) =>
            statementActive(r.state, r.deletedAt) &&
            r.cardAccountId === input.cardAccountId &&
            r.state === 'open' &&
            r.fundingAccountId !== input.fundingAccountId,
        )
    )
      throw new ConflictError(
        'Offene Abrechnung zuerst ausdrücklich zurücknehmen, bevor das Zahlungskonto gewechselt wird.',
      );
    const unchanged =
      old &&
      !old.deletedAt &&
      old.fundingAccountId === input.fundingAccountId &&
      old.enabled === input.enabled;
    const values = {
      fundingAccountId: input.fundingAccountId,
      enabled: input.enabled,
      deletedAt: null,
    };
    if (!unchanged) {
      if (old) updateTracked(db, statementSettlementConfig, [input.cardAccountId], values, group);
      else
        insertTracked(
          db,
          statementSettlementConfig,
          { cardAccountId: input.cardAccountId, ...values },
          group,
        );
    }
    return {
      operation: input.operation,
      groupId: unchanged ? null : group.groupId,
      configRevision: statementRevision(db, 'statement_settlement_config', input.cardAccountId)!,
    };
  }
  if (input.operation === 'confirm') return confirmSettlement(db, input, group);
  if (input.operation === 'confirm_bonus') return confirmBonus(db, input, group);
  if ('settlementId' in input) {
    const r = settlementCas(db, input.settlementId, input.expectedRevision);
    if (input.operation === 'withdraw' || input.operation === 'amend') {
      if (r.state === 'represented')
        throw new ConflictError(
          'Zuordnung oder finanzielle Aktion zuerst vollständig zurücknehmen.',
        );
      if (!statementActive(r.state, r.deletedAt)) throw conflict();
      updateTracked(
        db,
        statementSettlement,
        [r.id],
        { state: input.operation === 'amend' ? 'superseded' : 'withdrawn' },
        group,
      );
      return input.operation === 'amend'
        ? confirmSettlement(db, input, group, r.id)
        : settlementReceipt(db, r, input.operation, group.groupId);
    }
    if (r.state !== 'open')
      throw new ConflictError('Diese Abrechnung ist nicht offen oder bereits zugeordnet.');
    checkSourceIdentity(r, input.source);
    sourceTerms(db, input.source);
    const cfg = config(db, r.cardAccountId, input.configRevision);
    if (cfg.fundingAccountId !== r.fundingAccountId) throw conflict();
    let representation: { transferId: string; fromBookingId: string; toBookingId: string };
    if (input.operation === 'create_transfer')
      representation = createTransfer(
        db,
        {
          fromAccountId: r.fundingAccountId,
          toAccountId: r.cardAccountId,
          amountCents: r.payableCents,
          date: r.debitDate,
          status: input.status,
        },
        group,
      );
    else {
      currentRevision(db, 'booking', input.fromBookingId, input.fromRevision);
      currentRevision(db, 'booking', input.toBookingId, input.toRevision);
      representation = {
        transferId: input.transferId,
        fromBookingId: input.fromBookingId,
        toBookingId: input.toBookingId,
      };
      noLegacyConsumption(db, [input.fromBookingId, input.toBookingId], r);
    }
    updateTracked(
      db,
      statementSettlement,
      [r.id],
      {
        ...representation,
        state: 'represented',
        representationKind: input.operation === 'create_transfer' ? 'created' : 'linked',
        actionGroupId: group.groupId,
      },
      group,
    );
    return {
      ...settlementReceipt(db, r, input.operation, group.groupId),
      transferId: representation.transferId,
    };
  }
  const r = bonusCas(db, input.bonusId, input.expectedRevision);
  if (input.operation === 'amend_bonus' && input.sourceReview)
    return reassessRepresentedBonus(db, r, input, group);
  if (input.operation === 'withdraw_bonus' || input.operation === 'amend_bonus') {
    if (r.state === 'represented')
      throw new ConflictError('Gutschrift zuerst vollständig zurücknehmen oder Zuordnung lösen.');
    if (!statementActive(r.state, r.deletedAt)) throw conflict();
    updateTracked(
      db,
      statementBonus,
      [r.id],
      { state: input.operation === 'amend_bonus' ? 'superseded' : 'withdrawn' },
      group,
    );
    return input.operation === 'amend_bonus'
      ? confirmBonus(db, input, group, r.id)
      : bonusReceipt(db, r, input.operation, group.groupId);
  }
  if (r.state !== 'ready')
    throw new ConflictError('Gutschrift nicht bereit oder bereits berücksichtigt.');
  checkSourceIdentity(r, input.source);
  sourceTerms(db, input.source);
  config(db, r.cardAccountId, input.configRevision);
  const evidence = bonusEvidence(r.evidenceJson);
  assertOriginalRequest(evidence, input.selectedOriginals);
  assertBonusOriginals(db, r.cardAccountId, r.currency, evidence, true);
  let bookingId: string;
  if (input.operation === 'create_bonus')
    bookingId = createBooking(
      db,
      {
        accountId: r.cardAccountId,
        date: r.creditDate,
        amountCents: r.bonusCents,
        status: input.status,
        splits: evidence.allocations.map((a) => ({ ...a, incomeTypeId: INCOME_TYPES.refund.id })),
      },
      group,
    );
  else {
    currentRevision(db, 'booking', input.bookingId, input.bookingRevision);
    const splits = db
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, input.bookingId))
      .all();
    if (
      splits.length !== input.splitRevisions.length ||
      !splits.every((s) =>
        input.splitRevisions.some(
          (v) => v.splitId === s.id && statementRevision(db, 'booking_split', s.id) === v.revision,
        ),
      )
    )
      throw conflict();
    noLegacyConsumption(db, [input.bookingId]);
    bookingId = input.bookingId;
  }
  updateTracked(
    db,
    statementBonus,
    [r.id],
    {
      state: 'represented',
      bookingId,
      representationKind: input.operation === 'create_bonus' ? 'created' : 'linked',
      actionGroupId: group.groupId,
    },
    group,
  );
  return { ...bonusReceipt(db, r, input.operation, group.groupId), bookingId };
}
export function performStatementAction(
  db: Executor,
  raw: unknown,
  ctx: AuditContext,
): StatementActionReceipt {
  const input = statementSettlementActionSchema.parse(raw);
  if (Buffer.byteLength(canonicalStatementAction(input), 'utf8') > 65536)
    throw new BookingInvariantError('Abrechnungsaktion ist zu groß.');
  return runInTransaction(db, (tx) => {
    const replay = replayStatementAction(tx, input);
    if (replay) return replay;
    const result = execute(tx, input, withGroup(ctx));
    assertStatementSettlementInvariants(tx);
    tx.insert(statementSettlementDelivery)
      .values({
        key: input.key,
        operation: input.operation,
        requestHash: hash(input),
        responseJson: JSON.stringify(result),
      })
      .run();
    return result;
  });
}
/** Current state is a separate read; immutable delivery receipts never pretend to be current. */
export function statementSettlementState(db: Executor, cardAccountId: string) {
  const cfg = db
    .select()
    .from(statementSettlementConfig)
    .where(
      and(
        eq(statementSettlementConfig.cardAccountId, cardAccountId),
        isNull(statementSettlementConfig.deletedAt),
      ),
    )
    .get();
  return {
    config: cfg
      ? { ...cfg, revision: statementRevision(db, 'statement_settlement_config', cardAccountId) }
      : null,
    settlements: db
      .select()
      .from(statementSettlement)
      .where(
        and(
          eq(statementSettlement.cardAccountId, cardAccountId),
          isNull(statementSettlement.deletedAt),
        ),
      )
      .all()
      .map((r) => ({ ...r, revision: statementRevision(db, 'statement_settlement', r.id) })),
    bonuses: db
      .select()
      .from(statementBonus)
      .where(and(eq(statementBonus.cardAccountId, cardAccountId), isNull(statementBonus.deletedAt)))
      .all()
      .map((r) => ({
        ...r,
        evidence: bonusEvidence(r.evidenceJson),
        revision: statementRevision(db, 'statement_bonus', r.id),
      })),
  };
}
