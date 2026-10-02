import type { HistoryMatrix, StageOf } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { fetchRules, type RuleBook } from '../rules/api';

/** Calls behind report 5.2 Finanz-Check-Verlauf: the stored rule results plus the live check. */

export interface ChecklistItemStatus {
  code: string;
  stage: number | null;
  text: string;
  source: string | null;
  basis: 'rule' | 'manual';
  ruleCode: string | null;
  status: 'ok' | 'warn' | 'bad' | 'open';
  done: boolean;
  valueText: string | null;
}

export interface FinanceCheckFull {
  asOf: string;
  netWorthCents: number;
  counts: { ok: number; warn: number; bad: number; total: number; notEvaluated: number };
  stage: StageOf;
  checklist: { done: number; total: number; items: ChecklistItemStatus[] };
}

export interface FinanzcheckVerlauf {
  matrix: HistoryMatrix;
  check: FinanceCheckFull;
  book: RuleBook;
}

/**
 * Reads the matrix of the stored results (last twelve month ends and today), the live check and
 * the rules. Re-deriving the stored results is slow, so it runs beside the page
 * (`useRuleDerivation`) and the page refreshes when it is done.
 */
export const finanzcheckVerlaufQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'finanzcheck-verlauf'],
    retry: false,
    queryFn: async (): Promise<FinanzcheckVerlauf> => {
      const [matrix, check, book] = await Promise.all([
        request<HistoryMatrix>('GET', '/api/rules/results'),
        request<FinanceCheckFull>('GET', '/api/rules/check'),
        fetchRules(),
      ]);
      return { matrix, check, book };
    },
  });
