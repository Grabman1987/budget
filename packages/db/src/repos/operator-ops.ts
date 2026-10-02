import { cents as asCents, formatEuro } from '@budget/domain';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { category, envelopeMonth } from '../schema';
import { AuditError } from './errors';
import { undo, type AuditContext, type AuditEntry, type Snapshot } from './audit';
import { assignMany, moveMoney } from './budget';
import { runInTransaction, type Executor } from './types';

/**
 * Operator tasks around the audit log and the plan (`migrate-cli.js list-groups|undo-group|
 * move-money`). Nothing here writes on its own: moves and undo go through the same domain
 * functions as the app (`moveMoney`, `assignMany`, `undo`), so every write is audited, guarded and
 * undoable like a write from the app. The CLI only adds name lookup, batching and a report.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const fold = (name: string) => name.trim().toLocaleLowerCase('de-AT');
const euro = (value: number) => (value > 0 ? '+' : '') + formatEuro(asCents(value));

/** Bad operator input (unknown name, malformed file): nothing was written. */
export class OperatorInputError extends Error {
  override readonly name = 'OperatorInputError';
}

/** Thrown inside a transaction to roll a dry run back; never leaves this module. */
class DryRunRollback extends Error {}

// ---------------------------------------------------------------------------------------------
// list-groups
// ---------------------------------------------------------------------------------------------

export interface GroupMove {
  category: string;
  month: string;
  deltaCents: number;
}

export interface AuditGroupView {
  groupId: string;
  /** Timestamp of the group's first entry. */
  ts: string;
  actor: string;
  entries: number;
  /** Assigned-amount changes (`envelope_month`), net per category and month. */
  moves: GroupMove[];
  /** One readable line per change: the moves first, then a count per other entity and action. */
  summary: string[];
}

export interface ListGroupsOptions {
  /** ISO timestamp, inclusive. */
  since: string;
  /** ISO timestamp, inclusive. */
  until?: string;
  /** Only groups with at least one entry of this entity type (SQL table name). */
  entity?: string;
}

interface Row {
  rowid: number;
  id: string;
  ts: string;
  actor: string;
  action: AuditEntry['action'];
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  group_id: string;
  undo_of_id: string | null;
}

const COLUMNS = sql`rowid, id, ts, actor, action, entity_type, entity_id, before_json, after_json, group_id, undo_of_id`;
const parse = (json: string | null) => (json ? (JSON.parse(json) as Snapshot) : null);

/** Assigned amount a snapshot stands for: a missing or soft-deleted row assigns nothing. */
const assignedOf = (snapshot: Snapshot | null): number =>
  snapshot && !snapshot['deleted_at'] ? Number(snapshot['assigned_cents'] ?? 0) : 0;

/** An ISO timestamp as the log stores it (`2026-10-01T00:00:00.000Z`). */
export function normalizeTimestamp(value: string, label = 'timestamp'): string {
  const date = new Date(value);
  if (!value.trim() || Number.isNaN(date.getTime()))
    throw new OperatorInputError(`${label} "${value}" is not an ISO timestamp`);
  return date.toISOString();
}

/**
 * Audit entries that were reverted and not brought back: an entry is reverted when an `undo` entry
 * points at it that is itself not reverted (so undoing an undo, a redo, makes it live again).
 */
function revertedEntryIds(db: Executor): Set<string> {
  const covers = new Map<string, string[]>();
  for (const r of db
    .all<{ id: string; undo_of_id: string }>(
      sql`select id, undo_of_id from audit_log where undo_of_id is not null`,
    )
    .values())
    covers.set(r.undo_of_id, [...(covers.get(r.undo_of_id) ?? []), r.id]);
  const memo = new Map<string, boolean>();
  const reverted = (id: string): boolean => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    memo.set(id, false); // guards against a cycle in a damaged log
    const result = (covers.get(id) ?? []).some((u) => !reverted(u));
    memo.set(id, result);
    return result;
  };
  return new Set([...covers.keys()].filter(reverted));
}

/**
 * Audit groups that are not part of an import run (`group_id` not like `import:%`) and not undone,
 * oldest first. A group counts by the timestamp of its first entry. Groups that only consist of
 * `undo` entries (the record of an undo) are not actions of their own and are left out. A group is
 * undone when all its entries are reverted, so a group that was undone and redone is listed again.
 */
export function listAuditGroups(db: Executor, options: ListGroupsOptions): AuditGroupView[] {
  const since = normalizeTimestamp(options.since, '--since');
  const until =
    options.until === undefined ? undefined : normalizeTimestamp(options.until, '--until');
  const ids = db
    .all<{ group_id: string }>(
      sql`select group_id from audit_log
          where group_id is not null and group_id not like 'import:%'
          group by group_id
          having min(ts) >= ${since} ${until === undefined ? sql`` : sql`and min(ts) <= ${until}`}
          order by min(rowid)`,
    )
    .map((r) => r.group_id);
  if (ids.length === 0) return [];
  const names = new Map(
    db
      .select({ id: category.id, name: category.name })
      .from(category)
      .all()
      .map((c) => [c.id, c.name]),
  );
  const reverted = revertedEntryIds(db);
  const out: AuditGroupView[] = [];
  const CHUNK = 200;
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    rows.push(
      ...db.all<Row>(
        sql`select ${COLUMNS} from audit_log where group_id in (${sql.join(
          chunk.map((id) => sql`${id}`),
          sql`, `,
        )}) order by rowid`,
      ),
    );
  }
  const byGroup = new Map<string, Row[]>();
  for (const r of rows) byGroup.set(r.group_id, [...(byGroup.get(r.group_id) ?? []), r]);
  for (const groupId of ids) {
    const entries = byGroup.get(groupId) ?? [];
    if (entries.length === 0) continue;
    if (entries.every((e) => e.action === 'undo')) continue;
    if (entries.every((e) => reverted.has(e.id))) continue;
    if (options.entity && !entries.some((e) => e.entity_type === options.entity)) continue;
    const net = new Map<string, GroupMove>();
    const others = new Map<string, number>();
    for (const e of entries) {
      if (e.entity_type === 'envelope_month') {
        const basis = parse(e.after_json) ?? parse(e.before_json);
        if (!basis) continue;
        const deltaCents = assignedOf(parse(e.after_json)) - assignedOf(parse(e.before_json));
        const month = String(basis['month']);
        const categoryId = String(basis['category_id']);
        const key = `${categoryId}|${month}`;
        const move = net.get(key) ?? {
          category: names.get(categoryId) ?? `(category ${categoryId})`,
          month,
          deltaCents: 0,
        };
        move.deltaCents += deltaCents;
        net.set(key, move);
      } else {
        const key = `${e.entity_type} ${e.action}`;
        others.set(key, (others.get(key) ?? 0) + 1);
      }
    }
    const moves = [...net.values()].filter((m) => m.deltaCents !== 0);
    const summary = [
      ...moves.map((m) => `${m.category} ${m.month} ${euro(m.deltaCents)}`),
      ...[...others].map(([key, n]) => `${n}× ${key}`),
    ];
    const first = entries[0]!;
    out.push({
      groupId,
      ts: first.ts,
      actor: first.actor,
      entries: entries.length,
      moves,
      summary,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// undo-group
// ---------------------------------------------------------------------------------------------

export interface UndoneGroup {
  groupId: string;
  /** Entries reverted. */
  entries: number;
  /** Group of the written `undo` entries (empty in a dry run). */
  undoGroupId: string;
}

/**
 * Undo audit groups through `undo` (the function behind `POST /api/undo`: same checks, same
 * refusals), newest group first so groups that touch the same rows come off in the right order,
 * in one transaction: if one is refused nothing is undone. Import runs are refused here (use
 * `revert`, which also resets the run). `dryRun` does all of it and rolls it back, so it refuses
 * exactly what the real run would.
 */
export function undoAuditGroups(
  db: Executor,
  groupIds: ReadonlyArray<string>,
  ctx: AuditContext,
  options: { dryRun?: boolean } = {},
): UndoneGroup[] {
  const unique = [...new Set(groupIds.map((g) => g.trim()).filter(Boolean))];
  if (unique.length === 0) throw new OperatorInputError('No audit group given');
  const imports = unique.filter((g) => g.startsWith('import:'));
  if (imports.length > 0)
    throw new OperatorInputError(
      `${imports.join(', ')}: an import run is reverted with "revert --run <id>", not with undo-group`,
    );
  const last = new Map(
    db
      .all<{ group_id: string; last: number }>(
        sql`select group_id, max(rowid) as last from audit_log
            where group_id in (${sql.join(
              unique.map((g) => sql`${g}`),
              sql`, `,
            )}) group by group_id`,
      )
      .map((r) => [r.group_id, r.last]),
  );
  const missing = unique.filter((g) => !last.has(g));
  if (missing.length > 0)
    throw new AuditError(`Cannot undo: audit group ${missing.join(', ')} not found`);
  const order = [...unique].sort((a, b) => last.get(b)! - last.get(a)!);
  try {
    return runInTransaction(db, (tx) => {
      const done = order.map((groupId) => {
        const result = undo(tx, { groupId }, ctx);
        return { groupId, entries: result.entries.length, undoGroupId: result.groupId };
      });
      if (options.dryRun) {
        // Hand the answer out through the rollback.
        throw Object.assign(new DryRunRollback(), { done });
      }
      return done;
    });
  } catch (error) {
    if (error instanceof DryRunRollback)
      return (error as DryRunRollback & { done: UndoneGroup[] }).done.map((d) => ({
        ...d,
        undoGroupId: '',
      }));
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// move-money
// ---------------------------------------------------------------------------------------------

export interface MoveRequest {
  month: string;
  /** Category names, matched exactly (trimmed, case-insensitive) among live categories. */
  from: string;
  to: string;
  cents: number;
  /** The audit group of the original move, when it came from a `list-groups` file. */
  sourceGroupId?: string;
}

/** One assigned-amount change that is applied on its own (`--allow-unbalanced`). */
export interface AssignRequest {
  month: string;
  category: string;
  deltaCents: number;
  sourceGroupId?: string;
}

export interface SkippedGroup {
  groupId: string | undefined;
  month: string;
  reason: 'unbalanced' | 'not_a_move';
  netCents: number;
  lines: GroupMove[];
}

export interface MovePlan {
  moves: MoveRequest[];
  assignments: AssignRequest[];
  skipped: SkippedGroup[];
}

/** The `list-groups --out` format. */
export interface GroupsFileEntry {
  groupId?: string;
  ts?: string;
  moves: GroupMove[];
}

/** Check a parsed `list-groups --out` file; throws `OperatorInputError` naming the problem. */
export function parseGroupsFile(json: unknown): GroupsFileEntry[] {
  if (!Array.isArray(json))
    throw new OperatorInputError('The file must hold a JSON array of groups');
  return json.map((raw: unknown, i): GroupsFileEntry => {
    const where = `entry ${i + 1}`;
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as GroupsFileEntry).moves))
      throw new OperatorInputError(`${where}: "moves" must be an array`);
    const entry = raw as Record<string, unknown>;
    const moves = (entry['moves'] as unknown[]).map((m, j): GroupMove => {
      const line = m as Record<string, unknown> | null;
      const at = `${where}, move ${j + 1}`;
      if (!line || typeof line['category'] !== 'string' || !line['category'].trim())
        throw new OperatorInputError(`${at}: "category" must be a name`);
      if (typeof line['month'] !== 'string' || !MONTH.test(line['month']))
        throw new OperatorInputError(`${at}: "month" must be YYYY-MM`);
      if (!Number.isSafeInteger(line['deltaCents']))
        throw new OperatorInputError(`${at}: "deltaCents" must be an integer number of cents`);
      return {
        category: line['category'],
        month: line['month'],
        deltaCents: line['deltaCents'] as number,
      };
    });
    return {
      ...(typeof entry['groupId'] === 'string' && { groupId: entry['groupId'] }),
      ...(typeof entry['ts'] === 'string' && { ts: entry['ts'] }),
      moves,
    };
  });
}

/**
 * Turn groups into moves. Per group and month, two lines that net to zero (−x on A, +x on B) are
 * one move from A to B. Anything else (a single line, more lines, a non-zero net) is reported in
 * `skipped`; with `allowUnbalanced` its lines become single assignments instead.
 */
export function planGroupMoves(
  groups: ReadonlyArray<GroupsFileEntry>,
  options: { allowUnbalanced?: boolean } = {},
): MovePlan {
  const plan: MovePlan = { moves: [], assignments: [], skipped: [] };
  for (const group of groups) {
    const months = new Map<string, Map<string, GroupMove>>();
    for (const line of group.moves) {
      const lines = months.get(line.month) ?? new Map<string, GroupMove>();
      const key = fold(line.category);
      const merged = lines.get(key) ?? { ...line, category: line.category.trim(), deltaCents: 0 };
      merged.deltaCents += line.deltaCents;
      lines.set(key, merged);
      months.set(line.month, lines);
    }
    for (const [month, lines] of months) {
      const live = [...lines.values()].filter((l) => l.deltaCents !== 0);
      if (live.length === 0) continue;
      const net = live.reduce((sum, l) => sum + l.deltaCents, 0);
      const source = group.groupId === undefined ? {} : { sourceGroupId: group.groupId };
      const from = live.find((l) => l.deltaCents < 0);
      const to = live.find((l) => l.deltaCents > 0);
      if (live.length === 2 && net === 0 && from && to) {
        plan.moves.push({
          month,
          from: from.category,
          to: to.category,
          cents: to.deltaCents,
          ...source,
        });
      } else if (options.allowUnbalanced) {
        for (const l of live)
          plan.assignments.push({
            month,
            category: l.category,
            deltaCents: l.deltaCents,
            ...source,
          });
      } else {
        plan.skipped.push({
          groupId: group.groupId,
          month,
          reason: net === 0 ? 'not_a_move' : 'unbalanced',
          netCents: net,
          lines: live,
        });
      }
    }
  }
  return plan;
}

export interface NameProblems {
  unknown: string[];
  ambiguous: string[];
}

/** Live (not deleted) categories by folded name. Hidden categories count: they hold money. */
function categoriesByName(db: Executor): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const c of db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(isNull(category.deletedAt))
    .orderBy(asc(category.name), asc(category.id))
    .all())
    byName.set(fold(c.name), [...(byName.get(fold(c.name)) ?? []), c.id]);
  return byName;
}

/** Category ids for names; unknown and ambiguous names are collected, never guessed. */
export function resolveCategoryNames(
  db: Executor,
  names: ReadonlyArray<string>,
): { ids: Map<string, string>; problems: NameProblems } {
  const byName = categoriesByName(db);
  const ids = new Map<string, string>();
  const problems: NameProblems = { unknown: [], ambiguous: [] };
  for (const raw of names) {
    const name = raw.trim();
    const key = fold(name);
    if (ids.has(key)) continue;
    const found = byName.get(key) ?? [];
    if (found.length === 1) ids.set(key, found[0]!);
    else {
      const list = found.length === 0 ? problems.unknown : problems.ambiguous;
      if (!list.includes(name)) list.push(name);
    }
  }
  return { ids, problems };
}

export interface MoveOutcome {
  kind: 'move' | 'assign';
  month: string;
  /** Names as given. */
  from?: string;
  to?: string;
  category?: string;
  cents: number;
  /** The new audit group (empty in a dry run). */
  groupId: string;
  sourceGroupId?: string;
}

/**
 * Apply moves (and, for `--allow-unbalanced`, single assignments) with the functions of the plan
 * page: `moveMoney` ("Geld verschieben") and `assignMany`, one audit group each, all in one
 * transaction. Unknown or ambiguous names, a bad month or amount and a source equal to the target
 * are refused before the first write (`OperatorInputError`); a refusal of the domain rules rolls
 * everything back. `dryRun` runs it all and rolls back.
 */
export function applyMoves(
  db: Executor,
  plan: Pick<MovePlan, 'moves' | 'assignments'>,
  ctx: Pick<AuditContext, 'actor'>,
  options: { dryRun?: boolean } = {},
): MoveOutcome[] {
  const { ids, problems } = resolveCategoryNames(db, [
    ...plan.moves.flatMap((m) => [m.from, m.to]),
    ...plan.assignments.map((a) => a.category),
  ]);
  if (problems.unknown.length > 0 || problems.ambiguous.length > 0) {
    const parts = [
      problems.unknown.length > 0 && `unknown: ${problems.unknown.map((n) => `"${n}"`).join(', ')}`,
      problems.ambiguous.length > 0 &&
        `ambiguous: ${problems.ambiguous.map((n) => `"${n}"`).join(', ')}`,
    ].filter(Boolean);
    throw new OperatorInputError(
      `Category names not usable (${parts.join('; ')}); nothing written`,
    );
  }
  for (const m of plan.moves) {
    if (!MONTH.test(m.month)) throw new OperatorInputError(`Month "${m.month}" must be YYYY-MM`);
    if (!Number.isSafeInteger(m.cents) || m.cents <= 0)
      throw new OperatorInputError(`Amount ${m.cents} must be a positive number of cents`);
    if (ids.get(fold(m.from)) === ids.get(fold(m.to)))
      throw new OperatorInputError(`"${m.from}" and "${m.to}" are the same category`);
  }
  for (const a of plan.assignments)
    if (!MONTH.test(a.month)) throw new OperatorInputError(`Month "${a.month}" must be YYYY-MM`);
  const id = (name: string) => ids.get(fold(name))!;
  try {
    return runInTransaction(db, (tx) => {
      const done: MoveOutcome[] = [];
      for (const m of plan.moves) {
        const { groupId } = moveMoney(tx, m.month, id(m.from), id(m.to), m.cents, {
          actor: ctx.actor,
        });
        done.push({
          kind: 'move',
          month: m.month,
          from: m.from,
          to: m.to,
          cents: m.cents,
          groupId,
          ...(m.sourceGroupId !== undefined && { sourceGroupId: m.sourceGroupId }),
        });
      }
      for (const a of plan.assignments) {
        const categoryId = id(a.category);
        const current =
          tx
            .select({ cents: envelopeMonth.assignedCents })
            .from(envelopeMonth)
            .where(
              and(
                eq(envelopeMonth.categoryId, categoryId),
                eq(envelopeMonth.month, a.month),
                isNull(envelopeMonth.deletedAt),
              ),
            )
            .get()?.cents ?? 0;
        const { groupId } = assignMany(
          tx,
          a.month,
          [{ categoryId, assignedCents: current + a.deltaCents }],
          { actor: ctx.actor },
        );
        done.push({
          kind: 'assign',
          month: a.month,
          category: a.category,
          cents: a.deltaCents,
          groupId,
          ...(a.sourceGroupId !== undefined && { sourceGroupId: a.sourceGroupId }),
        });
      }
      if (options.dryRun) throw Object.assign(new DryRunRollback(), { done });
      return done;
    });
  } catch (error) {
    if (error instanceof DryRunRollback)
      return (error as DryRunRollback & { done: MoveOutcome[] }).done.map((d) => ({
        ...d,
        groupId: '',
      }));
    throw error;
  }
}

/** The single `move-money --month --from --to --cents` form. */
export function moveMoneyByNames(
  db: Executor,
  request: MoveRequest,
  ctx: Pick<AuditContext, 'actor'>,
  options: { dryRun?: boolean } = {},
): MoveOutcome {
  return applyMoves(db, { moves: [request], assignments: [] }, ctx, options)[0]!;
}
