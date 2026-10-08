// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomeTargets } from '@budget/domain';
import type { PlanRow } from './plan-model';
import { IncomeTargetsCard } from './income-targets-card';

afterEach(cleanup);

const incomeTargets = (over: Partial<IncomeTargets> = {}): IncomeTargets => ({
  source: 'expected',
  expectedCents: 12_000,
  assignedIncomeCents: 12_000,
  targetsCents: 0,
  heldCents: 0,
  previousHeldCents: 0,
  differenceCents: 12_000,
  unfundedCategoryIds: [],
  unfundedCents: 0,
  ...over,
});

const row = (target: PlanRow['target'], over: Partial<PlanRow> = {}): PlanRow => ({
  categoryId: 'food',
  id: 'food',
  name: 'Lebensmittel',
  icon: null,
  cls: 'need',
  kind: 'variable',
  stage: 2,
  groupId: 'daily',
  cardAccountId: null,
  carryCents: 0,
  assignedCents: 0,
  activityCents: 0,
  availableCents: 0,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target,
  ...over,
});

const target = (amountCents: number) => ({
  id: 'food-target',
  categoryId: 'food',
  kind: 'monthly' as const,
  amountCents,
  everyMonths: 1,
  targetDate: null,
  dueDay: null,
  validFrom: '2026-09',
});

function renderCard(rows: PlanRow[], data = incomeTargets()) {
  render(<IncomeTargetsCard data={data} rows={rows} onOpen={vi.fn()} />);
}

describe('income target setup state', () => {
  it('does not report all targets funded when there are no categories', () => {
    renderCard([]);

    expect(screen.getByText('Noch nicht eingerichtet.')).toBeTruthy();
    expect(screen.queryByText('Alle Monatsziele sind finanziert.')).toBeNull();
  });

  it('does not treat rows without an effective target as configured targets', () => {
    renderCard([row(null)]);

    expect(screen.getByText('Noch nicht eingerichtet.')).toBeTruthy();
    expect(screen.queryByText('Alle Monatsziele sind finanziert.')).toBeNull();
  });

  it('keeps an explicitly configured zero target as a configured target', () => {
    renderCard([row(target(0))]);

    expect(screen.getByText('Alle Monatsziele sind finanziert.')).toBeTruthy();
    expect(screen.queryByText('Noch nicht eingerichtet.')).toBeNull();
  });

  it('reports a reached positive target as funded', () => {
    renderCard(
      [row(target(10_000), { goalCents: 10_000, assignedCents: 10_000 })],
      incomeTargets({
        targetsCents: 10_000,
        differenceCents: 2_000,
      }),
    );

    expect(screen.getByText('Alle Monatsziele sind finanziert.')).toBeTruthy();
  });

  it('keeps an unfunded configured target visible with its literal cent amount', () => {
    renderCard(
      [row(target(10_000), { goalCents: 10_000, needCents: 1_234 })],
      incomeTargets({
        targetsCents: 10_000,
        differenceCents: 2_000,
        unfundedCategoryIds: ['food'],
        unfundedCents: 1_234,
      }),
    );

    expect(screen.getByText('Noch zu finanzieren: 12,34 €')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lebensmittel\s*12,34 €/ })).toBeTruthy();
  });
});
