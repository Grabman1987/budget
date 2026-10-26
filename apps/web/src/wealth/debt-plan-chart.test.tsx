import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import type { LoanSchedule } from '@budget/domain';
import type { LoanPlanView } from './loan-planning-api';
import { DebtPlanChart } from './debt-plan-chart';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 900] }));

describe('debt plan chart inspection values', () => {
  it('shows exact observed and planned cents in the chart table with a gap in the Ist line', () => {
    const basis = {
      name: 'Kredit Muster',
      currency: 'EUR',
      asOf: '2026-10-26',
      balanceCents: 12_345,
    } as LoanPlanView;
    const baseline = {
      payoffMonth: '2026-11',
      rows: [
        { month: '2026-10', closingCents: 6_172 },
        { month: '2026-11', closingCents: 0 },
      ],
    } as LoanSchedule;
    const html = renderToStaticMarkup(
      <DebtPlanChart
        basis={basis}
        history={[
          { date: '2026-05-31', balanceCents: 77 },
          { date: '2026-07-31', balanceCents: -15_001 },
          { date: '2026-09-30', balanceCents: -13_007 },
        ]}
        baseline={baseline}
      />,
    );
    expect(html).toContain('150,01 €');
    expect(html).toContain('130,07 €');
    expect(html).toContain('123,45 €');
    expect(html).toContain('61,72 €');
    expect(html).toContain('0,00 €');
    expect(html).toContain('31.05.2026');
    expect(html).not.toContain('31.08.2026');
    expect(html).not.toContain('−0,77 €');
    expect((html.match(/<path d="M[^"]+Z" class="l-actual"><\/path>/g) ?? []).length).toBe(3);
  });

  it('masks axis and table amounts when amount privacy is active', () => {
    setAmountsHidden(true);
    try {
      const html = renderToStaticMarkup(
        <DebtPlanChart
          basis={
            {
              name: 'Kredit Muster',
              currency: 'EUR',
              asOf: '2026-10-26',
              balanceCents: 12_345,
            } as LoanPlanView
          }
          history={[{ date: '2026-09-30', balanceCents: -13_007 }]}
          baseline={null}
        />,
      );
      expect(html).not.toContain('130,07');
      expect(html).not.toContain('123,45');
      expect(html).toContain('•••');
    } finally {
      setAmountsHidden(false);
    }
  });
});
