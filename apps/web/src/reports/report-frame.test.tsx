// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ReportPeriodControl } from './period-quick-select';
import { PortfolioContributionsReport } from '../pages/portfolio-contributions-report';
import { findReport } from '../nav/reports-catalog';
import { REPORTS_CATALOG } from '../nav/pages';
import { TableReportFrame } from './table-report-frame';
import { VerdictLine } from './verdict-line';
import type { VerdictFacts } from '@budget/domain';
import type { ReportTables } from '@budget/db';
import type { UseQueryResult } from '@tanstack/react-query';
const response = {
  incomplete: [
    { securityId: 'synthetic', quality: 'estimated', from: '2026-01-01', to: '2026-01-03' },
  ],
  portfolio: {
    performance: { days: 2 },
    contributionHistory: {
      from: '2026-01-01',
      to: '2026-01-03',
      startValueCents: 10000,
      endValueCents: 12345,
      contributionsCents: 0,
      gainCents: 2345,
      daily: [
        { date: '2026-01-01', valueCents: 10000, investedCents: 10000 },
        { date: '2026-01-02', valueCents: 9000, investedCents: 10000 },
        { date: '2026-01-03', valueCents: 12345, investedCents: 10000 },
      ],
      months: [],
      years: [],
    },
  },
};
vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (v: unknown) => v,
  useQuery: () => ({ data: response }),
}));
vi.mock('../wealth/zeitraum', () => ({
  useZeitraum: () => ['YTD', vi.fn()],
  ZEITRAUM_VALUES: ['1M', '3M', 'YTD', '1J', '3J', 'Alles'],
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({
    children,
    extraFields,
    verdict,
  }: {
    children: React.ReactNode;
    extraFields?: { value: React.ReactNode }[];
    verdict?: VerdictFacts;
  }) => (
    <>
      {extraFields?.map((f, i) => (
        <div key={i}>{f.value}</div>
      ))}
      {verdict && <VerdictLine facts={verdict} />}
      {children}
    </>
  ),
}));

describe('report frame', () => {
  it('keeps an honest verdict when the selected table has no complete month yet', () => {
    cleanup();
    const data: ReportTables = {
      asOf: '2025-10-05',
      currentMonth: '2025-10',
      firstMonth: null,
      lastFullMonth: null,
      netWorth: 'omitted',
      payees: {},
      months: [],
      categories: [],
      incomeTypes: [],
      targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
    };
    render(
      <TableReportFrame
        report={findReport('sparquote')!}
        meta={REPORTS_CATALOG}
        through="full"
        className="synthetic-report"
        query={{ data, isFetching: false, isError: false } as UseQueryResult<ReportTables>}
      >
        {() => null}
      </TableReportFrame>,
    );
    expect(screen.getByTestId('report-verdict').textContent).toMatch(/Oktober:.*laufend/);
    expect(screen.getByTestId('report-verdict').textContent).not.toMatch(/undefined|NaN|0,0 %/);
    cleanup();
  });
  it('puts presets and the period select in one row container, with wrapping only on narrow screens', () => {
    const { container } = render(
      <ReportPeriodControl
        label="Zeitraum"
        options={['1M', '3M', 'YTD', '1J', '3J', 'Alles'].map((value) => ({
          value: value as 'YTD',
          label: value,
        }))}
        value="YTD"
        onChange={vi.fn()}
      />,
    );
    const row = container.querySelector('.report-period-control')!;
    expect(row.children[0]).toBe(screen.getByRole('group', { name: 'Zeitraum' }));
    expect(row.children[1]).toBe(screen.getByRole('group', { name: 'Berichtsfilter' }));
    expect(row.contains(screen.getByRole('combobox'))).toBe(true);
    const css = readFileSync('apps/web/src/reports/period-quick-select.css', 'utf8');
    expect(css).toMatch(/\.report-period-control\s*\{[^}]*display: flex/);
    expect(css).toMatch(
      /@media \(min-width: 768px\)[\s\S]*\.report-period-control\s*\{[^}]*flex-wrap: nowrap/,
    );
  });
  it('removes the valuation banner while retaining the small estimate mark and daily path', () => {
    const { container } = render(
      <PortfolioContributionsReport report={findReport('peinzahlungen')!} meta={REPORTS_CATALOG} />,
    );
    expect(screen.queryByTestId('valuation-hint')).toBeNull();
    expect(screen.queryByText(/Bewertung teilweise geschätzt:/)).toBeNull();
    expect(screen.getByTestId('contributions-end-value').textContent).toBe('≈123,45 €');
    expect(screen.getByRole('button', { name: '≈' }).getAttribute('aria-describedby')).toBeTruthy();
    const path = container.querySelector('.contributions-value-line')?.getAttribute('d');
    expect(path?.match(/L/g)).toHaveLength(2);
  });
});
