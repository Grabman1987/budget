import { splitAssetExposure, todayInVienna } from '@budget/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
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

type Exposure = {
  validFrom: string;
  complete: boolean;
  source: string;
  weights: { assetClassId: string; weightBp: number }[];
};

/**
 * Effective-date resolver for many days: reads the versions and members once and answers every
 * day from memory. The answer only changes at a `validFrom`, so days between two versions share
 * one result (and the same `weights` arrays, which callers use as a cheap "unchanged" test).
 */
export function exposureResolver(db: Executor) {
  const versions = db
    .select()
    .from(securityExposureVersion)
    .orderBy(asc(securityExposureVersion.validFrom))
    .all();
  const membersByVersion = new Map<string, { assetClassId: string; weightBp: number }[]>();
  for (const m of db
    .select()
    .from(securityAssetExposure)
    .orderBy(asc(securityAssetExposure.assetClassId))
    .all()) {
    const list = membersByVersion.get(m.versionId) ?? [];
    list.push({ assetClassId: m.assetClassId, weightBp: m.weightBp });
    membersByVersion.set(m.versionId, list);
  }
  const cache = new Map<number, Map<string, Exposure>>();
  return (day: string): Map<string, Exposure> => {
    let applicable = 0;
    while (applicable < versions.length && versions[applicable]!.validFrom <= day) applicable++;
    const hit = cache.get(applicable);
    if (hit) return hit;
    const result = new Map<string, Exposure>();
    for (let i = applicable - 1; i >= 0; i--) {
      const v = versions[i]!;
      if (result.has(v.securityId)) continue;
      result.set(v.securityId, {
        validFrom: v.validFrom,
        complete: v.complete,
        source: v.source,
        weights: (membersByVersion.get(v.id) ?? []).map((w) => ({ ...w })),
      });
    }
    cache.set(applicable, result);
    return result;
  };
}

/** The only effective-date resolver. No timeless legacy fallback, including before first version. */
export function exposuresAsOf(db: Executor, day: string) {
  return exposureResolver(db)(day);
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
        .where(and(isNull(assetClass.deletedAt), eq(assetClass.isGroup, false)))
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
