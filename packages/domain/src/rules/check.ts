import { stageOf, type StageOf } from '../kpi/stage';
import type { RuleCode } from './params';
import type { RuleEvaluation, RuleStatus } from './types';

/**
 * Finanz-Check: counts, the six key rules and the stage checklist, assembled from evaluated
 * rules. Pure; `financeCheck` in `@budget/db` feeds it.
 */

/** The rules Heute shows, in the order of a tie (prototype `checks`). */
export const KEY_RULES: ReadonlyArray<RuleCode> = ['R02', 'R15', 'R01', 'R03', 'R08', 'R07'];

const SEVERITY: Record<RuleStatus, number> = { bad: 0, warn: 1, ok: 2 };

export interface CheckRule {
  code: string;
  name: string;
  stage: number | null;
  enabled: boolean;
  /** `null`: not evaluable (no data). */
  evaluation: RuleEvaluation | null;
}

export interface CheckChecklistItem {
  code: string;
  stage: number | null;
  text: string;
  source: string | null;
  enabled: boolean;
  /** The rule that decides this item; `null` items are confirmed by the owner. */
  ruleCode: string | null;
  confirmedAt: string | null;
  additionalRuleCodes?: ReadonlyArray<string>;
}

export interface ChecklistStatus {
  code: string;
  stage: number | null;
  text: string;
  source: string | null;
  /** `rule`: from the linked rule; `manual`: confirmed by the owner. */
  basis: 'rule' | 'manual';
  ruleCode: string | null;
  /** `open`: not yet confirmed (manual) or not evaluable (rule). */
  status: RuleStatus | 'open';
  done: boolean;
  confirmedAt: string | null;
  valueText: string | null;
}

export interface RuleView {
  code: string;
  name: string;
  stage: number | null;
  status: RuleStatus;
  valueText: string;
  actionNeeded: boolean;
  actionText: string | null;
}

export interface FinanceCheckSummary {
  counts: { ok: number; warn: number; bad: number; total: number; notEvaluated: number };
  /** The six key rules, most severe first. */
  keyRules: RuleView[];
  stage: StageOf;
  checklist: { done: number; total: number; items: ChecklistStatus[] };
}

export const bySeverity = (a: { status: RuleStatus; code: string }, b: typeof a): number =>
  SEVERITY[a.status] - SEVERITY[b.status] || a.code.localeCompare(b.code);

const view = (r: CheckRule, e: RuleEvaluation): RuleView => ({
  code: r.code,
  name: r.name,
  stage: r.stage,
  status: e.status,
  valueText: e.valueText,
  actionNeeded: e.actionNeeded,
  actionText: e.actionText,
});

export function summarizeCheck(input: {
  rules: ReadonlyArray<CheckRule>;
  checklist: ReadonlyArray<CheckChecklistItem>;
  netWorthCents: number;
}): FinanceCheckSummary {
  const active = input.rules.filter((r) => r.enabled);
  const evaluated = active.flatMap((r) => (r.evaluation ? [{ rule: r, e: r.evaluation }] : []));
  const count = (s: RuleStatus) => evaluated.filter((x) => x.e.status === s).length;
  const keyRules = KEY_RULES.flatMap((code) => {
    const hit = evaluated.find((x) => x.rule.code === code);
    return hit ? [view(hit.rule, hit.e)] : [];
  }).sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]); // stable: ties keep the key order

  const byCode = new Map(input.rules.map((r) => [r.code, r]));
  const items: ChecklistStatus[] = input.checklist
    .filter((c) => c.enabled)
    .map((c) => {
      const base = {
        code: c.code,
        stage: c.stage,
        text: c.text,
        source: c.source,
        ruleCode: c.ruleCode,
        confirmedAt: c.confirmedAt,
      };
      if (c.ruleCode !== null) {
        const linked = [c.ruleCode, ...(c.additionalRuleCodes ?? [])].map((code) => {
          const r = byCode.get(code);
          return r?.enabled ? r.evaluation : null;
        });
        const e = linked.some((r) => !r)
          ? null
          : linked.reduce((a, b) => (b && a && SEVERITY[b.status] < SEVERITY[a.status] ? b : a));
        const values = linked.flatMap((r) => (r ? [r.valueText] : []));
        return {
          ...base,
          basis: 'rule' as const,
          status: e ? e.status : ('open' as const),
          done: e?.status === 'ok',
          valueText: e ? values.join(' · ') : null,
        };
      }
      const done = c.confirmedAt !== null;
      return {
        ...base,
        basis: 'manual' as const,
        status: done ? ('ok' as const) : ('open' as const),
        done,
        valueText: null,
      };
    });
  return {
    counts: {
      ok: count('ok'),
      warn: count('warn'),
      bad: count('bad'),
      total: active.length,
      notEvaluated: active.length - evaluated.length,
    },
    keyRules,
    stage: stageOf(input.netWorthCents),
    checklist: { done: items.filter((i) => i.done).length, total: items.length, items },
  };
}
