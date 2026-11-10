import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { contact, contactAlias } from '../schema';
import { ContactArchivedError, ContactLabelTakenError } from './errors';
import type { Executor } from './types';

/** Lowercase, NFKC-normalised, whitespace-collapsed form shared by names and aliases (#870). */
export function normalizeContactLabel(label: string): string {
  return label.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Refuse a label (new name, rename or alias) that equals the normalised name of another active
 * contact or any active alias. Legacy near-duplicates that already exist are not touched: only
 * the label being written is compared.
 */
export function assertContactLabelFree(
  tx: Executor,
  label: string,
  except: { contactId?: string; aliasId?: string } = {},
): void {
  const norm = normalizeContactLabel(label);
  for (const row of tx
    .select({ id: contact.id, name: contact.name })
    .from(contact)
    .where(
      except.contactId
        ? and(isNull(contact.deletedAt), ne(contact.id, except.contactId))
        : isNull(contact.deletedAt),
    )
    .all())
    if (normalizeContactLabel(row.name) === norm)
      throw new ContactLabelTakenError(row.id, row.name, 'name');
  assertNoActiveAlias(tx, norm, except.aliasId);
}

/** An active alias with this normalised label (of any contact) refuses a contact name. */
export function assertNoActiveAlias(tx: Executor, norm: string, exceptAliasId?: string): void {
  const hit = tx
    .select({ id: contactAlias.id, contactId: contactAlias.contactId })
    .from(contactAlias)
    .where(and(eq(contactAlias.aliasNorm, norm), isNull(contactAlias.deletedAt)))
    .get();
  if (!hit || hit.id === exceptAliasId) return;
  const owner = tx
    .select({ name: contact.name })
    .from(contact)
    .where(eq(contact.id, hit.contactId))
    .get();
  throw new ContactLabelTakenError(hit.contactId, owner?.name ?? '?', 'alias');
}

/**
 * Write-time resolution (#871): a writer that names a merged source id lands on the target, so no
 * new data is created under a merged id. Ids that are not merged pass through unchanged.
 */
export function resolveContactForWrite<T extends string | null | undefined>(
  tx: Executor,
  contactId: T,
): T {
  return (contactId ? resolveContactRoot(tx, contactId) : contactId) as T;
}

/** Writers must not attach new data to an archived contact. */
export function assertContactActive(tx: Executor, contactId: string | null | undefined): void {
  if (!contactId) return;
  const row = tx
    .select({ archivedAt: contact.archivedAt })
    .from(contact)
    .where(eq(contact.id, contactId))
    .get();
  if (row?.archivedAt) throw new ContactArchivedError(contactId);
}

export function listContactAliases(db: Executor, contactId?: string) {
  return db
    .select()
    .from(contactAlias)
    .where(
      contactId
        ? and(isNull(contactAlias.deletedAt), eq(contactAlias.contactId, contactId))
        : isNull(contactAlias.deletedAt),
    )
    .orderBy(asc(contactAlias.aliasNorm), asc(contactAlias.id))
    .all();
}

/** `merged_into_id ?? id`: the identity a (possibly merged) contact id resolves to (#871). */
export function resolveContactRoot(tx: Executor, contactId: string): string {
  const row = tx
    .select({ mergedIntoId: contact.mergedIntoId })
    .from(contact)
    .where(eq(contact.id, contactId))
    .get();
  return row?.mergedIntoId ?? contactId;
}

/** The root plus every contact merged into it; the ids whose rows form the root's statement. */
export function contactIdentityIds(tx: Executor, contactId: string): string[] {
  const root = resolveContactRoot(tx, contactId);
  const sources = tx
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.mergedIntoId, root))
    .orderBy(asc(contact.id))
    .all()
    .map((r) => r.id);
  return [root, ...sources];
}
