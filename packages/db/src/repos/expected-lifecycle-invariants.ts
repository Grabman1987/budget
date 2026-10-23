import { activeGoalAuditEntries, addDays, todayInVienna } from '@budget/domain';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AuditError, ConflictError } from './errors';
import type { Executor } from './types';

type Snapshot = Record<string, unknown>;
export interface ExpectedLifecycleEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: Snapshot | null;
  after: Snapshot | null;
  groupId: string | null;
  undoOfId: string | null;
}
interface Entry extends ExpectedLifecycleEntry {
  sequence: number;
  ts: string;
}
export interface PaymentPauseRange {
  fromDate: string;
  throughDate: string;
}
export type PaymentDeletion = 'neverAssigned' | 'everAssigned' | 'unavailable';
export interface PaymentLifecycle {
  pauses: PaymentPauseRange[];
  endedFrom: string | null;
  endEvidence: 'none' | 'proven' | 'unavailable';
  deletion: PaymentDeletion;
  reviewToken: string | null;
  /** Internal source identities only, never included in a public response. */
  revivableOccurrenceIds: Set<string>;
  revivableSkippedOccurrenceIds: Set<string>;
}
const LIMIT = 20000;
const relationTypes = new Set([
  'expected_payment',
  'expected_payment_pause',
  'expected_occurrence',
]);
const validDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T12:00:00Z')) &&
  new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
export const isPaymentLifecycleDay = validDay;
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const placeholders = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
const snapshot = (raw: unknown): Snapshot | null => {
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new Error('Missing lifecycle history');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid lifecycle history');
  return value as Snapshot;
};
function parse(row: Snapshot): Entry {
  if (
    !Number.isSafeInteger(row.sequence) ||
    typeof row.id !== 'string' ||
    typeof row.ts !== 'string' ||
    typeof row.entity_type !== 'string' ||
    typeof row.entity_id !== 'string' ||
    typeof row.action !== 'string' ||
    !(row.group_id === null || typeof row.group_id === 'string') ||
    !(row.undo_of_id === null || typeof row.undo_of_id === 'string')
  )
    throw new Error('Invalid lifecycle history');
  return {
    id: row.id,
    sequence: row.sequence as number,
    ts: row.ts,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    groupId: row.group_id,
    undoOfId: row.undo_of_id,
    before: snapshot(row.before_json),
    after: snapshot(row.after_json),
  };
}
const auditColumns = sql.raw(
  'rowid AS sequence, id, ts, action, entity_type, entity_id, before_json, after_json, group_id, undo_of_id',
);
function coherent(entries: Entry[], current: Snapshot | undefined): boolean {
  if (
    !entries.length ||
    entries[0]!.before !== null ||
    entries[0]!.action !== 'create' ||
    entries[0]!.undoOfId !== null
  )
    return false;
  return coherentSuffix(entries, current);
}
/** A new end may witness a legacy row now; this does not prove its earlier assignment history. */
function coherentSuffix(entries: Entry[], current: Snapshot | undefined): boolean {
  if (!entries.length) return false;
  let previous: Snapshot | null = entries[0]!.before;
  for (const e of entries) {
    if (stable(e.before) !== stable(previous)) return false;
    previous = e.after;
  }
  return stable(previous) === stable(current ?? null);
}
function endProof(
  payment: Snapshot,
  events: Entry[],
): Pick<PaymentLifecycle, 'endedFrom' | 'endEvidence'> {
  if (payment.end_date === null) return { endedFrom: null, endEvidence: 'none' };
  const unknown = { endedFrom: null, endEvidence: 'unavailable' as const };
  if (!validDay(payment.end_date) || !coherentSuffix(events, payment)) return unknown;
  const active = activeGoalAuditEntries(
    events.map((e) => ({ id: e.id, sequence: e.sequence, undoOfId: e.undoOfId })),
  );
  if (!active) return unknown;
  const last = events
    .filter(
      (e) =>
        e.undoOfId === null &&
        active.has(e.id) &&
        e.before !== null &&
        e.before.end_date !== e.after?.end_date,
    )
    .at(-1);
  if (!last || last.after?.end_date !== payment.end_date) return unknown;
  const when = new Date(last.ts);
  if (!Number.isFinite(when.getTime())) return unknown;
  const from = addDays(payment.end_date, 1);
  if (!validDay(from) || from < todayInVienna(when)) return unknown;
  return { endedFrom: from, endEvidence: 'proven' };
}

/** Preserve explicit skip -> Undo -> repeat skip of its own unchanged synthetic identity. */
function skipUndoTombstone(events: Entry[], current: Snapshot | undefined): boolean {
  const birth = events[0]?.after;
  const latest = events.at(-1);
  if (
    !birth ||
    birth.status !== 'skipped' ||
    birth.booking_id !== null ||
    birth.deleted_at !== null ||
    !current ||
    current.deleted_at === null ||
    latest?.action !== 'undo' ||
    !latest.undoOfId ||
    latest.before?.deleted_at !== null ||
    latest.after?.deleted_at == null
  )
    return false;
  const keys = [
    'expected_payment_id',
    'due_date',
    'expected_amount_cents',
    'contact_share_cents',
    'status',
    'booking_id',
  ] as const;
  const seen = new Map<string, Entry>();
  const consumed = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (
      [event.before, event.after].some(
        (side) => side !== null && keys.some((key) => side[key] !== birth[key]),
      )
    )
      return false;
    if (index === 0) {
      if (event.action !== 'create' || event.before !== null || event.undoOfId !== null)
        return false;
    } else if (event.undoOfId !== null) {
      const parent = seen.get(event.undoOfId);
      if (
        event.action !== 'undo' ||
        !parent ||
        consumed.has(parent.id) ||
        parent.entityType !== event.entityType ||
        parent.entityId !== event.entityId
      )
        return false;
      consumed.add(parent.id);
    } else if (
      event.action !== 'restore' ||
      event.before?.deleted_at == null ||
      event.after?.deleted_at !== null ||
      events[index - 1]?.action !== 'undo'
    )
      return false;
    seen.set(event.id, event);
  }
  return !consumed.has(latest.id);
}

/** One bounded batch for the requested identities. Raw rows/audits stay inside the repository. */
export function readPaymentLifecycles(
  db: Executor,
  paymentIds: readonly string[],
): Map<string, PaymentLifecycle> {
  const result = new Map<string, PaymentLifecycle>();
  const ids = [...new Set(paymentIds)];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const part = ids.slice(offset, offset + 100);
    const payments = db.all<Snapshot>(
      sql`SELECT * FROM expected_payment WHERE id IN (${placeholders(part)}) ORDER BY id`,
    );
    const occurrences = db.all<Snapshot>(
      sql`SELECT * FROM expected_occurrence WHERE expected_payment_id IN (${placeholders(part)}) ORDER BY id LIMIT ${LIMIT + 1}`,
    );
    const pauses = db.all<Snapshot>(
      sql`SELECT * FROM expected_payment_pause WHERE expected_payment_id IN (${placeholders(part)}) ORDER BY expected_payment_id, from_date, id LIMIT ${LIMIT + 1}`,
    );
    const versions = db.all<Snapshot>(
      sql`SELECT * FROM expected_payment_version WHERE expected_payment_id IN (${placeholders(part)}) ORDER BY id LIMIT ${LIMIT + 1}`,
    );
    let raw = db.all<Snapshot>(sql`SELECT ${auditColumns} FROM audit_log WHERE
      (entity_type='expected_payment' AND entity_id IN (${placeholders(part)})) OR
      (entity_type IN ('expected_occurrence','expected_payment_pause') AND (
        entity_id IN (SELECT id FROM expected_occurrence WHERE expected_payment_id IN (${placeholders(part)})) OR
        CASE WHEN json_valid(before_json) THEN json_extract(before_json,'$.expected_payment_id') END IN (${placeholders(part)}) OR
        CASE WHEN json_valid(after_json) THEN json_extract(after_json,'$.expected_payment_id') END IN (${placeholders(part)})
      )) ORDER BY rowid LIMIT ${LIMIT + 1}`);
    let events: Entry[] = [];
    let complete =
      occurrences.length <= LIMIT &&
      pauses.length <= LIMIT &&
      versions.length <= LIMIT &&
      raw.length <= LIMIT;
    try {
      // Historical parent identities may have moved; load their entire retained chain once,
      // so another payment in this batch cannot change the first payment's review token.
      const initial = raw.map(parse);
      const knownIds = [
        ...new Set([
          ...occurrences.map((o) => String(o.id)),
          ...initial.filter((e) => e.entityType === 'expected_occurrence').map((e) => e.entityId),
        ]),
      ];
      const additional: Snapshot[] = [];
      for (let i = 0; i < knownIds.length; i += 400) {
        additional.push(
          ...db.all<Snapshot>(sql`SELECT ${auditColumns} FROM audit_log
          WHERE entity_type='expected_occurrence' AND entity_id IN (${placeholders(knownIds.slice(i, i + 400))})
          ORDER BY rowid LIMIT ${LIMIT + 1}`),
        );
        if (additional.length > LIMIT) {
          complete = false;
          break;
        }
      }
      raw = [...new Map([...raw, ...additional].map((r) => [String(r.id), r])).values()].sort(
        (a, b) => Number(a.sequence) - Number(b.sequence),
      );
      if (raw.length > LIMIT) complete = false;
      events = raw.map(parse);
    } catch {
      complete = false;
    }
    for (const p of payments) {
      const id = String(p.id);
      const own = occurrences.filter((o) => o.expected_payment_id === id);
      const ownPauses = pauses.filter((v) => v.expected_payment_id === id);
      if (ownPauses.length > LIMIT)
        throw new ConflictError('Zu viele Pausen für eine sichere Terminansicht.');
      const ranges = ownPauses
        .filter((v) => v.deleted_at === null)
        .map((v) => {
          if (!validDay(v.from_date) || !validDay(v.through_date) || v.from_date > v.through_date)
            throw new ConflictError('Die gespeicherte Zahlungspause braucht eine Prüfung.');
          return { fromDate: v.from_date, throughDate: v.through_date };
        });
      // A truncated pause set cannot safely feed any calendar projection.
      if (pauses.length > LIMIT)
        throw new ConflictError('Die Zahlungspausen sind für diese Ansicht zu umfangreich.');
      const paymentEvents = events.filter(
        (e) => e.entityType === 'expected_payment' && e.entityId === id,
      );
      const occurrenceIds = new Set(own.map((o) => String(o.id)));
      for (const e of events)
        if (
          e.entityType === 'expected_occurrence' &&
          (e.before?.expected_payment_id === id || e.after?.expected_payment_id === id)
        )
          occurrenceIds.add(e.entityId);
      const relevant = events.filter(
        (e) => e.entityType === 'expected_occurrence' && occurrenceIds.has(e.entityId),
      );
      const ownAudit = events.filter(
        (e) =>
          (e.entityType === 'expected_payment' && e.entityId === id) ||
          (e.entityType === 'expected_occurrence' && occurrenceIds.has(e.entityId)) ||
          (e.entityType === 'expected_payment_pause' &&
            (e.before?.expected_payment_id === id || e.after?.expected_payment_id === id)),
      );
      const assigned =
        own.some((o) => o.booking_id !== null) ||
        relevant.some(
          (e) =>
            (e.before?.expected_payment_id === id && e.before.booking_id != null) ||
            (e.after?.expected_payment_id === id && e.after.booking_id != null),
        );
      let proven = complete && coherent(paymentEvents, p);
      const revivable = new Set<string>();
      const revivableSkipped = new Set<string>();
      for (const occurrenceId of occurrenceIds) {
        const row = own.find((o) => o.id === occurrenceId);
        const history = relevant.filter((e) => e.entityId === occurrenceId);
        const known = coherent(history, row);
        if (!known) proven = false;
        if (complete && known && skipUndoTombstone(history, row))
          revivableSkipped.add(occurrenceId);
        if (
          complete &&
          known &&
          row?.deleted_at !== null &&
          row?.status === 'expected' &&
          row?.booking_id === null &&
          history.every((e) =>
            [e.before, e.after].every(
              (s) =>
                s === null ||
                (s.expected_payment_id === id && s.status === 'expected' && s.booking_id === null),
            ),
          )
        )
          revivable.add(occurrenceId);
      }
      result.set(id, {
        pauses: ranges,
        ...(complete
          ? endProof(p, paymentEvents)
          : { endedFrom: null, endEvidence: 'unavailable' as const }),
        deletion: assigned ? 'everAssigned' : proven ? 'neverAssigned' : 'unavailable',
        reviewToken: complete
          ? digest({
              p,
              own,
              pauses: ownPauses,
              versions: versions.filter((v) => v.expected_payment_id === id),
              audit: ownAudit,
            })
          : null,
        revivableOccurrenceIds: revivable,
        revivableSkippedOccurrenceIds: revivableSkipped,
      });
    }
  }
  return result;
}

export function paymentDateSuppressed(facts: PaymentLifecycle | undefined, day: string): boolean {
  return (
    !!facts &&
    (facts.pauses.some((p) => p.fromDate <= day && day <= p.throughDate) ||
      (facts.endedFrom !== null && day >= facts.endedFrom))
  );
}
/** A retained assignment remains real; only the now-unassigned open obligation is suppressed. */
export function paymentOpenSuppressed(
  facts: PaymentLifecycle | undefined,
  row: {
    dueDate: string;
    status: string;
    bookingId: string | null;
  },
): boolean {
  return (
    row.status === 'expected' && row.bookingId === null && paymentDateSuppressed(facts, row.dueDate)
  );
}
export function assertPaymentDeletable(facts: PaymentLifecycle | undefined): void {
  if (facts?.deletion === 'neverAssigned') return;
  throw new ConflictError(
    facts?.deletion === 'everAssigned'
      ? 'Dieser Zahlung war bereits eine Buchung zugeordnet. Bitte „Beenden“ verwenden; der Verlauf bleibt erhalten.'
      : 'Die vollständige Zuordnungshistorie ist nicht belegt. Bitte „Beenden“ verwenden; der Verlauf bleibt erhalten.',
  );
}
export function assertPaymentReview(
  facts: PaymentLifecycle | undefined,
  reviewToken: string,
): void {
  if (!facts?.reviewToken)
    throw new ConflictError(
      'Die Zahlungshistorie ist beschädigt oder für eine sichere Änderung zu umfangreich.',
    );
  if (facts.reviewToken !== reviewToken)
    throw new ConflictError(
      'Die Zahlung wurde inzwischen verändert. Bitte neu laden und erneut prüfen.',
    );
}
export function assertPaymentPauseRanges(facts: PaymentLifecycle | undefined): void {
  const ranges = [...(facts?.pauses ?? [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  for (let i = 1; i < ranges.length; i++)
    if (ranges[i]!.fromDate <= ranges[i - 1]!.throughDate)
      throw new AuditError('Pausen derselben Zahlung dürfen sich nicht überschneiden.');
}

interface Root {
  entry: ExpectedLifecycleEntry;
  depth: number;
  chain: string[];
}
function rootOf(db: Executor, initial: ExpectedLifecycleEntry): Root {
  let entry = initial;
  let depth = 0;
  const seen = new Set<string>();
  const chain = [entry.id];
  while (entry.undoOfId !== null) {
    if (seen.has(entry.id) || depth++ >= 128)
      throw new AuditError('Die Zuordnung dieser Rückgängig-Aktion ist nicht vollständig belegt.');
    seen.add(entry.id);
    const row = db.get<Snapshot>(
      sql`SELECT ${auditColumns} FROM audit_log WHERE id=${entry.undoOfId}`,
    );
    if (!row) throw new AuditError('Die ursprüngliche Zahlungsaktion fehlt.');
    const parent = parse(row);
    if (parent.entityType !== entry.entityType || parent.entityId !== entry.entityId)
      throw new AuditError('Die ursprüngliche Zahlungsaktion ist nicht eindeutig.');
    entry = parent;
    chain.push(entry.id);
  }
  return { entry, depth, chain };
}
const parents = (e: ExpectedLifecycleEntry): string[] =>
  e.entityType === 'expected_payment'
    ? [e.entityId]
    : [...new Set([e.before?.expected_payment_id, e.after?.expected_payment_id])].filter(
        (id): id is string => typeof id === 'string',
      );
const lifecycleRoot = (e: ExpectedLifecycleEntry) =>
  e.entityType === 'expected_payment_pause' ||
  (e.entityType === 'expected_payment' &&
    e.before !== null &&
    e.after !== null &&
    (e.before.end_date !== e.after.end_date ||
      (e.action === 'delete' && e.before.deleted_at === null && e.after.deleted_at !== null)));
const openRaw = (row: Snapshot | undefined) =>
  !!row && row.deleted_at === null && row.status === 'expected' && row.booking_id === null;
export interface PaymentUndoContext {
  parents: string[];
  before: Map<string, Snapshot | undefined>;
  maintenance: Set<string>;
  today: string;
}

/** Narrow adapter for the existing Undo transaction; no audit/writer imports or corrective writes. */
export function preparePaymentLifecycleUndo(
  db: Executor,
  selected: readonly ExpectedLifecycleEntry[],
  today = todayInVienna(),
): PaymentUndoContext {
  const context: PaymentUndoContext = {
    parents: [],
    before: new Map(),
    maintenance: new Set(),
    today,
  };
  const candidates = selected.filter((e) => relationTypes.has(e.entityType));
  if (!candidates.length) return context;
  const roots = new Map(selected.map((e) => [e.id, rootOf(db, e)]));
  const selectedRoots = new Map([...roots.values()].map((r) => [r.entry.id, r]));
  const parentIds = new Set<string>();
  const groups = new Map<string, Entry[]>();
  for (const candidate of candidates) {
    const root = roots.get(candidate.id)!.entry;
    for (const id of parents(root)) parentIds.add(id);
    let group: ExpectedLifecycleEntry[] = [root];
    if (root.groupId) {
      if (!groups.has(root.groupId)) {
        const rows = db.all<Snapshot>(
          sql`SELECT ${auditColumns} FROM audit_log WHERE group_id=${root.groupId} ORDER BY rowid LIMIT ${LIMIT + 1}`,
        );
        if (rows.length > LIMIT)
          throw new AuditError('Die Zahlungsaktion ist zu umfangreich für eine sichere Rücknahme.');
        groups.set(root.groupId, rows.map(parse));
      }
      group = groups.get(root.groupId)!;
    }
    const relevantParents = new Set(
      group.filter((e) => e.undoOfId === null && lifecycleRoot(e)).flatMap(parents),
    );
    const coupled = group.filter(
      (e) =>
        e.undoOfId === null &&
        relationTypes.has(e.entityType) &&
        parents(e).some((id) => relevantParents.has(id)),
    );
    if (parents(root).some((id) => relevantParents.has(id))) {
      const depth = roots.get(candidate.id)!.depth;
      if (coupled.some((e) => !selectedRoots.has(e.id) || selectedRoots.get(e.id)!.depth !== depth))
        throw new AuditError(
          'Pausieren, Beenden und zugehörige Termine bitte gemeinsam rückgängig machen.',
        );
      const chains = coupled.flatMap((e) => selectedRoots.get(e.id)!.chain);
      const childCounts = db.all<{
        parent: string;
        n: number;
      }>(sql`SELECT undo_of_id AS parent, count(*) AS n FROM audit_log
        WHERE undo_of_id IN (${placeholders(chains)}) GROUP BY undo_of_id`);
      const tips = new Set(coupled.map((e) => selectedRoots.get(e.id)!.chain[0]!));
      if (childCounts.some((row) => row.n > 1 || tips.has(row.parent)))
        throw new AuditError(
          'Diese Zahlungsaktion hat bereits eine andere Rückgängig-Folge. Bitte die aktuelle vollständige Aktion verwenden.',
        );
    }
    if (
      root.entityType === 'expected_payment' &&
      root.action === 'delete' &&
      root.before?.deleted_at === null &&
      root.after?.deleted_at != null &&
      candidate.before?.deleted_at != null
    ) {
      try {
        assertPaymentDeletable(readPaymentLifecycles(db, [root.entityId]).get(root.entityId));
      } catch {
        throw new AuditError(
          'Diese Zahlung hatte inzwischen eine Zuordnung. Löschen kann nicht wiederhergestellt werden; bitte „Beenden“ verwenden.',
        );
      }
    }
    if (candidate.entityType === 'expected_occurrence') {
      context.before.set(
        candidate.entityId,
        db.get<Snapshot>(sql`SELECT * FROM expected_occurrence WHERE id=${candidate.entityId}`),
      );
      const bookingIds = [root.before?.booking_id, root.after?.booking_id].filter(
        (id): id is string => typeof id === 'string',
      );
      const related = group.filter(
        (e) => e.undoOfId === null && e.entityType === 'booking' && bookingIds.includes(e.entityId),
      );
      if (
        !group.some(lifecycleRoot) &&
        related.length > 0 &&
        related.every((e) => selectedRoots.has(e.id))
      )
        context.maintenance.add(candidate.entityId);
    }
  }
  context.parents = [...parentIds];
  return context;
}

/** Called after physical replay and the existing expected-link coherence check. Failure rolls back. */
export function assertPaymentLifecycleUndo(db: Executor, context: PaymentUndoContext): void {
  if (!context.parents.length) return;
  const facts = readPaymentLifecycles(db, context.parents);
  for (const value of facts.values()) assertPaymentPauseRanges(value);
  for (const [id, before] of context.before) {
    if (context.maintenance.has(id) || openRaw(before)) continue;
    const after = db.get<Snapshot>(sql`SELECT * FROM expected_occurrence WHERE id=${id}`);
    if (
      !openRaw(after) ||
      !after ||
      typeof after.due_date !== 'string' ||
      after.due_date < context.today
    )
      continue;
    if (paymentDateSuppressed(facts.get(String(after.expected_payment_id)), after.due_date))
      throw new AuditError(
        'Dieser Termin ist pausiert oder beendet. Bitte zuerst die zugehörige Zahlungsaktion rückgängig machen.',
      );
  }
}
