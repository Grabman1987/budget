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
    if (sec.pricesEnabled) updateSecurity(tx, securityId, { pricesEnabled: false }, grouped);
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
    return { resolved: open.length, groupId: grouped.groupId };
  });
}
