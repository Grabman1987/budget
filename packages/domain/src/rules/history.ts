import type { RuleStatus } from './types';

/**
 * Finanz-Check-Verlauf (report 5.2): reads the stored rule results of several days (the matrix of
 * `GET /api/rules/results`) as one status strip per rule and one count per day. Pure; nothing is
 * re-evaluated here, a day on which a rule had no data stays "nicht bewertbar" (`null`).
 */

export interface HistoryCell {
  asOf: string;
  status: RuleStatus;
  valueText: string | null;
}

export interface HistoryRule {
  code: string;
  name: string;
  stage: number | null;
  /** Stored results of this rule, ascending by day; days without a result are missing. */
  cells: ReadonlyArray<HistoryCell>;
}

export interface HistoryMatrix {
  /** Days with at least one stored result, ascending. */
  days: ReadonlyArray<string>;
  rules: ReadonlyArray<HistoryRule>;
}

export interface TimelineCell {
  asOf: string;
  /** `null`: not evaluable on that day. */
  status: RuleStatus | null;
  valueText: string | null;
}

export interface RuleTimeline {
  code: string;
  name: string;
  stage: number | null;
  /** One cell per matrix day. */
  strip: ReadonlyArray<TimelineCell>;
  /** Status on the newest day; `null` when the rule was not evaluable then. */
  current: RuleStatus | null;
  /** First day of the unbroken run of `current` that ends on the newest day. */
  sinceDay: string | null;
  /** The run reaches the first day shown, so it may be older than the report can see. */
  sinceStart: boolean;
}

export interface DayCounts {
  asOf: string;
  ok: number;
  warn: number;
  bad: number;
  /** Rules without a result that day. */
  notEvaluated: number;
}

const SEVERITY: Record<RuleStatus | 'none', number> = { bad: 0, warn: 1, ok: 2, none: 3 };

/** One strip per rule, the most severe current status first, then by code. */
export function ruleTimelines(matrix: HistoryMatrix): RuleTimeline[] {
  const days = matrix.days;
  const timelines = matrix.rules.map((rule): RuleTimeline => {
    const byDay = new Map(rule.cells.map((c) => [c.asOf, c]));
    const strip = days.map((asOf): TimelineCell => {
      const cell = byDay.get(asOf);
      return { asOf, status: cell?.status ?? null, valueText: cell?.valueText ?? null };
    });
    const last = strip[strip.length - 1];
    const current = last?.status ?? null;
    let sinceIndex = strip.length - 1;
    if (current !== null)
      while (sinceIndex > 0 && strip[sinceIndex - 1]?.status === current) sinceIndex--;
    return {
      code: rule.code,
      name: rule.name,
      stage: rule.stage,
      strip,
      current,
      sinceDay: current === null ? null : (strip[sinceIndex]?.asOf ?? null),
      sinceStart: current !== null && sinceIndex === 0,
    };
  });
  return timelines.sort(
    (a, b) =>
      SEVERITY[a.current ?? 'none'] - SEVERITY[b.current ?? 'none'] || a.code.localeCompare(b.code),
  );
}

/** Erfüllt / Warnung / verletzt per day, in the order of `matrix.days`. */
export function dayCounts(matrix: HistoryMatrix): DayCounts[] {
  return matrix.days.map((asOf) => {
    let ok = 0;
    let warn = 0;
    let bad = 0;
    for (const rule of matrix.rules) {
      const status = rule.cells.find((c) => c.asOf === asOf)?.status;
      if (status === 'ok') ok++;
      else if (status === 'warn') warn++;
      else if (status === 'bad') bad++;
    }
    return { asOf, ok, warn, bad, notEvaluated: matrix.rules.length - ok - warn - bad };
  });
}
