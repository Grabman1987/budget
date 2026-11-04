// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import {
  createTestDatabase,
  createBooking,
  INCOME_TYPES,
  monthOnePager,
  yearReportRead,
} from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { MonthSummary, YearSummary } from './period-report-summary';
import { validateReportSearch, normalizeHistoryPeriod, isPaperPresentation } from './report-search';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 0] }));
vi.mock('./period-presentation', () => ({
  PeriodPresentation: () => <button type="button">A4 Druckblatt öffnen</button>,
}));
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
  flags.REDESIGN_ENABLED = true;
});
function fixture() {
  const db = createTestDatabase();
  db.sqlite.exec(
    "INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('r5-account','Synthetic R5','checking','budget',1,'2026-01-01'); INSERT INTO category_group(id,name) VALUES ('r5-group','Synthetic group'); INSERT INTO category(id,group_id,name,class,kind) VALUES ('r5-category','r5-group','Synthetic category','need','variable');",
  );
  for (const [amount, split] of [
    [10001, { incomeTypeId: INCOME_TYPES.salary.id }],
    [-7002, { categoryId: 'r5-category' }],
  ] as const)
    createBooking(
      db.db,
      {
        accountId: 'r5-account',
        date: '2026-08-12',
        amountCents: amount,
        splits: [{ ...split, amountCents: amount }],
      },
      { actor: 'synthetic-r5' },
    );
  return db;
}
it('ON monthly summary preserves exact reader cents, prior rows and missing rate versus zero, with privacy', () => {
  const db = fixture();
  try {
    const data = monthOnePager(db.db, '2026-09-17', '2026-08');
    const view = render(<MonthSummary data={data} />);
    expect(screen.getByTestId('r5-month-income').textContent).toBe('100,01 €');
    expect(screen.getByTestId('r5-month-saved').textContent).toBe('29,99 €');
    expect(screen.getByRole('table').textContent).toContain('70,02 €');
    expect(screen.getByRole('table').textContent).toContain('0,00 €');
    view.rerender(<MonthSummary data={{ ...data, partial: true }} />);
    expect(screen.getByText('Nach Monatsende')).toBeTruthy();
    act(() => setAmountsHidden(true));
    expect(screen.getByTestId('r5-month-income').textContent).toBe('••• €');
    expect(screen.getByRole('table').textContent).not.toContain('70,02');
  } finally {
    db.close();
  }
});
it('ON year summary uses the same annual reader and never fills unavailable net worth with zero', () => {
  const db = fixture();
  try {
    const data = yearReportRead(db.db, 2026, '2026-09-17');
    const view = render(<YearSummary data={data} />);
    expect(screen.getByTestId('r5-year-income').textContent).toBe('100,01 €');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('table').textContent).toContain('29,99 €');
    view.rerender(
      <YearSummary
        data={{
          ...data,
          report: { ...data.report, netWorth: null },
          netWorthUnavailable: 'Bewertung fehlt',
        }}
      />,
    );
    expect(screen.getByText('Bewertung fehlt')).toBeTruthy();
    expect(screen.getByText('Nettovermögen: —')).toBeTruthy();
  } finally {
    db.close();
  }
});
it('accepts the paper presentation ON and keeps the OFF validator contract', () => {
  expect(validateReportSearch({ darstellung: 'druckblatt' }).darstellung).toBe('druckblatt');
  expect(isPaperPresentation(undefined, 'ps-b')).toBe(true);
  expect(isPaperPresentation(undefined, 'details')).toBe(false);
  expect(
    normalizeHistoryPeriod({ darstellung: 'finanzcheck', monat: '2000-01', period: 'payday' }),
  ).toBe(true);
  flags.REDESIGN_ENABLED = false;
  expect(isPaperPresentation('druckblatt', 'ps-b')).toBe(false);
  expect(
    normalizeHistoryPeriod({ darstellung: 'finanzcheck', monat: '2000-01', period: 'payday' }),
  ).toBe(false);
  expect(validateReportSearch({ darstellung: 'druckblatt' }).darstellung).toBeUndefined();
  expect(validateReportSearch({ darstellung: 'finanzcheck' }).darstellung).toBeUndefined();
});
