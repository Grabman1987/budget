// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  createTestDatabase,
  createBooking,
  INCOME_TYPES,
  netWorthAsOf,
  yearReportRead,
} from '@budget/db';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { YearWealthChangeValue } from './year-wealth-change';
import { YearSummary } from './period-report-summary';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 0] }));
vi.mock('./period-presentation', () => ({ PeriodPresentation: () => null }));

afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});

it.each([
  [10_001, 12_502, '25,01 € · 25,0 %'],
  [10_001, 7_500, '−25,01 € · −25,0 %'],
  [10_001, 10_001, '0,00 € · 0,0 %'],
  [0, 2_501, '25,01 € · Prozent nicht ermittelbar (Anfangsvermögen nicht positiv)'],
  [-10_001, 2_501, '125,02 € · Prozent nicht ermittelbar (Anfangsvermögen nicht positiv)'],
])(
  'shows exact wealth change from %i to %i without inventing a percentage basis',
  (startCents, endCents, text) => {
    const { container } = render(
      <YearWealthChangeValue
        netWorth={{
          startCents,
          endCents,
          ownCents: endCents - startCents,
          marketCents: 0,
          months: [],
        }}
      />,
    );
    expect(container.textContent).toBe(text);
    act(() => setAmountsHidden(true));
    expect(container.textContent).not.toContain('25,01');
    expect(container.textContent).not.toContain('25,0 %');
  },
);

it('shows the source net worth cents and change on the partial-year summary, with missing valuation reasons', () => {
  const opened = createTestDatabase();
  try {
    opened.sqlite.exec(
      "INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('year-account','Synthetic account','checking','budget',1,'2025-12-01');",
    );
    for (const [date, amountCents] of [
      ['2025-12-31', 10_001],
      ['2026-08-12', 2_501],
    ] as const)
      createBooking(
        opened.db,
        {
          accountId: 'year-account',
          date,
          amountCents,
          splits: [{ incomeTypeId: INCOME_TYPES.salary.id, amountCents }],
        },
        { actor: 'synthetic-test' },
      );
    const data = yearReportRead(opened.db, 2026, '2026-09-17');
    expect(data.report.netWorth?.startCents).toBe(netWorthAsOf(opened.db, '2025-12-31').totalCents);
    expect(data.report.netWorth?.endCents).toBe(netWorthAsOf(opened.db, '2026-08-31').totalCents);
    const view = render(<YearSummary data={data} />);
    expect(screen.getByText('Anfangsvermögen').nextElementSibling?.textContent).toBe('100,01 €');
    expect(screen.getByText('Vermögensänderung').nextElementSibling?.textContent).toBe(
      '25,01 € · 25,0 %',
    );
    expect(data.report.partial).toBe(true);
    act(() => setAmountsHidden(true));
    expect(screen.getByText('Vermögensänderung').nextElementSibling?.textContent).toBe(
      '••• € · •••',
    );
    act(() => setAmountsHidden(false));
    view.rerender(
      <YearSummary
        data={{
          ...data,
          report: { ...data.report, netWorth: null },
          netWorthUnavailable: 'Bewertung fehlt',
        }}
      />,
    );
    expect(screen.getByText('Vermögensänderung').nextElementSibling?.textContent).toBe(
      'nicht ermittelbar',
    );
    expect(screen.getByText('Bewertung fehlt')).toBeTruthy();
  } finally {
    opened.close();
  }
});
