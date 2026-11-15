import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { account, contact, contactAlias, expectedPayment, payee, payslip } from '../schema';
import { insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { assertContactLabelFree, normalizeContactLabel } from './contact-label';
import { getContactStatement } from './contacts';
import {
  AuditError,
  BookingInvariantError,
  ConflictError,
  ContactBlockedError,
  ContactLabelTakenError,
  EntityNotFoundError,
  StaleError,
  type ContactBlocker,
} from './errors';
import { runInTransaction, type Executor } from './types';

/**
 * Contact aliases and archive (#870, contract `docs/redesign/contact-identity-contract.md`).
 * Every operation is one transaction and one audit group; none of them writes a booking,
 * split, settlement or allocation, so balances cannot move.
 */

const MAX_LABEL = 200;

function liveContact(tx: Executor, id: string) {
  const row = tx
    .select()
    .from(contact)
    .where(and(eq(contact.id, id), isNull(contact.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('contact', id);
  return row;
}

export function assertFresh(current: { updatedAt: string }, expectedUpdatedAt: string | undefined) {
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== current.updatedAt)
    throw new StaleError(current);
}

/** Add an alias to a live contact. `expectedUpdatedAt` is compared with the contact row. */
export function addContactAlias(
  db: Executor,
  contactId: string,
  rawAlias: string,
  ctx: AuditContext,
  options: { expectedUpdatedAt?: string } = {},
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const owner = liveContact(tx, contactId);
    assertFresh(owner, options.expectedUpdatedAt);
    const alias = rawAlias.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (alias.length === 0 || alias.length > MAX_LABEL)
      throw new BookingInvariantError('Ein Alias braucht 1 bis 200 Zeichen.');
    if (normalizeContactLabel(alias) === normalizeContactLabel(owner.name))
      throw new BookingInvariantError('Der Alias ist gleich dem Namen des Kontakts.');
    assertContactLabelFree(tx, alias);
    return insertTracked(
      tx,
      contactAlias,
      { id: randomUUID(), contactId, alias, aliasNorm: normalizeContactLabel(alias) },
      grouped,
    );
  });
}

/** Soft-delete an alias; `expectedUpdatedAt` is compared with the alias row. */
export function removeContactAlias(
  db: Executor,
  contactId: string,
  aliasId: string,
  ctx: AuditContext,
  options: { expectedUpdatedAt?: string } = {},
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const row = tx
      .select()
      .from(contactAlias)
      .where(
        and(
          eq(contactAlias.id, aliasId),
          eq(contactAlias.contactId, contactId),
          isNull(contactAlias.deletedAt),
        ),
      )
      .get();
    if (!row) throw new EntityNotFoundError('contact_alias', aliasId);
    assertFresh(row, options.expectedUpdatedAt);
    updateTracked(
      tx,
      contactAlias,
      [aliasId],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
  });
}

/** Everything that still ties a contact to money or configuration. Empty = may be archived. */
export function contactArchiveBlockers(tx: Executor, contactId: string): ContactBlocker[] {
  const blockers: ContactBlocker[] = [];
  const statement = getContactStatement(tx, contactId, '9999-12-31');
  const receivable = statement.outlays.reduce((sum, o) => sum + o.remainingCents, 0);
  if (receivable !== 0) blockers.push({ kind: 'receivable', count: receivable });
  if (statement.creditCents !== 0) blockers.push({ kind: 'credit', count: statement.creditCents });
  const refs: [ContactBlocker['kind'], number][] = [
    [
      'expected',
      tx
        .select({ id: expectedPayment.id })
        .from(expectedPayment)
        .where(and(eq(expectedPayment.contactId, contactId), isNull(expectedPayment.deletedAt)))
        .all().length,
    ],
    [
      'payee',
      tx
        .select({ id: payee.id })
        .from(payee)
        .where(and(eq(payee.contactId, contactId), isNull(payee.deletedAt)))
        .all().length,
    ],
    [
      'account',
      tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.contactId, contactId), isNull(account.deletedAt)))
        .all().length,
    ],
    [
      'payslip',
      tx
        .select({ id: payslip.id })
        .from(payslip)
        .where(and(eq(payslip.employerContactId, contactId), isNull(payslip.deletedAt)))
        .all().length,
    ],
  ];
  for (const [kind, count] of refs) if (count) blockers.push({ kind, count });
  return blockers;
}

/** Archive a contact: refused (409 with the blockers) while anything is open or linked. */
export function archiveContact(
  db: Executor,
  contactId: string,
  ctx: AuditContext,
  options: { expectedUpdatedAt?: string } = {},
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = liveContact(tx, contactId);
    assertFresh(row, options.expectedUpdatedAt);
    if (row.archivedAt) return row;
    const blockers = contactArchiveBlockers(tx, contactId);
    if (blockers.length) throw new ContactBlockedError(blockers);
    updateTracked(tx, contact, [contactId], { archivedAt: new Date().toISOString() }, grouped);
    return liveContact(tx, contactId);
  });
}

/** Reopen is always allowed; the name stays reserved while archived, so no collision can occur. */
export function reopenContact(
  db: Executor,
  contactId: string,
  ctx: AuditContext,
  options: { expectedUpdatedAt?: string } = {},
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = liveContact(tx, contactId);
    assertFresh(row, options.expectedUpdatedAt);
    if (!row.archivedAt) return row;
    // A merged source stays archived: its merge is only taken back through Undo (#871).
    if (row.mergedIntoId)
      throw new ConflictError(
        'Der Kontakt wurde zusammengeführt und kann nur per Rückgängig zurück.',
      );
    updateTracked(tx, contact, [contactId], { archivedAt: null }, grouped);
    return liveContact(tx, contactId);
  });
}

/**
 * Undo guard for #870 entries, evaluated inside the Undo transaction: restoring an alias needs
 * its label to be free again, and restoring `archived_at` (undo of a reopen) needs the blockers
 * to be gone. The generic staleness rule already refuses when the row changed afterwards.
 */
export function assertContactIdentityUndoBefore(
  tx: Executor,
  entries: readonly {
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }[],
): void {
  for (const e of entries) {
    // Restoring a removed alias needs its label to be free again (before the unique index trips).
    if (
      e.entityType !== 'contact_alias' ||
      e.before === null ||
      e.before['deleted_at'] !== null ||
      typeof e.before['alias'] !== 'string'
    )
      continue;
    try {
      assertContactLabelFree(tx, e.before['alias'], { aliasId: e.entityId });
    } catch (error) {
      if (error instanceof ContactLabelTakenError)
        throw new AuditError(`Rückgängig nicht möglich: ${error.message}`);
      throw error;
    }
  }
}

export function assertContactIdentityUndo(
  tx: Executor,
  entries: readonly {
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }[],
): void {
  for (const e of entries) {
    if (
      e.entityType === 'contact' &&
      e.before &&
      e.after &&
      e.before['archived_at'] !== e.after['archived_at'] &&
      e.before['archived_at'] != null
    ) {
      const blockers = contactArchiveBlockers(tx, e.entityId);
      if (blockers.length)
        throw new AuditError(
          'Rückgängig nicht möglich: Der Kontakt hat inzwischen offene Beträge oder Verknüpfungen.',
        );
    }
  }
}
