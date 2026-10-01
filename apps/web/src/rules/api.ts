import { request } from '../api/http';
import type { WriteResult } from '../ledger/types';

/** Shapes and calls of the rule book API (`/api/rules`, P3.5). Shares are basis points. */

export type RuleStatusCode = 'ok' | 'warn' | 'bad';

export interface StoredResult {
  asOf: string;
  status: RuleStatusCode;
  valueText: string;
  actionNeeded: boolean;
  actionText: string | null;
}

export interface RuleRow {
  id: string;
  code: string;
  name: string;
  stage: number | null;
  goal: string | null;
  /** The generic next step when the rule bites. */
  action: string | null;
  enabled: boolean;
  params: Record<string, unknown>;
  defaults: Record<string, unknown>;
  latest: StoredResult | null;
}

export interface ChecklistRow {
  code: string;
  name: string;
  stage: number | null;
  source: string | null;
  enabled: boolean;
  /** The rule that decides the item; `null`: the owner confirms it. */
  ruleCode: string | null;
  confirmedAt: string | null;
}

export interface RuleBook {
  rules: RuleRow[];
  checklist: ChecklistRow[];
}

export interface StageInfo {
  stage: 1 | 2 | 3;
  label: string;
}

export interface FinanceCheck {
  counts: { ok: number; warn: number; bad: number; total: number; notEvaluated: number };
  stage: StageInfo;
}

const path = (code: string) => `/api/rules/${encodeURIComponent(code)}`;

export const fetchRules = () => request<RuleBook>('GET', '/api/rules');
export const fetchCheck = () => request<FinanceCheck>('GET', '/api/rules/check');
export const patchRule = (
  code: string,
  patch: { params?: Record<string, unknown>; enabled?: boolean },
) => request<{ rule: RuleRow } & WriteResult>('PATCH', path(code), patch);
export const confirmItem = (code: string, confirmed: boolean) =>
  request<{ item: ChecklistRow } & WriteResult>(
    'PATCH',
    `/api/rules/checklist/${encodeURIComponent(code)}`,
    { confirmed },
  );
/** Re-derives the stored results (idempotent): the panel reads "latest" from them. */
export const evaluateRules = () => request<unknown>('POST', '/api/rules/evaluate');
