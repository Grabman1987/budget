import {
  addMonths,
  BOOK_RULE_CODES,
  bookUnavailableReason,
  applyParamsPatch,
  CHECKLIST_DEFS,
  defaultParams,
  evaluateRule,
  isRuleCode,
  lastDayOfMonth,
  monthOf,
  resolveParams,
  RULE_DEFS,
  summarizeCheck,
  type CheckChecklistItem,
  type CheckRule,
  type FinanceCheckSummary,
  type RuleEvaluation,
  type RuleStatus,
} from '@budget/domain';
import { and, asc, between, eq, inArray, isNull } from 'drizzle-orm';
import { rule, ruleResult } from '../schema';
import { updateEntity } from './entities';
import { EntityNotFoundError } from './errors';
import { netWorthAsOf } from './portfolio';
import { loadFacts, ruleInputs, type RuleFacts } from './rule-inputs';
import { runInTransaction, type Executor } from './types';
import type { AuditContext } from './audit';

/**
 * The rule book as data (concept §3.5): `rule` rows with parameters, stage checklist items and
 * stored results. The engine lives in `@budget/domain` (`evaluateRule`); `ruleInputs` assembles
 * what it reads. Results are derived: they are rewritten, not audited. Edits of parameters,
 * `enabled` and the checklist confirmation go through the audited entity repository and are
 * therefore `undo`-able.
 */

type RuleRow = typeof rule.$inferSelect;

const parseJson = (text: string | null): Record<string, unknown> => {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

// ---------------------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------------------

export interface EnsureRulesResult {
  created: number;
  updated: number;
}

/**
 * Writes registered rules and the stage checklist when missing, at start. Idempotent. An existing rule
 * keeps all stored fields and results unchanged; checklist links are adapted on read. Written directly (like the sample seed), not audited.
 */
export function ensureDefaultRules(db: Executor): EnsureRulesResult {
  const result: EnsureRulesResult = { created: 0, updated: 0 };
  runInTransaction(db, (tx) => {
    const existing = new Map(
      tx
        .select()
        .from(rule)
        .all()
        .map((r) => [r.code, r]),
    );
    RULE_DEFS.forEach((def, index) => {
      const row = existing.get(def.code);
      if (!row) {
        tx.insert(rule)
          .values({
            id: `rule-${def.code.toLowerCase()}`,
            code: def.code,
            name: def.name,
            stage: def.stage,
            goal: def.goal,
            action: def.action,
            paramsJson: JSON.stringify(defaultParams(def.code)),
            kind: 'rule',
            enabled: !BOOK_RULE_CODES.includes(def.code),
            sortOrder: index + 1,
          })
          .run();
        result.created++;
        return;
      }
    });
    CHECKLIST_DEFS.forEach((def, index) => {
      if (existing.has(def.code)) return;
      tx.insert(rule)
        .values({
          id: `check-${def.code.toLowerCase()}`,
          code: def.code,
          name: def.text,
          stage: def.stage,
          goal: def.source,
          paramsJson: JSON.stringify({
            ruleCode: def.ruleCode,
            additionalRuleCodes: def.additionalRuleCodes ?? [],
          }),
          kind: 'checklist',
          sortOrder: 100 + index,
        })
        .run();
      result.created++;
    });
  });
  return result;
}

function checklistLinks(r: RuleRow) {
  const params = parseJson(r.paramsJson);
  const def = CHECKLIST_DEFS.find((d) => d.code === r.code);
  if ((r.code === 'S2-1' || r.code === 'S3-2') && def)
    return { ruleCode: def.ruleCode, additionalRuleCodes: def.additionalRuleCodes ?? [] };
  return {
    ruleCode: typeof params['ruleCode'] === 'string' ? params['ruleCode'] : null,
    additionalRuleCodes: [],
  };
}

// Updated derived checklist wording without overwriting the stored row or its confirmation.
function checklistName(r: RuleRow): string {
  return ['S2-1', 'S2-3', 'S3-2'].includes(r.code)
    ? (CHECKLIST_DEFS.find((d) => d.code === r.code)?.text ?? r.name)
    : r.name;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

export interface StoredResult {
  asOf: string;
  status: RuleStatus;
  valueText: string | null;
  actionNeeded: boolean;
  actionText: string | null;
  detail: Record<string, unknown>;
}

export interface RuleListing {
  id: string;
  code: string;
  name: string;
  stage: number | null;
  goal: string | null;
  action: string | null;
  enabled: boolean;
  /** Stored parameters over the defaults. */
  params: Record<string, unknown>;
  defaults: Record<string, unknown>;
  /** The newest stored result; `null` when the rule has never been evaluable. */
  latest: StoredResult | null;
  unavailableReason?: string | null;
}

export interface ChecklistListing {
  code: string;
  name: string;
  stage: number | null;
  source: string | null;
  enabled: boolean;
  /** The rule that decides the item, or `null` when the owner confirms it. */
  ruleCode: string | null;
  confirmedAt: string | null;
  additionalRuleCodes?: ReadonlyArray<string>;
}

const toStored = (r: typeof ruleResult.$inferSelect): StoredResult => {
  const { actionText, ...detail } = parseJson(r.detailJson);
  return {
    asOf: r.asOf,
    status: r.status,
    valueText: r.valueText,
    actionNeeded: r.actionNeeded,
    actionText: typeof actionText === 'string' ? actionText : null,
    detail,
  };
};

function liveRows(db: Executor, kind: RuleRow['kind']): RuleRow[] {
  return db
    .select()
    .from(rule)
    .where(and(isNull(rule.deletedAt), eq(rule.kind, kind)))
    .orderBy(asc(rule.sortOrder), asc(rule.code))
    .all();
}

function latestResults(db: Executor, ruleIds: string[], upTo?: string): Map<string, StoredResult> {
  const out = new Map<string, StoredResult>();
  if (ruleIds.length === 0) return out;
  const rows = db
    .select()
    .from(ruleResult)
    .where(inArray(ruleResult.ruleId, ruleIds))
    .orderBy(asc(ruleResult.asOf))
    .all();
  for (const r of rows) if (upTo === undefined || r.asOf <= upTo) out.set(r.ruleId, toStored(r));
  return out;
}

const listing = (r: RuleRow, latest: StoredResult | undefined): RuleListing => {
  const code = isRuleCode(r.code) ? r.code : null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    stage: r.stage,
    goal: r.goal,
    action: r.action,
    enabled: r.enabled,
    params: code ? resolveParams(code, parseJson(r.paramsJson)) : parseJson(r.paramsJson),
    defaults: code ? defaultParams(code) : {},
    latest: latest ?? null,
  };
};

/** Registered rules with their parameters and newest result, and the stage checklist. */
export function listRules(
  db: Executor,
  upTo?: string,
): { rules: RuleListing[]; checklist: ChecklistListing[] } {
  const rules = liveRows(db, 'rule');
  const latest = latestResults(
    db,
    rules.map((r) => r.id),
    upTo,
  );
  const inputs =
    upTo && rules.some((r) => isRuleCode(r.code) && BOOK_RULE_CODES.includes(r.code))
      ? ruleInputs(db, upTo)
      : null;
  return {
    rules: rules.map((r) => {
      if (!inputs || !isRuleCode(r.code) || !BOOK_RULE_CODES.includes(r.code))
        return listing(r, latest.get(r.id));
      const e = evaluateRule(r.code, parseJson(r.paramsJson), inputs);
      return {
        ...listing(r, undefined),
        latest: e ? { asOf: inputs.asOf, ...e } : null,
        unavailableReason: bookUnavailableReason(r.code, parseJson(r.paramsJson), inputs),
      };
    }),
    checklist: liveRows(db, 'checklist').map((r) => {
      return {
        code: r.code,
        name: checklistName(r),
        stage: r.stage,
        source: r.goal,
        enabled: r.enabled,
        ...checklistLinks(r),
        confirmedAt: r.confirmedAt,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Editing (audited, undoable)
// ---------------------------------------------------------------------------------------------

export interface RulePatch {
  params?: Record<string, unknown>;
  enabled?: boolean;
}

function byCode(db: Executor, code: string): RuleRow {
  const row = db
    .select()
    .from(rule)
    .where(and(eq(rule.code, code), isNull(rule.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('rule', code);
  return row;
}

/**
 * Changes the parameters (validated per rule; unknown keys or out-of-range values throw a
 * `ZodError`) and/or `enabled` of a rule or checklist item. Audited, so `undo` reverts it.
 */
export function updateRule(
  db: Executor,
  code: string,
  patch: RulePatch,
  ctx: AuditContext,
): RuleListing {
  const row = byCode(db, code);
  const changes: { paramsJson?: string; enabled?: boolean } = {};
  if (patch.params !== undefined) {
    if (!isRuleCode(code)) throw new EntityNotFoundError('rule parameters', code);
    changes.paramsJson = JSON.stringify(
      applyParamsPatch(code, parseJson(row.paramsJson), patch.params),
    );
  }
  if (patch.enabled !== undefined) changes.enabled = patch.enabled;
  const updated =
    Object.keys(changes).length > 0 ? updateEntity(db, rule, row.id, changes, ctx) : row;
  return listing(updated, latestResults(db, [row.id]).get(row.id));
}

/** Marks a checklist item the owner confirms as erledigt (`confirmed`) or open again. Audited. */
export function confirmChecklistItem(
  db: Executor,
  code: string,
  confirmed: boolean,
  ctx: AuditContext,
  now: () => string = () => new Date().toISOString(),
): ChecklistListing {
  const row = byCode(db, code);
  if (row.kind !== 'checklist') throw new EntityNotFoundError('checklist item', code);
  const ruleCode = checklistLinks(row).ruleCode;
  if (typeof ruleCode === 'string') throw new ChecklistRuleBackedError(code, ruleCode);
  if ((row.confirmedAt !== null) !== confirmed)
    updateEntity(db, rule, row.id, { confirmedAt: confirmed ? now() : null }, ctx);
  const item = listRules(db).checklist.find((c) => c.code === code);
  if (!item) throw new EntityNotFoundError('checklist item', code);
  return item;
}

/** An item that a rule decides cannot be confirmed by hand. */
export class ChecklistRuleBackedError extends Error {
  constructor(
    readonly code: string,
    readonly ruleCode: string,
  ) {
    super(`Checklist item ${code} follows rule ${ruleCode} and cannot be confirmed by hand`);
  }
}

// ---------------------------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------------------------

/** The day itself and the last 12 month ends up to it (a month end counts as its own month). */
export function evaluationDays(asOf: string): string[] {
  const month = monthOf(asOf);
  const newest = asOf === lastDayOfMonth(month) ? month : addMonths(month, -1);
  const days = Array.from({ length: 12 }, (_, i) => lastDayOfMonth(addMonths(newest, -i)));
  return [...new Set([asOf, ...days])].sort();
}

function evaluateAll(
  db: Executor,
  rules: RuleRow[],
  asOf: string,
  facts: RuleFacts,
): Map<string, RuleEvaluation | null> {
  const inputs = ruleInputs(db, asOf, facts, false);
  const out = new Map<string, RuleEvaluation | null>();
  for (const r of rules) {
    if (!r.enabled || !isRuleCode(r.code)) continue;
    out.set(r.code, evaluateRule(r.code, parseJson(r.paramsJson), inputs));
  }
  return out;
}

export interface EvaluateResult {
  asOf: string;
  days: string[];
  stored: number;
  removed: number;
}

/**
 * Evaluates the enabled rules for `asOf` and the last 12 month ends and stores one `rule_result`
 * per (rule, day). Idempotent: a second run rewrites the same rows. A rule without data on a day
 * stores nothing (and a stale row of that day is removed).
 */
export function evaluateRules(db: Executor, asOf: string): EvaluateResult {
  const days = evaluationDays(asOf);
  return runInTransaction(db, (tx) => {
    const rules = liveRows(tx, 'rule');
    const facts = loadFacts(tx, days[days.length - 1] as string);
    let stored = 0;
    let removed = 0;
    for (const day of days) {
      const evaluated = evaluateAll(tx, rules, day, facts);
      for (const r of rules) {
        if (!evaluated.has(r.code)) continue;
        const e = evaluated.get(r.code) ?? null;
        if (!e) {
          const gone = tx
            .delete(ruleResult)
            .where(and(eq(ruleResult.ruleId, r.id), eq(ruleResult.asOf, day)))
            .run();
          removed += gone.changes;
          continue;
        }
        const values = {
          status: e.status,
          valueText: e.valueText,
          detailJson: JSON.stringify({ actionText: e.actionText, ...e.detail }),
          actionNeeded: e.actionNeeded,
        };
        tx.insert(ruleResult)
          .values({ id: `rr-${r.code.toLowerCase()}-${day}`, ruleId: r.id, asOf: day, ...values })
          .onConflictDoUpdate({ target: [ruleResult.ruleId, ruleResult.asOf], set: values })
          .run();
        stored++;
      }
    }
    return { asOf, days, stored, removed };
  });
}

export interface ResultMatrix {
  /** Evaluated days in the range, ascending. */
  days: string[];
  rules: {
    code: string;
    name: string;
    stage: number | null;
    cells: { asOf: string; status: RuleStatus; valueText: string | null; grossBp?: number }[];
  }[];
}

/** Stored results of the enabled rules between two days (the Finanz-Check-Verlauf matrix). */
export function ruleResults(db: Executor, from: string, to: string): ResultMatrix {
  const rules = liveRows(db, 'rule').filter((r) => r.enabled);
  const rows = db
    .select()
    .from(ruleResult)
    .where(
      and(
        between(ruleResult.asOf, from, to),
        inArray(
          ruleResult.ruleId,
          rules.map((r) => r.id),
        ),
      ),
    )
    .orderBy(asc(ruleResult.asOf))
    .all();
  return {
    days: [...new Set(rows.map((r) => r.asOf))],
    rules: rules.map((r) => ({
      code: r.code,
      name: r.name,
      stage: r.stage,
      cells: rows
        .filter((x) => x.ruleId === r.id)
        .map((x) => {
          const grossBp = r.code === 'R17' ? parseJson(x.detailJson)['quoteBp'] : undefined;
          return {
            asOf: x.asOf,
            status: x.status,
            valueText: x.valueText,
            ...(typeof grossBp === 'number' ? { grossBp } : {}),
          };
        }),
    })),
  };
}

export interface FinanceCheck extends FinanceCheckSummary {
  asOf: string;
  netWorthCents: number;
}

/**
 * The Finanz-Check of a day (computed now, not read from stored results): counts, the six key
 * rules by severity, the stage from net worth and the stage checklist. Checklist items of a rule
 * follow that rule; the others count once the owner confirmed them.
 */
export function financeCheck(
  db: Executor,
  asOf: string,
  facts: RuleFacts = loadFacts(db, asOf),
): FinanceCheck {
  const rows = liveRows(db, 'rule');
  const evaluated = evaluateAll(db, rows, asOf, facts);
  const rules: CheckRule[] = rows.map((r) => ({
    code: r.code,
    name: r.name,
    stage: r.stage,
    enabled: r.enabled,
    evaluation: evaluated.get(r.code) ?? null,
  }));
  const checklist: CheckChecklistItem[] = liveRows(db, 'checklist').map((r) => {
    return {
      code: r.code,
      stage: r.stage,
      text: checklistName(r),
      source: r.goal,
      enabled: r.enabled,
      ...checklistLinks(r),
      confirmedAt: r.confirmedAt,
    };
  });
  const netWorthCents = netWorthAsOf(db, asOf).totalCents;
  return { asOf, netWorthCents, ...summarizeCheck({ rules, checklist, netWorthCents }) };
}

export interface RuleStatusEntry {
  code: string;
  name: string;
  /** `null` = nicht bewertbar (missing data). */
  status: RuleStatus | null;
}

/**
 * Status of every enabled rule on a day (computed now, like `financeCheck`): one entry per rule
 * in rule-book order, for the Finanz-Check cells of the Monats-One-Pager.
 */
export function ruleStatuses(
  db: Executor,
  asOf: string,
  facts: RuleFacts = loadFacts(db, asOf),
): RuleStatusEntry[] {
  const rows = liveRows(db, 'rule').filter((r) => r.enabled);
  const evaluated = evaluateAll(db, rows, asOf, facts);
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    status: evaluated.get(r.code)?.status ?? null,
  }));
}
