import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  contact,
  contactAlias,
  contactAllocation,
  contactSettlement,
  expectedPayment,
  payee,
  payslip,
} from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { assertContactLabelFree, listContactAliases, normalizeContactLabel } from './contact-label';
import { assertContactSettlementInvariants } from './contact-invariants';
import { contactStatementOf } from './contacts';
import {
  AuditError,
  ContactLabelTakenError,
  ContactMergeConflictError,
  EntityNotFoundError,
  StalePreviewError,
  type ContactMergeReason,
} from './errors';
import { runInTransaction, type Executor } from './types';

/**
 * Contact merge (#871, contract `docs/redesign/contact-identity-contract.md` 5.3): a pointer, not
 * a rewrite. The source keeps its id and every booking, split, settlement and allocation; it is
 * archived and points at the target, its name becomes an alias of the target and the live
 * configuration rows (payee, expected payment, receivable account) are repointed. Everything is
 * one transaction and one audit group; Undo restores all of it exactly.
 */

const PREVIEW_TTL_MS = 10 * 60 * 1000;
const FAR_FUTURE = '9999-12-31';

export interface ContactMergeOptions {
  /** Server secret for the stateless preview token. */
  secret: string;
  now?: Date;
}

interface Side {
  id: string;
  name: string;
  receivableCents: number;
  creditCents: number;
}

export interface ContactMergePreview {
  /** Null while `conflicts` is not empty: such a merge cannot be committed. */
  token: string | null;
  expiresAt: string;
  source: Side & { aliases: number };
  target: Side & { aliases: number };
  /** Plain union of both contacts; receivable and credit are never netted against each other. */
  after: { receivableCents: number; creditCents: number };
  /** Rows that stay untouched under the source id and are resolved to the target afterwards. */
  stays: {
    bookingSplits: number;
    settlements: number;
    allocations: number;
    payslips: number;
    /** Reconciled (locked) bookings among the splits above: preserved byte for byte. */
    reconciledBookings: number;
  };
  /** Live configuration rows that are repointed to the target. */
  moves: { payees: number; expectedPayments: number; accounts: number };
  /** The source name that becomes an alias of the target. */
  newAlias: string;
  conflicts: ContactMergeReason[];
}

function liveContact(tx: Executor, id: string) {
  const row = tx
    .select()
    .from(contact)
    .where(and(eq(contact.id, id), isNull(contact.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('contact', id);
  return row;
}

function receivableOf(statement: { outlays: readonly { remainingCents: number }[] }): number {
  return statement.outlays.reduce((sum, o) => sum + o.remainingCents, 0);
}

function sideOf(tx: Executor, row: typeof contact.$inferSelect): Side {
  const statement = contactStatementOf(tx, row.id, [row.id], FAR_FUTURE);
  return {
    id: row.id,
    name: row.name,
    receivableCents: receivableOf(statement),
    creditCents: statement.creditCents,
  };
}

/** Live configuration rows (sorted ids) that point at the contact. */
function configRows(tx: Executor, contactId: string) {
  return {
    payees: tx
      .select({ id: payee.id })
      .from(payee)
      .where(and(eq(payee.contactId, contactId), isNull(payee.deletedAt)))
      .orderBy(payee.id)
      .all()
      .map((r) => r.id),
    expected: tx
      .select({ id: expectedPayment.id })
      .from(expectedPayment)
      .where(and(eq(expectedPayment.contactId, contactId), isNull(expectedPayment.deletedAt)))
      .orderBy(expectedPayment.id)
      .all()
      .map((r) => r.id),
    accounts: tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.contactId, contactId), isNull(account.deletedAt)))
      .orderBy(account.id)
      .all()
      .map((r) => r.id),
  };
}

/** Count and latest change per referencing table, soft-deleted rows included. */
function referenceStamps(tx: Executor, contactId: string) {
  const one = <T>(rows: T[]) => rows[0]!;
  return [
    one(
      tx
        .select({
          n: sql<number>`count(*)`,
          m: sql<string | null>`max(${booking.updatedAt})`,
          s: sql<number>`coalesce(sum(${bookingSplit.amountCents}), 0)`,
        })
        .from(bookingSplit)
        .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
        .where(eq(bookingSplit.contactId, contactId))
        .all(),
    ),
    one(
      tx
        .select({
          n: sql<number>`count(*)`,
          m: sql<string | null>`max(${contactSettlement.updatedAt})`,
        })
        .from(contactSettlement)
        .where(eq(contactSettlement.contactId, contactId))
        .all(),
    ),
    one(
      tx
        .select({ n: sql<number>`count(*)`, m: sql<string | null>`max(${payee.updatedAt})` })
        .from(payee)
        .where(eq(payee.contactId, contactId))
        .all(),
    ),
    one(
      tx
        .select({
          n: sql<number>`count(*)`,
          m: sql<string | null>`max(${expectedPayment.updatedAt})`,
        })
        .from(expectedPayment)
        .where(eq(expectedPayment.contactId, contactId))
        .all(),
    ),
    one(
      tx
        .select({ n: sql<number>`count(*)`, m: sql<string | null>`max(${account.updatedAt})` })
        .from(account)
        .where(eq(account.contactId, contactId))
        .all(),
    ),
    one(
      tx
        .select({ n: sql<number>`count(*)`, m: sql<string | null>`max(${payslip.updatedAt})` })
        .from(payslip)
        .where(eq(payslip.employerContactId, contactId))
        .all(),
    ),
  ];
}

function sign(secret: string, fingerprint: unknown, expiresMs: number): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify({ fingerprint, expiresMs }))
    .digest('hex');
}

function computePreview(
  tx: Executor,
  sourceId: string,
  targetId: string,
): { preview: Omit<ContactMergePreview, 'token' | 'expiresAt'>; fingerprint: unknown } {
  const source = liveContact(tx, sourceId);
  const target = liveContact(tx, targetId);
  const conflicts: ContactMergeReason[] = [];
  if (sourceId === targetId) conflicts.push('same_contact');
  if (source.mergedIntoId) conflicts.push('source_merged');
  if (target.mergedIntoId) conflicts.push('target_merged');
  if (source.archivedAt) conflicts.push('source_archived');
  if (target.archivedAt) conflicts.push('target_archived');
  if (tx.select({ id: contact.id }).from(contact).where(eq(contact.mergedIntoId, sourceId)).get())
    conflicts.push('source_has_sources');
  const sourceConfig = configRows(tx, sourceId);
  const targetConfig = configRows(tx, targetId);
  if (sourceConfig.accounts.length > 0 && targetConfig.accounts.length > 0)
    conflicts.push('both_receivable_account');
  try {
    assertContactLabelFree(tx, source.name, { contactId: sourceId });
  } catch (error) {
    // The source name would become an alias, but another contact name or alias already owns it.
    if (!(error instanceof ContactLabelTakenError)) throw error;
    conflicts.push('label_taken');
  }

  const blank: Side = { id: sourceId, name: source.name, receivableCents: 0, creditCents: 0 };
  let sourceSide = blank;
  let targetSide: Side = { ...blank, id: targetId, name: target.name };
  let after = { receivableCents: 0, creditCents: 0 };
  if (!conflicts.includes('same_contact') && !conflicts.includes('source_has_sources')) {
    try {
      sourceSide = sideOf(tx, source);
      targetSide = sideOf(tx, target);
      const union = contactStatementOf(tx, targetId, [targetId, sourceId], FAR_FUTURE);
      after = { receivableCents: receivableOf(union), creditCents: union.creditCents };
      // A credit of one contact must not silently reduce what the other one owes.
      if (
        after.receivableCents !== sourceSide.receivableCents + targetSide.receivableCents ||
        after.creditCents !== sourceSide.creditCents + targetSide.creditCents
      )
        conflicts.push('would_net');
    } catch {
      conflicts.push('statement_invalid');
    }
  }
  const sourceSettlements = tx
    .select({ id: contactSettlement.id })
    .from(contactSettlement)
    .where(and(eq(contactSettlement.contactId, sourceId), isNull(contactSettlement.deletedAt)))
    .all()
    .map((r) => r.id);
  const splitRows = tx
    .select({ bookingId: booking.id, status: booking.status })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(and(eq(bookingSplit.contactId, sourceId), isNull(booking.deletedAt)))
    .all();
  const aliasCount = (id: string) => listContactAliases(tx, id).length;
  const preview = {
    source: { ...sourceSide, aliases: aliasCount(sourceId) },
    target: { ...targetSide, aliases: aliasCount(targetId) },
    after,
    stays: {
      bookingSplits: splitRows.length,
      settlements: sourceSettlements.length,
      allocations: sourceSettlements.length
        ? tx
            .select({ id: contactAllocation.id })
            .from(contactAllocation)
            .where(
              and(
                inArray(contactAllocation.settlementId, sourceSettlements),
                isNull(contactAllocation.deletedAt),
              ),
            )
            .all().length
        : 0,
      payslips: tx
        .select({ id: payslip.id })
        .from(payslip)
        .where(and(eq(payslip.employerContactId, sourceId), isNull(payslip.deletedAt)))
        .all().length,
      reconciledBookings: new Set(
        splitRows.filter((r) => r.status === 'reconciled').map((r) => r.bookingId),
      ).size,
    },
    moves: {
      payees: sourceConfig.payees.length,
      expectedPayments: sourceConfig.expected.length,
      accounts: sourceConfig.accounts.length,
    },
    newAlias: source.name,
    conflicts,
  };
  const fingerprint = {
    sourceId,
    targetId,
    rows: [source, target].map((r) => [r.id, r.updatedAt, r.archivedAt, r.mergedIntoId]),
    aliases: [sourceId, targetId].map((id) =>
      listContactAliases(tx, id).map((a) => [a.id, a.updatedAt]),
    ),
    cents: [preview.source, preview.target].map((s) => [s.receivableCents, s.creditCents]),
    stamps: [sourceId, targetId].map((id) => referenceStamps(tx, id)),
    config: [sourceConfig, targetConfig],
  };
  return { preview, fingerprint };
}

/** Read-only: what a merge would do, with a stateless token that authorises exactly this state. */
export function previewContactMerge(
  db: Executor,
  sourceId: string,
  targetId: string,
  options: ContactMergeOptions,
): ContactMergePreview {
  const now = options.now ?? new Date();
  const { preview, fingerprint } = computePreview(db, sourceId, targetId);
  const expiresMs = now.getTime() + PREVIEW_TTL_MS;
  return {
    ...preview,
    token: preview.conflicts.length
      ? null
      : `${expiresMs}.${sign(options.secret, fingerprint, expiresMs)}`,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/** Commit a merge that was previewed: one audited group, refused (nothing written) when stale. */
export function commitContactMerge(
  db: Executor,
  sourceId: string,
  targetId: string,
  token: string,
  ctx: AuditContext,
  options: ContactMergeOptions,
) {
  const grouped = withGroup(ctx);
  const now = options.now ?? new Date();
  return runInTransaction(db, (tx) => {
    const { preview, fingerprint } = computePreview(tx, sourceId, targetId);
    if (preview.conflicts.length) throw new ContactMergeConflictError(preview.conflicts);
    const [expires = '', mac = ''] = token.split('.');
    const expiresMs = Number(expires);
    const expected = sign(options.secret, fingerprint, expiresMs);
    if (
      !Number.isFinite(expiresMs) ||
      expiresMs < now.getTime() ||
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    )
      throw new StalePreviewError();

    const source = liveContact(tx, sourceId);
    updateTracked(
      tx,
      contact,
      [sourceId],
      { mergedIntoId: targetId, archivedAt: now.toISOString() },
      grouped,
    );
    insertTracked(
      tx,
      contactAlias,
      {
        id: randomUUID(),
        contactId: targetId,
        alias: source.name,
        aliasNorm: normalizeContactLabel(source.name),
      },
      grouped,
    );
    const rows = configRows(tx, sourceId);
    for (const [table, ids] of [
      [payee, rows.payees],
      [expectedPayment, rows.expected],
      [account, rows.accounts],
    ] as const)
      for (const rowId of ids) updateTracked(tx, table, [rowId], { contactId: targetId }, grouped);

    // The merged identity must equal the preview: plain union, nothing netted (fails closed).
    const union = contactStatementOf(tx, targetId, [targetId, sourceId], FAR_FUTURE);
    if (
      receivableOf(union) !== preview.after.receivableCents ||
      union.creditCents !== preview.after.creditCents
    )
      throw new StalePreviewError();
    assertContactSettlementInvariants(tx);
    return liveContact(tx, targetId);
  });
}

type UndoEntry = {
  id: string;
  groupId: string | null;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const SOURCE_COLUMNS: [string, string][] = [
  ['booking_split', 'contact_id'],
  ['contact_settlement', 'contact_id'],
  ['payee', 'contact_id'],
  ['expected_payment', 'contact_id'],
  ['account', 'contact_id'],
  ['payslip', 'employer_contact_id'],
];

/**
 * Undo guard for a merge group, evaluated inside the Undo transaction: only the whole group can
 * be undone, and nothing may have been created or changed under the source id since the merge.
 * (A repointed row that changed since is refused by the generic staleness rule.)
 */
export function assertContactMergeUndo(
  tx: Executor,
  entries: readonly UndoEntry[],
  partial: boolean,
): void {
  for (const merge of entries) {
    if (
      merge.entityType !== 'contact' ||
      merge.before?.['merged_into_id'] != null ||
      merge.after?.['merged_into_id'] == null
    )
      continue;
    if (partial)
      throw new AuditError('Eine Zusammenführung kann nur als Ganzes rückgängig gemacht werden.');
    const sourceId = merge.entityId;
    const position = tx.get<{ r: number }>(
      sql`select rowid as r from audit_log where id = ${merge.id}`,
    );
    if (!position) continue;
    const refuse = (what: string): never => {
      throw new AuditError(
        `Rückgängig nicht möglich: Seit der Zusammenführung wurde ${what} unter dem alten Kontakt angelegt oder geändert.`,
      );
    };
    for (const [entityType, column] of SOURCE_COLUMNS) {
      const hit = tx.get<{ n: number }>(
        sql`select count(*) as n from audit_log where rowid > ${position.r} and entity_type = ${entityType} and coalesce(group_id, '') <> ${merge.groupId ?? ''} and action <> 'undo' and json_extract(after_json, ${'$.' + column}) = ${sourceId}`,
      );
      if (hit && hit.n > 0) refuse('Daten');
    }
    // An allocation created since the merge that ties the source to another identity.
    const later = tx.all<{ settlement_id: string; outlay_split_id: string }>(
      sql`select json_extract(after_json, '$.settlement_id') as settlement_id, json_extract(after_json, '$.outlay_split_id') as outlay_split_id from audit_log where rowid > ${position.r} and entity_type = 'contact_allocation' and after_json is not null`,
    );
    for (const a of later) {
      const owner = tx
        .select({ contactId: contactSettlement.contactId })
        .from(contactSettlement)
        .where(eq(contactSettlement.id, a.settlement_id))
        .get()?.contactId;
      const outlay = tx
        .select({ contactId: bookingSplit.contactId })
        .from(bookingSplit)
        .where(eq(bookingSplit.id, a.outlay_split_id))
        .get()?.contactId;
      if (owner && outlay && owner !== outlay && (owner === sourceId || outlay === sourceId))
        refuse('eine Zuordnung');
    }
  }
}
