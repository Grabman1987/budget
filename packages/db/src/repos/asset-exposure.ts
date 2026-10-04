import { splitAssetExposure, todayInVienna } from '@budget/domain';
import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { assetClass, security, securityAssetExposure, securityExposureVersion } from '../schema';
import { deleteTracked, insertTracked, updateTracked, withGroup, type AuditContext } from './audit';
import { BookingInvariantError } from './errors';
import { runInTransaction, type Executor } from './types';

export interface ExposureInput {
  validFrom?: string;
  complete: boolean;
  source: string;
  weights: { assetClassId: string; weightBp: number }[];
}

/** The only effective-date resolver. No timeless legacy fallback, including before first version. */
export function exposuresAsOf(db: Executor, day: string) {
  const versions = db
    .select()
    .from(securityExposureVersion)
    .where(lte(securityExposureVersion.validFrom, day))
    .orderBy(desc(securityExposureVersion.validFrom))
    .all();
  const members = db
    .select()
    .from(securityAssetExposure)
    .orderBy(asc(securityAssetExposure.assetClassId))
    .all();
  const result = new Map<
    string,
    {
      validFrom: string;
      complete: boolean;
      source: string;
      weights: { assetClassId: string; weightBp: number }[];
    }
  >();
  for (const v of versions) {
    if (result.has(v.securityId)) continue;
    result.set(v.securityId, {
      validFrom: v.validFrom,
      complete: v.complete,
      source: v.source,
      weights: members
        .filter((m) => m.versionId === v.id)
        .map((m) => ({ assetClassId: m.assetClassId, weightBp: m.weightBp })),
    });
  }
  return result;
}

export function assetExposureOfSecurityAsOf(db: Executor, securityId: string, day: string) {
  return (
    exposuresAsOf(db, day).get(securityId) ?? {
      validFrom: null,
      complete: false,
      source: 'unknown',
      weights: [],
    }
  );
}

export function replaceExposureVersion(
  db: Executor,
  securityId: string,
  input: ExposureInput,
  ctx: AuditContext,
) {
  const validFrom = input.validFrom ?? todayInVienna();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(validFrom) ||
    !Number.isFinite(Date.parse(validFrom)) ||
    new Date(validFrom).toISOString().slice(0, 10) !== validFrom
  )
    throw new BookingInvariantError('Bitte ein gültiges Wirksamkeitsdatum eingeben.');
  const sum = input.weights.reduce((a, w) => a + w.weightBp, 0);
  if (
    typeof input.complete !== 'boolean' ||
    input.weights.length > 50 ||
    input.weights.some(
      (w) => !Number.isSafeInteger(w.weightBp) || w.weightBp <= 0 || w.weightBp > 10000,
    ) ||
    new Set(input.weights.map((w) => w.assetClassId)).size !== input.weights.length ||
    sum > 10000 ||
    (input.complete && sum !== 10000)
  )
    throw new BookingInvariantError(
      'Die Klassengewichte müssen genau 100,00 % ergeben; fehlende Anteile ausdrücklich als unvollständig kennzeichnen.',
    );
  if (!input.source.trim() || input.source.length > 120)
    throw new BookingInvariantError('Bitte eine Quelle mit höchstens 120 Zeichen eingeben.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (
      !tx
        .select()
        .from(security)
        .where(and(eq(security.id, securityId), isNull(security.deletedAt)))
        .get()
    )
      throw new BookingInvariantError('Das Wertpapier ist nicht verfügbar.');
    const live = new Set(
      tx
        .select()
        .from(assetClass)
        .where(isNull(assetClass.deletedAt))
        .all()
        .map((r) => r.id),
    );
    if (input.weights.some((w) => !live.has(w.assetClassId)))
      throw new BookingInvariantError('Bitte vorhandene aktive Anlageklassen wählen.');
    const old = tx
      .select()
      .from(securityExposureVersion)
      .where(
        and(
          eq(securityExposureVersion.securityId, securityId),
          eq(securityExposureVersion.validFrom, validFrom),
        ),
      )
      .get();
    const versionId = old?.id ?? randomUUID();
    if (old) {
      for (const row of tx
        .select()
        .from(securityAssetExposure)
        .where(eq(securityAssetExposure.versionId, versionId))
        .all())
        deleteTracked(tx, securityAssetExposure, [row.id], grouped);
      updateTracked(
        tx,
        securityExposureVersion,
        [versionId],
        { complete: input.complete, source: input.source.trim(), auditGroupId: grouped.groupId },
        grouped,
      );
    } else
      insertTracked(
        tx,
        securityExposureVersion,
        {
          id: versionId,
          securityId,
          validFrom,
          complete: input.complete,
          source: input.source.trim(),
          auditGroupId: grouped.groupId,
        },
        grouped,
      );
    for (const w of input.weights)
      insertTracked(
        tx,
        securityAssetExposure,
        {
          id: randomUUID(),
          versionId,
          securityId,
          validFrom,
          ...w,
          source: input.source.trim(),
          auditGroupId: grouped.groupId,
        },
        grouped,
      );
    return assetExposureOfSecurityAsOf(tx, securityId, validFrom);
  });
}

/** Used after undo too: a partial replay must never leave a corrupt complete set. */
export function assertExposureInvariants(db: Executor) {
  const members = db.select().from(securityAssetExposure).all();
  for (const v of db.select().from(securityExposureVersion).all()) {
    const rows = members.filter((m) => m.versionId === v.id);
    const sum = rows.reduce((a, r) => a + r.weightBp, 0);
    if (
      (v.complete && sum !== 10000) ||
      sum > 10000 ||
      rows.some(
        (r) =>
          r.securityId !== v.securityId || r.validFrom !== v.validFrom || r.source !== v.source,
      )
    )
      throw new BookingInvariantError('Klassenzuordnung nur als gesamte Aktion rückgängig machen.');
  }
}

export { splitAssetExposure };

export function singleAssetClass(weights: readonly { assetClassId: string; weightBp: number }[]) {
  return weights.length === 1 && weights[0]!.weightBp === 10000 ? weights[0]!.assetClassId : null;
}
