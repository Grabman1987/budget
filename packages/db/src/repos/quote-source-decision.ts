import { and, eq, isNull } from 'drizzle-orm';
import { inboxItem } from '../schema';
import { nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { holdingValuationAsOf } from './portfolio';
import { getSecurity, updateSecurity } from './securities';
import { runInTransaction, type Executor } from './types';

/** Resolution prefixes of a price-source warning closed by an owner decision (reason follows). */
export const MANUAL_ONLY_RESOLUTION = 'Nur manuelle Kurse';
export const FETCH_OFF_RESOLUTION = 'Automatischer Abruf aus (historischer Bestand)';

/** Whether the instrument has units on `asOf`; no holding means a "historischer Bestand". */
export function securityIsHeld(db: Executor, securityId: string, asOf: string) {
  return holdingValuationAsOf(db, asOf).values.some(
    (v) => v.securityId === securityId && v.unitsE8 !== 0,
  );
}

/** Ids of the instruments with units on `asOf`; the others are "historische Bestände". */
export function heldSecurityIds(db: Executor, asOf: string): Set<string> {
  return new Set(
    holdingValuationAsOf(db, asOf)
      .values.filter((v) => v.unitsE8 !== 0)
      .map((v) => v.securityId),
  );
}

/**
 * The owner decides that a price source is not repaired but switched off: `manual_only` keeps the
 * instrument and its manual prices, `fetch_off` is only for instruments without a current holding.
 * Switches the automatic fetch off (audited, undoable) and closes the open price-source warnings of
 * the instrument with the reason. Never stores a price.
 */
export function decideQuoteSource(
  db: Executor,
  securityId: string,
  decision: { mode: 'manual_only' | 'fetch_off'; reason: string },
  asOf: string,
  ctx: AuditContext,
) {
  const reason = decision.reason.trim();
  if (reason.length < 3) throw new ConflictError('Bitte einen Grund angeben.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const sec = getSecurity(tx, securityId);
    if (!sec) throw new EntityNotFoundError('security', securityId);
    if (decision.mode === 'fetch_off' && securityIsHeld(tx, securityId, asOf))
      throw new ConflictError(
        'Der automatische Abruf kann nur für Instrumente ohne aktuellen Bestand abgeschaltet werden.',
      );
    const open = tx
      .select({ id: inboxItem.id })
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.kind, 'stale_value'),
          eq(inboxItem.refType, 'security'),
          eq(inboxItem.refId, securityId),
          isNull(inboxItem.resolvedAt),
        ),
      )
      .all();
    const label = decision.mode === 'manual_only' ? MANUAL_ONLY_RESOLUTION : FETCH_OFF_RESOLUTION;
    for (const { id } of open)
      updateTracked(
        tx,
        inboxItem,
        [id],
        { resolvedAt: nowIso(), resolution: `${label}: ${reason.slice(0, 200)}` },
        grouped,
      );
    if (sec.pricesEnabled) updateSecurity(tx, securityId, { pricesEnabled: false }, grouped);
    return { resolved: open.length, groupId: grouped.groupId };
  });
}

/**
 * The owner chooses "mit EZB-Kurs umrechnen" for an instrument whose price source quotes in another
 * currency (`currency` = that currency), or clears the choice (`null`). Audited, undoable. Stores no
 * price: the next fetch converts each quote with the ECB rate of its day.
 */
export function setQuoteFxCurrency(
  db: Executor,
  securityId: string,
  currency: string | null,
  ctx: AuditContext,
) {
  if (currency !== null && !/^[A-Z]{3}$/.test(currency))
    throw new ConflictError('Bitte einen dreistelligen Währungscode angeben.');
  return runInTransaction(db, (tx) => {
    const sec = getSecurity(tx, securityId);
    if (!sec) throw new EntityNotFoundError('security', securityId);
    if (currency === sec.currency)
      throw new ConflictError('Die Kursquelle liefert bereits in der Währung des Instruments.');
    const grouped = withGroup(ctx);
    if (sec.quoteFxCurrency !== currency)
      updateSecurity(tx, securityId, { quoteFxCurrency: currency }, grouped);
    return { quoteFxCurrency: currency, groupId: grouped.groupId };
  });
}
