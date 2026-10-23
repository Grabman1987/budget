import { eq, sql } from 'drizzle-orm';
import {
  statementCandidateQuerySchema,
  type StatementCandidateQuery,
  type StatementCandidatePage,
  type StatementCandidate,
  type StatementCandidateOmission,
} from '@budget/domain';
import { account, booking, statementSettlement, statementBonus, INCOME_TYPES } from '../schema';
import {
  hasStatementSettlementFamily,
  statementActive,
  statementRevision,
  bonusEvidence,
} from './statement-settlement-invariants';
import { ConflictError, BookingInvariantError, EntityNotFoundError } from './errors';
import { memoizedShared } from './request-memo';
import { runInTransaction, type Executor } from './types';

/** Accepted identities and existing legs only: no price, balance, matching or schedule resolver. */
export function statementSettlementRead(db: Executor) {
  return memoizedShared(db, 'statement-settlement-identities-v1', () => {
    if (!hasStatementSettlementFamily(db)) return { settlements: [], bonuses: [] };
    return {
      settlements: db
        .select()
        .from(statementSettlement)
        .all()
        .filter((r) => statementActive(r.state, r.deletedAt)),
      bonuses: db
        .select()
        .from(statementBonus)
        .all()
        .filter((r) => statementActive(r.state, r.deletedAt)),
    };
  });
}
export function statementLegacyKeys(db: Executor) {
  return new Set(
    statementSettlementRead(db).settlements.flatMap((r) =>
      r.legacyPaymentId && r.legacyDueDate ? [r.legacyPaymentId + '|' + r.legacyDueDate] : [],
    ),
  );
}
export function statementOwnedBookingIds(db: Executor) {
  const f = statementSettlementRead(db);
  return new Set([
    ...f.settlements.flatMap((r) =>
      r.state === 'represented' ? [r.fromBookingId!, r.toBookingId!] : [],
    ),
    ...f.bonuses.flatMap((r) => (r.state === 'represented' ? [r.bookingId!] : [])),
  ]);
}
export function assertStatementExpectedLink(
  db: Executor,
  bookingId: string,
  paymentId: string,
  dueDate: string,
) {
  const f = statementSettlementRead(db);
  const settlement = f.settlements.find(
    (r) => r.state === 'represented' && [r.fromBookingId, r.toBookingId].includes(bookingId),
  );
  if (
    (settlement &&
      (settlement.legacyPaymentId !== paymentId ||
        settlement.legacyDueDate !== dueDate ||
        settlement.fromBookingId !== bookingId)) ||
    f.bonuses.some((r) => r.state === 'represented' && r.bookingId === bookingId)
  )
    throw new ConflictError(
      'Dieser Abrechnungseintrag darf keiner anderen erwarteten Zahlung zugeordnet werden.',
    );
}
export type StatementForecastLeg = {
  id: string;
  accountId: string;
  currency: string;
  day: string;
  cents: number;
  bookingId: string | null;
  status: string | null;
  kind: 'settlement' | 'bonus';
};
export function statementForecastLegs(
  db: Executor,
  from: string,
  to: string,
  universe: ReadonlySet<string>,
  includedBookings: ReadonlySet<string> = new Set(),
): StatementForecastLeg[] {
  const out: StatementForecastLeg[] = [];
  const facts = statementSettlementRead(db);
  const add = (leg: StatementForecastLeg) => {
    if (
      leg.day >= from &&
      leg.day <= to &&
      universe.has(leg.accountId) &&
      (!leg.bookingId || !includedBookings.has(leg.bookingId))
    )
      out.push(leg);
  };
  const actual = (id: string, kind: 'settlement' | 'bonus', entityId: string) => {
    const b = db.select().from(booking).where(eq(booking.id, id)).get();
    if (!b || b.deletedAt) return;
    const a = db.select().from(account).where(eq(account.id, b.accountId)).get();
    if (!a || a.deletedAt) return;
    add({
      id: entityId + ':' + b.id,
      accountId: b.accountId,
      currency: a.currency,
      day: b.date,
      cents: b.amountCents,
      bookingId: b.id,
      status: b.status,
      kind,
    });
  };
  for (const r of facts.settlements) {
    if (r.state === 'open')
      for (const [accountId, cents] of [
        [r.fundingAccountId, -r.payableCents],
        [r.cardAccountId, r.payableCents],
      ] as const)
        add({
          id: r.id + ':' + accountId,
          accountId,
          currency: r.currency,
          day: r.debitDate,
          cents,
          bookingId: null,
          status: null,
          kind: 'settlement',
        });
    if (r.state === 'represented') {
      actual(r.fromBookingId!, 'settlement', r.id);
      actual(r.toBookingId!, 'settlement', r.id);
    }
  }
  for (const r of facts.bonuses) if (r.state === 'represented') actual(r.bookingId!, 'bonus', r.id);
  return out;
}

type NativeStatus = 'pending' | 'confirmed' | 'reconciled';
type CandidateRow = {
  id: string;
  bookingId: string;
  date: string;
  status: NativeStatus;
  amountCents: number;
  transferId: string | null;
  splitAmountCents: number;
  categoryId: string;
};
type NativeSplit = {
  id: string;
  categoryId: string | null;
  amountCents: number;
  incomeTypeId: string | null;
  transferId: string | null;
};
const uuid = (value: unknown): value is string =>
  statementCandidateQuerySchema.shape.cardAccountId.safeParse(value).success;
const nativeStatus = (s: string) => ['pending', 'confirmed', 'reconciled'].includes(s);
/** Bounded native facts and current consumed CAS only; no inferred matching or reservations. */
export function statementSettlementCandidates(
  db: Executor,
  raw: StatementCandidateQuery,
): StatementCandidatePage {
  const q = statementCandidateQuerySchema.parse(raw);
  return runInTransaction(db, (tx) => {
    const card = tx.select().from(account).where(eq(account.id, q.cardAccountId)).get();
    if (!card || card.deletedAt || card.closedAt || card.type !== 'credit_card')
      throw new EntityNotFoundError('account', q.cardAccountId);
    const targetBonus = q.bonusId
      ? tx.select().from(statementBonus).where(eq(statementBonus.id, q.bonusId)).get()
      : undefined;
    const targetSettlement = q.settlementId
      ? tx
          .select()
          .from(statementSettlement)
          .where(eq(statementSettlement.id, q.settlementId))
          .get()
      : undefined;
    if (
      (q.bonusId &&
        (!targetBonus || targetBonus.deletedAt || targetBonus.cardAccountId !== card.id)) ||
      (q.settlementId &&
        (!targetSettlement ||
          targetSettlement.deletedAt ||
          targetSettlement.cardAccountId !== card.id))
    )
      throw new EntityNotFoundError('statement candidate target', q.bonusId ?? q.settlementId!);
    if (
      (q.kind === 'credit' && targetBonus?.state !== 'ready') ||
      (q.kind === 'transfer' && targetSettlement?.state !== 'open')
    )
      throw new ConflictError('Diese Zuordnung ist nicht offen. Bitte neu laden.');
    const identity = q.kind === 'original' ? sql`s.id` : sql`b.id`;
    const cursor = q.beforeDate
      ? sql`AND (b.date<${q.beforeDate} OR (b.date=${q.beforeDate} AND ${identity}<${q.beforeId}))`
      : sql``;
    const scoped =
      q.kind === 'original'
        ? sql`
   SELECT s.id AS id,b.id AS bookingId,b.date,b.status,b.amount_cents AS amountCents,b.transfer_id AS transferId,s.amount_cents AS splitAmountCents,s.category_id AS categoryId
   FROM booking b JOIN booking_split s ON s.booking_id=b.id JOIN category c ON c.id=s.category_id
   WHERE b.account_id=${card.id} AND b.deleted_at IS NULL AND c.deleted_at IS NULL
    AND b.amount_cents<0 AND s.amount_cents<0 AND b.transfer_id IS NULL AND s.transfer_id IS NULL
    AND c.class IS NOT NULL AND c.kind NOT IN ('income','card_payment','advance') ${cursor}
   ORDER BY b.date DESC,s.id DESC LIMIT ${q.limit + 1}`
        : sql`
   SELECT b.id,b.id AS bookingId,b.date,b.status,b.amount_cents AS amountCents,b.transfer_id AS transferId
   FROM booking b WHERE b.account_id=${card.id} AND b.deleted_at IS NULL AND b.amount_cents>0
    AND ${q.kind === 'credit' ? sql`b.transfer_id IS NULL` : sql`b.transfer_id IS NOT NULL`} ${cursor}
   ORDER BY b.date DESC,b.id DESC LIMIT ${q.limit + 1}`;
    const rawRows = tx.all<CandidateRow>(scoped),
      page = rawRows.slice(0, q.limit);
    const omitted: StatementCandidatePage['omitted'] = {},
      items: StatementCandidate[] = [];
    const omit = (reason: StatementCandidateOmission) => {
      omitted[reason] = (omitted[reason] ?? 0) + 1;
    };
    for (const b of page) {
      if (
        !uuid(b.id) ||
        !uuid(b.bookingId) ||
        !nativeStatus(b.status) ||
        !statementCandidateQuerySchema.shape.beforeDate.unwrap().safeParse(b.date).success ||
        !/^[A-Z]{3}$/.test(card.currency) ||
        !Number.isSafeInteger(b.amountCents)
      ) {
        omit('invalid_identity');
        continue;
      }
      const bookingRevision = statementRevision(tx, 'booking', b.bookingId);
      if (!uuid(bookingRevision)) {
        omit('missing_history');
        continue;
      }
      if (q.kind === 'original') {
        if (!uuid(b.categoryId) || !Number.isSafeInteger(b.splitAmountCents)) {
          omit('invalid_identity');
          continue;
        }
        const splitRevision = statementRevision(tx, 'booking_split', b.id);
        if (!uuid(splitRevision)) {
          omit('missing_history');
          continue;
        }
        const consumed = tx.get<{
          n: number;
        }>(sql`SELECT EXISTS(SELECT 1 FROM statement_bonus x,json_each(x.evidence_json,'$.selectedOriginals') o
     WHERE x.card_account_id=${card.id} AND x.deleted_at IS NULL AND x.state NOT IN ('withdrawn','superseded') AND x.id!=${q.bonusId ?? ''}
     AND json_extract(o.value,'$.splitId')=${b.id}) AS n`);
        if (consumed?.n) {
          omit('consumed');
          continue;
        }
        items.push({
          kind: 'original',
          date: b.date,
          status: b.status,
          selection: {
            bookingId: b.bookingId,
            bookingRevision,
            splitId: b.id,
            splitRevision,
            accountId: card.id,
            currency: card.currency,
            bookingAmountCents: b.amountCents,
            splitAmountCents: b.splitAmountCents,
            categoryId: b.categoryId,
          },
        });
      } else if (q.kind === 'credit') {
        const splits = tx.all<NativeSplit>(
          sql`SELECT id,category_id AS categoryId,amount_cents AS amountCents,income_type_id AS incomeTypeId,transfer_id AS transferId FROM booking_split WHERE booking_id=${b.id} ORDER BY id LIMIT 51`,
        );
        if (splits.length > 50) {
          omit('too_many_splits');
          continue;
        }
        const evidence = bonusEvidence(targetBonus!.evidenceJson);
        const actual = splits.map((s) => [s.categoryId, s.amountCents]).sort(),
          wanted = evidence.allocations.map((a) => [a.categoryId, a.amountCents]).sort();
        if (
          b.amountCents !== targetBonus!.bonusCents ||
          b.date !== targetBonus!.creditDate ||
          !splits.length ||
          splits.some((s) => s.transferId || s.incomeTypeId !== INCOME_TYPES.refund.id) ||
          JSON.stringify(actual) !== JSON.stringify(wanted)
        ) {
          omit('unsupported');
          continue;
        }
        const consumed = tx.get<{ n: number }>(
          sql`SELECT EXISTS(SELECT 1 FROM statement_bonus WHERE card_account_id=${card.id} AND booking_id=${b.id} AND deleted_at IS NULL AND state NOT IN ('withdrawn','superseded')) OR EXISTS(SELECT 1 FROM expected_occurrence WHERE booking_id=${b.id} AND deleted_at IS NULL) AS n`,
        );
        if (consumed?.n) {
          omit('consumed');
          continue;
        }
        const splitRevisions = splits.map((s) => ({
          splitId: s.id,
          revision: statementRevision(tx, 'booking_split', s.id),
        }));
        if (splitRevisions.some((s) => !uuid(s.splitId) || !uuid(s.revision))) {
          omit('missing_history');
          continue;
        }
        items.push({
          kind: 'credit',
          date: b.date,
          status: b.status,
          accountId: card.id,
          currency: card.currency,
          amountCents: b.amountCents,
          allocations: splits.map((s) => ({
            categoryId: s.categoryId,
            amountCents: s.amountCents,
            incomeTypeId: s.incomeTypeId,
          })),
          selection: {
            bookingId: b.id,
            bookingRevision,
            splitRevisions: splitRevisions.map((s) => ({
              splitId: s.splitId,
              revision: s.revision!,
            })),
          },
        });
      } else {
        const target = targetSettlement!;
        const legs = tx.all<{
          id: string;
          accountId: string;
          date: string;
          amountCents: number;
          status: NativeStatus;
          currency: string;
          deletedAccount: string | null;
        }>(
          sql`SELECT b.id,b.account_id AS accountId,b.date,b.amount_cents AS amountCents,b.status,a.currency,a.deleted_at AS deletedAccount FROM booking b JOIN account a ON a.id=b.account_id WHERE b.transfer_id=${b.transferId} AND b.deleted_at IS NULL ORDER BY b.id LIMIT 3`,
        );
        const from = legs.find((l) => l.accountId === target.fundingAccountId),
          to = legs.find((l) => l.id === b.id);
        const partial = tx.get<{ n: number }>(
          sql`SELECT EXISTS(SELECT 1 FROM booking_split s JOIN booking p ON p.id=s.booking_id WHERE s.transfer_id=${b.transferId} AND p.deleted_at IS NULL) AS n`,
        );
        if (
          !uuid(b.transferId) ||
          legs.length !== 2 ||
          !from ||
          !to ||
          from.id === to.id ||
          partial?.n ||
          legs.some(
            (l) =>
              l.deletedAccount ||
              l.currency !== target.currency ||
              l.date !== target.debitDate ||
              !nativeStatus(l.status),
          ) ||
          from.amountCents !== -target.payableCents ||
          to.amountCents !== target.payableCents
        ) {
          omit('unsupported');
          continue;
        }
        const fromRevision = statementRevision(tx, 'booking', from.id),
          toRevision = statementRevision(tx, 'booking', to.id);
        if (!uuid(from.id) || !uuid(to.id) || !uuid(fromRevision) || !uuid(toRevision)) {
          omit('missing_history');
          continue;
        }
        const consumed = tx.get<{ n: number }>(
          sql`SELECT EXISTS(SELECT 1 FROM statement_settlement WHERE card_account_id=${card.id} AND transfer_id=${b.transferId} AND deleted_at IS NULL AND state NOT IN ('withdrawn','superseded')) OR EXISTS(SELECT 1 FROM expected_occurrence WHERE booking_id IN (${from.id},${to.id}) AND deleted_at IS NULL AND NOT (expected_payment_id=${target.legacyPaymentId ?? ''} AND due_date=${target.legacyDueDate ?? ''} AND booking_id=${from.id})) AS n`,
        );
        if (consumed?.n) {
          omit('consumed');
          continue;
        }
        items.push({
          kind: 'transfer',
          date: to.date,
          fromStatus: from.status,
          toStatus: to.status,
          fromAccountId: from.accountId,
          toAccountId: to.accountId,
          currency: target.currency,
          fromCents: from.amountCents,
          toCents: to.amountCents,
          selection: {
            transferId: b.transferId,
            fromBookingId: from.id,
            fromRevision,
            toBookingId: to.id,
            toRevision,
          },
        });
      }
    }
    const last = page.at(-1);
    if (
      rawRows.length > q.limit &&
      last &&
      (!uuid(last.id) ||
        !statementCandidateQuerySchema.shape.beforeDate.unwrap().safeParse(last.date).success)
    )
      throw new BookingInvariantError(
        'Kandidatenseite enthält einen nicht unterstützten Schlüssel. Bitte den Ursprungseintrag prüfen.',
      );
    const result: StatementCandidatePage = {
      kind: q.kind,
      items,
      nextCursor: rawRows.length > q.limit && last ? { date: last.date, id: last.id } : null,
      omitted,
    };
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 262144)
      throw new BookingInvariantError(
        'Kandidatenseite ist zu groß. Bitte eine kleinere Seite wählen.',
      );
    return result;
  });
}
