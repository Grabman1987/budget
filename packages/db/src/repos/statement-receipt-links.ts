import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type {
  StatementReceiptBooking,
  StatementReceiptLinksInput,
  StatementReceiptLinksPage,
  StatementReceiptLinksReply,
} from '@budget/domain';
import { account, auditLog, booking, payee, receipt, statementSettlement } from '../schema';
import { statementAutomationRow } from '../schema/statement-automation';
import { withGroup, type AuditContext } from './audit';
import { ConflictError } from './errors';
import { linkReceipt, unlinkReceipt } from './receipts';
import { assertStatementCas, getStatementIntake, statementAccount } from './statement-intake';
import {
  assertStatementAutomationReceiptWrite,
  hasStatementAutomation,
} from './statement-automation-invariants';
import { statementRevision } from './statement-settlement-invariants';
import { runInTransaction, type Executor } from './types';

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const identity = z.string().min(1).max(128);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const target = z.object({ bookingId: identity, bookingRevision: revision }).strict();
const inputSchema = z
  .object({
    sourceCas: z
      .object({ revision: z.string().uuid(), sha256: revision, accountId: identity })
      .strict(),
    linksRevision: revision,
    attach: z.array(target).max(100),
    detach: z.array(target).max(100),
  })
  .strict();

function sourceState(db: Executor, intakeId: string) {
  const view = getStatementIntake(db, intakeId);
  statementAccount(db, view.accountId);
  const a = db.select().from(account).where(eq(account.id, view.accountId)).get()!;
  const blob = db.select().from(receipt).where(eq(receipt.id, view.receiptId)).get();
  if (view.deletedAt || !view.revision || !blob || blob.deletedAt || blob.sha256 !== view.sha256)
    throw new ConflictError('Die Abrechnungsquelle ist nicht mehr verfügbar.');
  const field = view.reviewed?.fields.currency ?? view.proposal.fields.currency;
  const currency =
    field.value &&
    (view.reviewed || (field.origin === 'printed' && field.candidates.length === 1)) &&
    field.value === a.currency
      ? field.value
      : null;
  const pairHead =
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'booking_receipt'),
          or(
            sql`json_extract(${auditLog.beforeJson}, '$.receipt_id') = ${blob.id}`,
            sql`json_extract(${auditLog.afterJson}, '$.receipt_id') = ${blob.id}`,
          ),
        ),
      )
      .orderBy(desc(sql`rowid`))
      .get()?.id ?? null;
  const source = {
    intakeId,
    revision: view.revision,
    sha256: view.sha256,
    accountId: view.accountId,
    receiptId: blob.id,
    currency,
    accountName: a.name,
  };
  return {
    source,
    linksRevision: digest([
      source,
      blob,
      a,
      statementRevision(db, 'account', a.id),
      statementRevision(db, 'receipt', blob.id),
      pairHead,
    ]),
  };
}

function managedIds(db: Executor, receiptId: string) {
  const ids = new Set<string>();
  if (!hasStatementAutomation(db)) return ids;
  for (const row of db
    .select()
    .from(statementAutomationRow)
    .where(
      and(
        eq(statementAutomationRow.receiptId, receiptId),
        isNull(statementAutomationRow.deletedAt),
      ),
    )
    .all()) {
    ids.add(row.bookingId);
    if (row.originalBookingId) ids.add(row.originalBookingId);
  }
  for (const row of db
    .select()
    .from(statementSettlement)
    .where(and(eq(statementSettlement.receiptId, receiptId), isNull(statementSettlement.deletedAt)))
    .all()) {
    if (
      row.state !== 'represented' ||
      (JSON.parse(row.originsJson) as { origin?: string }).origin !== 'machine'
    )
      continue;
    if (row.fromBookingId) ids.add(row.fromBookingId);
    if (row.toBookingId) ids.add(row.toBookingId);
  }
  return ids;
}

/** The audit head includes removed/recreated splits, so restoring old values never restores an old token. */
function bookingRows(
  db: Executor,
  receiptId: string,
  managed: ReadonlySet<string>,
  options: {
    accountId?: string;
    currency?: string;
    q?: string;
    attached?: boolean;
    ids?: string[];
    offset?: number;
    limit?: number;
  },
): StatementReceiptBooking[] {
  const conditions = [isNull(booking.deletedAt), isNull(account.deletedAt)];
  if (options.accountId) conditions.push(eq(booking.accountId, options.accountId));
  if (options.currency) conditions.push(eq(booking.currency, options.currency));
  if (options.attached)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM booking_receipt br WHERE br.booking_id = ${booking.id} AND br.receipt_id = ${receiptId} AND br.deleted_at IS NULL)`,
    );
  if (options.ids)
    conditions.push(
      sql`${booking.id} IN (${sql.join(
        options.ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  if (options.q) {
    const pattern = `%${options.q.replace(/[!%_]/g, '!$&')}%`;
    conditions.push(
      or(
        sql`${booking.memo} LIKE ${pattern} ESCAPE '!'`,
        sql`${booking.bankRawPayee} LIKE ${pattern} ESCAPE '!'`,
        sql`${payee.name} LIKE ${pattern} ESCAPE '!'`,
        eq(booking.id, options.q),
      )!,
    );
  }
  const rows = db
    .select({
      b: booking,
      a: account,
      p: payee,
      relation: sql<
        string | null
      >`(SELECT deleted_at FROM booking_receipt br WHERE br.booking_id = ${booking.id} AND br.receipt_id = ${receiptId})`,
      attached: sql<number>`EXISTS (SELECT 1 FROM booking_receipt br WHERE br.booking_id = ${booking.id} AND br.receipt_id = ${receiptId} AND br.deleted_at IS NULL)`,
      head: sql<
        string | null
      >`(SELECT al.id FROM audit_log al WHERE (al.entity_type='booking' AND al.entity_id=${booking.id}) OR (al.entity_type='payee' AND al.entity_id=${booking.payeeId}) OR (al.entity_type='booking_split' AND (json_extract(al.before_json,'$.booking_id')=${booking.id} OR json_extract(al.after_json,'$.booking_id')=${booking.id})) ORDER BY al.rowid DESC LIMIT 1)`,
      splitState: sql<string>`COALESCE((SELECT json_group_array(json(x.snapshot)) FROM (SELECT json_array(bs.id,bs.category_id,bs.amount_cents,bs.memo,bs.contact_id,bs.income_type_id,bs.transfer_id,bs.sort_order) AS snapshot FROM booking_split bs WHERE bs.booking_id=${booking.id} ORDER BY bs.id) x), '[]')`,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(and(...conditions))
    .orderBy(desc(booking.date), desc(booking.id))
    .limit(options.limit ?? 101)
    .offset(options.offset ?? 0)
    .all();
  return rows.map(({ b, a, p, attached, relation, head, splitState }) => ({
    bookingId: b.id,
    bookingRevision: digest([b, a, p, head, splitState, relation, !!attached, managed.has(b.id)]),
    accountId: b.accountId,
    accountName: a.name,
    date: b.date,
    description:
      b.bankRawPayee || (p && !p.deletedAt ? p.name : '') || b.memo || 'Ohne Beschreibung',
    amountCents: b.amountCents,
    currency: b.currency,
    attached: !!attached,
    managed: managed.has(b.id),
  }));
}

export function readStatementReceiptLinks(
  db: Executor,
  intakeId: string,
  query: { q?: string; offset?: number; attachedOffset?: number; limit?: number } = {},
): StatementReceiptLinksPage {
  return runInTransaction(db, (tx) => {
    const state = sourceState(tx, intakeId),
      limit = query.limit ?? 25;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      [query.offset ?? 0, query.attachedOffset ?? 0].some(
        (n) => !Number.isInteger(n) || n < 0 || n > 100000,
      ) ||
      (query.q?.length ?? 0) > 200
    )
      throw new ConflictError('Ungültiger Buchungsausschnitt.');
    const managed = managedIds(tx, state.source.receiptId);
    const items = state.source.currency
      ? bookingRows(tx, state.source.receiptId, managed, {
          accountId: state.source.accountId,
          currency: state.source.currency,
          ...(query.q === undefined ? {} : { q: query.q }),
          ...(query.offset === undefined ? {} : { offset: query.offset }),
          limit: limit + 1,
        })
      : [];
    const attached = bookingRows(tx, state.source.receiptId, managed, {
      attached: true,
      ...(query.attachedOffset === undefined ? {} : { offset: query.attachedOffset }),
      limit: limit + 1,
    });
    return {
      ...state,
      items: items.slice(0, limit),
      attached: attached.slice(0, limit),
      nextOffset: items.length > limit ? (query.offset ?? 0) + limit : null,
      nextAttachedOffset: attached.length > limit ? (query.attachedOffset ?? 0) + limit : null,
      unavailableReason: state.source.currency ? null : 'source_currency_required',
    };
  });
}

export function changeStatementReceiptLinks(
  db: Executor,
  intakeId: string,
  raw: StatementReceiptLinksInput,
  ctx: AuditContext,
): StatementReceiptLinksReply {
  const input = inputSchema.parse(raw),
    all = [...input.attach, ...input.detach];
  if (all.length > 100 || new Set(all.map((t) => t.bookingId)).size !== all.length)
    throw new ConflictError('Höchstens 100 unterschiedliche Buchungen pro Aktion auswählen.');
  return runInTransaction(db, (tx) => {
    assertStatementCas(tx, intakeId, input.sourceCas);
    const state = sourceState(tx, intakeId);
    if (state.linksRevision !== input.linksRevision || !state.source.currency)
      throw new ConflictError('Quelle oder Verknüpfungen wurden geändert. Bitte neu laden.');
    const managed = managedIds(tx, state.source.receiptId);
    const rows = all.length
      ? bookingRows(tx, state.source.receiptId, managed, {
          ids: all.map((t) => t.bookingId),
          limit: 100,
        })
      : [];
    const targets = new Map(rows.map((r) => [r.bookingId, r]));
    for (const target of all) {
      const current = targets.get(target.bookingId);
      if (
        !current ||
        current.bookingRevision !== target.bookingRevision ||
        current.accountId !== state.source.accountId ||
        current.currency !== state.source.currency
      )
        throw new ConflictError(
          'Eine ausgewählte Buchung wurde geändert oder gehört nicht zur Abrechnung.',
        );
    }
    // Validate every detach before any tracked write; one protected target aborts the full batch.
    for (const target of input.detach)
      assertStatementAutomationReceiptWrite(tx, state.source.receiptId, target.bookingId);
    const attach = input.attach.filter((t) => !targets.get(t.bookingId)!.attached);
    const detach = input.detach.filter((t) => targets.get(t.bookingId)!.attached);
    if (!attach.length && !detach.length)
      return { groupId: null, changedCount: 0, attachedIds: [], detachedIds: [] };
    const group = withGroup(ctx);
    for (const target of attach) linkReceipt(tx, state.source.receiptId, target.bookingId, group);
    for (const target of detach) unlinkReceipt(tx, state.source.receiptId, target.bookingId, group);
    return {
      groupId: group.groupId,
      changedCount: attach.length + detach.length,
      attachedIds: attach.map((t) => t.bookingId),
      detachedIds: detach.map((t) => t.bookingId),
    };
  });
}
