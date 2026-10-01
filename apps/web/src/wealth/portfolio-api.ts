import { queryOptions } from '@tanstack/react-query';
import { queryString, request } from '../api/http';
import type { Period } from '@budget/domain';

/** Typed calls of the portfolio read model (P5.5) and the market refresh (P5.1). */

export type PriceSource = 'yfinance' | 'ariva' | 'manual' | 'import';
export type SecurityKind = 'etf' | 'stock' | 'fund' | 'bond' | 'crypto' | 'p2p' | 'other';

export interface PositionLine {
  securityId: string;
  name: string;
  kind: SecurityKind;
  assetClassId: string | null;
  institutionId: string | null;
  unitsE8: number;
  valueCents: number;
  costCents: number;
  gainCents: number;
  shareBp: number;
}

export interface ClassGroup {
  assetClassId: string | null;
  name: string;
  valueCents: number;
  shareBp: number;
  targetBp: number | null;
  bandBp: number | null;
  breach: boolean;
  positions: PositionLine[];
}

export interface ClassRow {
  assetClass: string;
  valueCents: number;
  shareBp: number;
  targetBp: number | null;
  bandBp: number | null;
  breach: boolean;
  side: 'under' | 'over' | 'in';
  speculativeOnly: boolean;
}

export interface RebalanceProposal {
  code: 'r13_under' | 'r13_over' | 'r14_single' | 'r14_platform' | 'r15_speculative';
  rule: 'R13' | 'R14' | 'R15';
  direction: 'add' | 'reduce';
  assetClass: string | null;
  subjectId: string | null;
  shareBp: number;
  referenceBp: number;
  gapCents: number;
}

export interface WindowPerformance {
  ttwror: number;
  moneyWeighted: number;
  xirr: number | null;
  benchmarkTtwror?: number | null;
  from: string;
  to: string;
  days: number;
  monthCount: number;
}

export interface PortfolioSummary {
  asOf: string;
  period: Period;
  valueCents: number;
  costCents: number;
  gainCents: number;
  performance: WindowPerformance | null;
  benchmark: { securityId: string; name: string } | null;
  costs: { terCents: number; feesCents: number; totalCents: number; costRateBp: number };
  income: { grossCents: number; taxCents: number; feeCents: number; netCents: number };
  allocation: { rows: ClassRow[]; breaches: ClassRow[]; ok: boolean };
  speculative: { shareBp: number; limitBp: number; breach: boolean; overCents: number };
  proposals: RebalanceProposal[];
  classes: ClassGroup[];
  positions: PositionLine[];
  platforms: { institutionId: string | null; name: string; valueCents: number; shareBp: number }[];
  names: {
    assetClasses: Record<string, string>;
    securities: Record<string, string>;
    institutions: Record<string, string>;
  };
}

export type PlanReason =
  'unchanged' | 'paused_r15' | 'paused_r13_over' | 'steer_r13_under' | 'redistributed' | 'rounded';

export interface PlanProposal {
  id: string;
  name: string;
  currentCents: number;
  proposedCents: number;
  reason: PlanReason;
}

export interface SavingsProposal {
  proposal: {
    plans: PlanProposal[];
    totalCents: number;
    freedCents: number;
    changed: boolean;
    note: 'no_eligible_plan' | null;
  };
  basis: { id: string; securityId: string; dayOfMonth: number; amountCents: number }[];
}

export interface PricePoint {
  date: string;
  priceMicro: number;
  currency: string;
  source: PriceSource;
}

export const PORTFOLIO_KEY = ['wealth', 'portfolio'] as const;

export const portfolioQuery = (period: Period) =>
  queryOptions({
    queryKey: [...PORTFOLIO_KEY, 'summary', period],
    queryFn: () =>
      request<{ portfolio: PortfolioSummary }>('GET', `/api/portfolio${queryString({ period })}`),
  });

export const proposalQuery = () =>
  queryOptions({
    queryKey: [...PORTFOLIO_KEY, 'proposal'],
    queryFn: () => request<SavingsProposal>('GET', '/api/savings-plans/proposal'),
  });

export const pricesQuery = (securityId: string) =>
  queryOptions({
    queryKey: [...PORTFOLIO_KEY, 'prices', securityId],
    queryFn: () =>
      request<{ securityId: string; currency: string; prices: PricePoint[] }>(
        'GET',
        `/api/securities/${encodeURIComponent(securityId)}/prices`,
      ),
  });

export interface ApplyResult {
  changes: { planId: string; securityId: string; fromCents: number; toCents: number }[];
  inboxItemId: string | null;
  groupId: string;
}

export const applyProposal = () => request<ApplyResult>('POST', '/api/savings-plans/apply', {});

export interface RefreshResult {
  prices: { tracked: number; upToDate: number; failed: unknown[] };
  fx: { failed: unknown[] };
}

export const refreshMarket = () => request<RefreshResult>('POST', '/api/market/refresh');
