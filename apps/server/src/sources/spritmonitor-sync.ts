import { createHash, randomUUID } from 'node:crypto';
import { and, count, eq, like, gte, lte, lt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  account,
  appSetting,
  auditLog,
  booking,
  bookingSplit,
  category,
  payee,
  inboxItem,
  createEntity,
  updateEntity,
  getEntity,
  history,
  importBooking,
  writesHeld,
  type Db,
  type AuditContext,
} from '@budget/db';
import { addDays, todayInVienna } from '@budget/domain';
import { ApiError } from '../api/http';
import { spritmonitorApi, type SpritmonitorFueling } from './spritmonitor-api';

type Executor = Parameters<typeof getEntity>[0];
const PREFIX = 'spritmonitor.row.';
const stateKey = (config: SpritmonitorConfig) =>
  `spritmonitor.sync.${config.vehicleId}.${config.tankId}`;
const id = z.string().trim().min(1).max(200);
const configSchema = z.object({
  vehicleId: z.coerce.number().int().positive().max(2147483647),
  tankId: z.coerce.number().int().positive().max(2147483647),
  accountId: id,
  categoryId: id,
  startDate: z.iso.date(),
});
export type SpritmonitorConfig = z.infer<typeof configSchema>;
export function spritmonitorConfigFromEnv(env = process.env): SpritmonitorConfig | null {
  if (env['BUDGET_SPRITMONITOR_ENABLED'] !== '1') return null;
  const parsed = configSchema.safeParse({
    vehicleId: env['SPRITMONITOR_VEHICLE_ID'],
    tankId: env['SPRITMONITOR_TANK_ID'],
    accountId: env['SPRITMONITOR_ACCOUNT_ID'],
    categoryId: env['SPRITMONITOR_CATEGORY_ID'],
    startDate: env['SPRITMONITOR_START_DATE'],
  });
  if (!parsed.success) throw unavailable();
  return parsed.data;
}
const unavailable = () =>
  new ApiError(
    409,
    'spritmonitor_unconfigured',
    'Spritmonitor ist nicht vollständig eingerichtet.',
  );
const conflict = () =>
  new ApiError(409, 'spritmonitor_conflict', 'Daten haben sich geändert. Erneut abrufen.');
const busy = () =>
  new ApiError(409, 'spritmonitor_busy', 'Abruf oder Datenübernahme läuft bereits.');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (sourceId: string) => PREFIX + hash(sourceId).slice(0, 40);
const fingerprint = (row: SpritmonitorFueling) => hash(row);
interface SourceRecord {
  source: SpritmonitorFueling;
  fingerprint: string;
  originalSource: SpritmonitorFueling;
  originalFingerprint: string;
  bookingId: string | null;
  status: 'booked' | 'review' | 'linked' | 'ignored';
  reason: string | null;
  candidates: string[];
  changed?: SpritmonitorFueling;
}
interface SyncState {
  vehicleId: number;
  tankId: number;
  bootstrapThrough: string;
  lastSuccess: string;
}
function read<T>(db: Executor, setting: string): T | null {
  const value = getEntity(db, appSetting, setting)?.value;
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw conflict();
  }
}
function readState(db: Executor, config: SpritmonitorConfig) {
  const state = read<SyncState>(db, stateKey(config));
  if (state && (state.vehicleId !== config.vehicleId || state.tankId !== config.tankId))
    throw conflict();
  return state;
}
function save(db: Executor, setting: string, value: unknown, ctx: AuditContext) {
  const serialized = JSON.stringify(value);
  const previous = getEntity(db, appSetting, setting);
  if (!previous) createEntity(db, appSetting, { id: setting, value: serialized }, ctx);
  else if (previous.value !== serialized)
    updateEntity(db, appSetting, setting, { value: serialized }, ctx);
}
function validateDestination(db: Executor, config: SpritmonitorConfig) {
  const a = getEntity(db, account, config.accountId);
  const c = getEntity(db, category, config.categoryId);
  if (
    !a ||
    a.closedAt ||
    a.currency !== 'EUR' ||
    !a.onBudget ||
    !['checking', 'credit_card', 'savings'].includes(a.type) ||
    !c ||
    c.hiddenAt ||
    !['fixed', 'periodic', 'variable', 'project'].includes(c.kind)
  )
    throw unavailable();
}
function auditVersion(db: Executor) {
  return db.select({ n: count() }).from(auditLog).get()!.n;
}
function globalBooking(db: Executor, sourceId: string) {
  return db.select().from(booking).where(eq(booking.importKey, sourceId)).all();
}
function rows(db: Executor) {
  return db
    .select()
    .from(appSetting)
    .where(like(appSetting.id, PREFIX + '%'))
    .all()
    .map((r) => {
      const record = read<SourceRecord>(db, r.id)!;
      return {
        key: r.id,
        ...record,
        reviewFingerprint: fingerprint(record.changed ?? record.source),
      };
    });
}
function possibleMatches(
  db: Executor,
  row: SpritmonitorFueling,
  config: SpritmonitorConfig,
  today: string,
) {
  const lower = addDays(row.date, -2),
    upper = addDays(row.date, 2) < today ? addDays(row.date, 2) : today;
  // Date and fuel evidence, deliberately independent of amount: statements can contain net costs.
  const all = db
    .select()
    .from(booking)
    .where(and(gte(booking.date, lower), lte(booking.date, upper), lt(booking.amountCents, 0)))
    .all();
  if (!all.length) return [];
  const fuel = new Set(
    db
      .select({ bookingId: bookingSplit.bookingId })
      .from(bookingSplit)
      .where(
        and(
          eq(bookingSplit.categoryId, config.categoryId),
          inArray(
            bookingSplit.bookingId,
            all.map((b) => b.id),
          ),
        ),
      )
      .all()
      .map((s) => s.bookingId),
  );
  const names = new Map(
    db
      .select()
      .from(payee)
      .all()
      .map((p) => [p.id, p.name]),
  );
  const station = row.stationName?.toLocaleLowerCase();
  return all
    .filter(
      (b) =>
        b.amountCents < 0 &&
        b.date >= lower &&
        b.date <= upper &&
        !b.transferId &&
        (fuel.has(b.id) ||
          /tank|fuel|sprit|austrocard|omv|shell|eni|avia|jet\b|bp\b/i.test(
            [b.memo, b.bankRawText, b.bankRawPayee, b.payeeId && names.get(b.payeeId)].join(' '),
          ) ||
          (station &&
            station.length >= 3 &&
            [b.memo, b.bankRawPayee, b.payeeId && names.get(b.payeeId)]
              .join(' ')
              .toLocaleLowerCase()
              .includes(station))),
    )
    .map((b) => b.id)
    .slice(0, 100);
}
function review(db: Executor, rowKey: string, record: SourceRecord, ctx: AuditContext) {
  const existing = db
    .select()
    .from(inboxItem)
    .where(and(eq(inboxItem.refType, 'spritmonitor'), eq(inboxItem.refId, rowKey)))
    .get();
  if (!existing)
    createEntity(
      db,
      inboxItem,
      {
        id: randomUUID(),
        kind: 'import',
        title: 'Spritmonitor: Tankung prüfen',
        detail: 'Quelle und bestehende Buchungen abgleichen; Betrag und Konto bleiben unverändert.',
        refType: 'spritmonitor',
        refId: rowKey,
      },
      ctx,
    );
  else if (existing.resolvedAt)
    updateEntity(db, inboxItem, existing.id, { resolvedAt: null, resolution: null }, ctx);
  save(db, rowKey, record, ctx);
}
function closeReview(db: Executor, rowKey: string, now: string, ctx: AuditContext) {
  for (const item of db
    .select()
    .from(inboxItem)
    .where(and(eq(inboxItem.refType, 'spritmonitor'), eq(inboxItem.refId, rowKey)))
    .all())
    if (!item.resolvedAt)
      updateEntity(
        db,
        inboxItem,
        item.id,
        { resolvedAt: now, resolution: 'Spritmonitor geprüft' },
        ctx,
      );
}
function previouslyBooked(db: Executor, sourceId: string) {
  return history(db, 'app_setting', key(sourceId)).some((entry) =>
    [entry.before, entry.after].some((snapshot) => {
      if (typeof snapshot?.value !== 'string') return false;
      try {
        const prior = JSON.parse(snapshot.value) as SourceRecord;
        return prior.status === 'booked' && Boolean(prior.bookingId);
      } catch {
        throw conflict();
      }
    }),
  );
}
function book(
  db: Executor,
  row: SpritmonitorFueling,
  config: SpritmonitorConfig,
  ctx: AuditContext,
) {
  if (row.status !== 'importable') throw conflict();
  // A prior creation undone back to review is restored only through native redo.
  if (previouslyBooked(db, row.sourceId)) throw conflict();
  const global = globalBooking(db, row.sourceId);
  if (global.length) throw conflict();
  return importBooking(
    db,
    {
      accountId: config.accountId,
      date: row.date,
      amountCents: row.amountCents,
      currency: 'EUR',
      status: 'pending',
      source: 'import',
      importKey: row.sourceId,
      memo: ['Spritmonitor', row.stationName, row.location, row.note].filter(Boolean).join(' · '),
      splits: [{ categoryId: config.categoryId, amountCents: row.amountCents }],
    },
    ctx,
  ).id;
}

const running = new WeakSet<Db>();
const lastResult = new WeakMap<
  Db,
  { sourceKey: string; lastAttempt: string; lastSuccess: string | null; failed: boolean }
>();
export interface SpritmonitorSyncOptions {
  config?: () => SpritmonitorConfig | null;
  client?: Pick<ReturnType<typeof spritmonitorApi>, 'configured' | 'fuelings'>;
}
export function spritmonitorSync(db: Db, options: SpritmonitorSyncOptions = {}) {
  const config = options.config ?? spritmonitorConfigFromEnv;
  const client = options.client ?? spritmonitorApi();
  function ready() {
    const value = config();
    if (!value || !client.configured()) throw unavailable();
    validateDestination(db, value);
    return value;
  }
  return {
    status() {
      let settings: SpritmonitorConfig | null = null;
      try {
        settings = ready();
      } catch {
        /* No private configuration/errors in status. */
      }
      return {
        configured: Boolean(settings),
        running: running.has(db),
        lastResult:
          settings && lastResult.get(db)?.sourceKey === stateKey(settings)
            ? lastResult.get(db)
            : null,
        state: settings ? readState(db, settings) : null,
        destination: settings
          ? {
              accountId: settings.accountId,
              accountName: getEntity(db, account, settings.accountId)!.name,
              categoryName: getEntity(db, category, settings.categoryId)!.name,
            }
          : null,
        rows: rows(db).map((row) => {
          const source = row.changed ?? row.source;
          const canResolve = Boolean(
            settings &&
            row.status === 'review' &&
            source.vehicleId === settings.vehicleId &&
            source.tankId === settings.tankId &&
            source.date >= settings.startDate,
          );
          return {
            ...row,
            canResolve,
            canBook:
              canResolve &&
              source.status === 'importable' &&
              !row.bookingId &&
              !previouslyBooked(db, source.sourceId) &&
              globalBooking(db, source.sourceId).length === 0,
          };
        }),
      };
    },
    async refresh(now = new Date(), actor = 'system') {
      const settings = ready();
      const today = todayInVienna(now);
      if (settings.startDate > today) throw unavailable();
      if (running.has(db) || writesHeld(db)) throw busy();
      running.add(db);
      const scope = stateKey(settings);
      const previousSuccess =
        lastResult.get(db)?.sourceKey === scope ? lastResult.get(db)!.lastSuccess : null;
      lastResult.set(db, {
        sourceKey: scope,
        lastAttempt: now.toISOString(),
        lastSuccess: previousSuccess,
        failed: false,
      });
      const version = auditVersion(db);
      try {
        // Complete bounded response is validated before opening the write transaction.
        const payload = await client.fuelings(settings.vehicleId, settings.tankId, {
          from: settings.startDate,
          to: today,
        });
        if (payload.length > 10_000) throw conflict();
        const seen = new Set<string>();
        for (const row of payload) {
          if (
            row.sourceId !==
              `spritmonitor:${settings.vehicleId}:${settings.tankId}:${row.remoteId}` ||
            row.vehicleId !== settings.vehicleId ||
            row.tankId !== settings.tankId ||
            !Number.isSafeInteger(row.remoteId) ||
            row.remoteId <= 0 ||
            !z.iso.date().safeParse(row.date).success ||
            row.date < settings.startDate ||
            row.date > today ||
            (row.status === 'importable' &&
              (row.currency !== 'EUR' ||
                !Number.isSafeInteger(row.amountCents) ||
                row.amountCents >= 0)) ||
            seen.has(row.sourceId)
          )
            throw conflict();
          seen.add(row.sourceId);
        }
        if (writesHeld(db)) throw busy();
        const ctx = { actor, groupId: randomUUID() };
        const result = db.transaction((tx) => {
          if (auditVersion(tx) !== version || hash(ready()) !== hash(settings)) throw conflict();
          const previous = readState(tx, settings);
          const bootstrapThrough = previous?.bootstrapThrough ?? today;
          let imported = 0,
            pendingReview = 0,
            linked = 0;
          for (const row of payload) {
            const rowKey = key(row.sourceId),
              fp = fingerprint(row);
            const current = read<SourceRecord>(tx, rowKey);
            if (current) {
              if (fingerprint(current.changed ?? current.source) === fp) continue;
              review(
                tx,
                rowKey,
                { ...current, changed: row, status: 'review', reason: 'source_changed' },
                ctx,
              );
              pendingReview++;
              continue;
            }
            // Undo can remove both the row and its booking. Retained audit identity is a tombstone.
            if (history(tx, 'app_setting', rowKey).length) continue;
            const global = globalBooking(tx, row.sourceId);
            const record: SourceRecord = {
              source: row,
              fingerprint: fp,
              originalSource: row,
              originalFingerprint: fp,
              bookingId: null,
              status: 'review',
              reason: null,
              candidates: [],
            };
            if (global.length === 1) {
              save(tx, rowKey, { ...record, status: 'linked', bookingId: global[0]!.id }, ctx);
              linked++;
              continue;
            }
            const candidates = possibleMatches(tx, row, settings, today);
            const reason =
              row.status !== 'importable'
                ? row.reason
                : global.length
                  ? 'identity_conflict'
                  : row.date <= bootstrapThrough
                    ? 'bootstrap'
                    : candidates.length
                      ? 'possible_duplicate'
                      : null;
            if (reason) {
              review(tx, rowKey, { ...record, reason, candidates }, ctx);
              pendingReview++;
            } else {
              save(
                tx,
                rowKey,
                { ...record, status: 'booked', bookingId: book(tx, row, settings, ctx) },
                ctx,
              );
              imported++;
            }
          }
          // An unchanged replay writes no source state or audit rows.
          if (!previous || imported || pendingReview || linked)
            save(
              tx,
              scope,
              {
                vehicleId: settings.vehicleId,
                tankId: settings.tankId,
                bootstrapThrough,
                lastSuccess: now.toISOString(),
              },
              ctx,
            );
          return {
            imported,
            linked,
            review: pendingReview,
            groupId: imported || pendingReview || linked || !previous ? ctx.groupId : null,
          };
        });
        lastResult.set(db, {
          sourceKey: scope,
          lastAttempt: now.toISOString(),
          lastSuccess: now.toISOString(),
          failed: false,
        });
        return result;
      } catch (error) {
        lastResult.set(db, {
          sourceKey: scope,
          lastAttempt: now.toISOString(),
          lastSuccess: previousSuccess,
          failed: true,
        });
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          422,
          'spritmonitor_failed',
          'Spritmonitor-Abruf fehlgeschlagen. Verbindung und Leserechte prüfen.',
        );
      } finally {
        running.delete(db);
      }
    },
    resolve(
      rowKey: string,
      expectedFingerprint: string,
      action: 'ignore' | 'link' | 'book',
      bookingId?: string,
    ) {
      const settings = ready();
      if (writesHeld(db) || running.has(db)) throw busy();
      return db.transaction((tx) => {
        const current = read<SourceRecord>(tx, rowKey);
        if (
          !rowKey.startsWith(PREFIX) ||
          !current ||
          current.status !== 'review' ||
          (current.changed ? fingerprint(current.changed) : current.fingerprint) !==
            expectedFingerprint
        )
          throw conflict();
        const ctx = { actor: 'owner', groupId: randomUUID() };
        const source = current.changed ?? current.source;
        if (
          source.vehicleId !== settings.vehicleId ||
          source.tankId !== settings.tankId ||
          source.date < settings.startDate
        )
          throw conflict();
        if (action === 'book' && current.bookingId) throw conflict();
        let linked = current.bookingId;
        if (action === 'link') {
          if (!bookingId) throw conflict();
          const b = tx.select().from(booking).where(eq(booking.id, bookingId)).get();
          if (
            !b ||
            b.deletedAt ||
            b.transferId ||
            b.amountCents >= 0 ||
            b.currency !== 'EUR' ||
            (b.importKey?.startsWith('spritmonitor:') && b.importKey !== source.sourceId) ||
            Math.abs(Date.parse(b.date) - Date.parse(source.date)) > 2 * 86400000 ||
            rows(tx).some((r) => r.key !== rowKey && r.bookingId === bookingId)
          )
            throw conflict();
          linked = b.id;
        } else if (action === 'book') linked = book(tx, source, settings, ctx);
        save(
          tx,
          rowKey,
          {
            source,
            fingerprint: fingerprint(source),
            originalSource: current.originalSource,
            originalFingerprint: current.originalFingerprint,
            bookingId: linked,
            status: action === 'ignore' ? 'ignored' : action === 'book' ? 'booked' : 'linked',
            reason: null,
            candidates: [],
          } satisfies SourceRecord,
          ctx,
        );
        closeReview(tx, rowKey, new Date().toISOString(), ctx);
        return { groupId: ctx.groupId, bookingId: linked };
      });
    },
    async ifDue(now = new Date()) {
      if (running.has(db) || writesHeld(db)) return;
      try {
        const settings = ready();
        const scope = stateKey(settings);
        const currentResult = lastResult.get(db)?.sourceKey === scope ? lastResult.get(db) : null;
        if (currentResult && now.getTime() - Date.parse(currentResult.lastAttempt) < 30 * 60_000)
          return;
        const last = currentResult?.lastSuccess ?? readState(db, settings)?.lastSuccess;
        if (last && todayInVienna(new Date(last)) === todayInVienna(now)) return;
        await this.refresh(now);
      } catch {
        /* Sanitized status is available through the authenticated endpoint. */
      }
    },
  };
}
