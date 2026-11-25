// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DailyBudgetLine } from './charts';
import { leadView } from './lead-boundary';
import type { Heute } from './api';

afterEach(cleanup);

const stand = { today: '2026-11-25', payday: { day: '2026-12-15', daysToPayday: 20 } };

describe('leadView', () => {
  it('period month: Frei bis Monatsende with the month end', () => {
    expect(
      leadView({
        stand,
        leadBoundary: { day: '2026-11-30', kind: 'monthEnd', daysToBoundary: 6 },
      } as Heute),
    ).toMatchObject({
      title: 'Frei bis Monatsende',
      day: '2026-11-30',
      days: 6,
      until: 'bis Monatsende',
    });
  });
  it('period payday and saved responses without leadBoundary: Frei bis Gehalt', () => {
    expect(
      leadView({
        stand,
        leadBoundary: { day: '2026-12-15', kind: 'payday', daysToBoundary: 20 },
      } as Heute),
    ).toMatchObject({ title: 'Frei bis Gehalt', day: '2026-12-15', days: 20 });
    expect(leadView({ stand } as Heute)).toMatchObject({
      title: 'Frei bis Gehalt',
      day: '2026-12-15',
      days: 20,
      untilThe: 'bis zum Gehalt',
    });
  });
});

it('daily budget line names the selected boundary', () => {
  render(
    <DailyBudgetLine
      data={
        {
          stand,
          dailyBudget: { remainingDays: 6, perDayCents: 5_000 },
          leadBoundary: { day: '2026-11-30', kind: 'monthEnd', daysToBoundary: 6 },
        } as Heute
      }
    />,
  );
  expect(screen.getByTestId('heute-daily-budget').textContent).toContain(
    'noch 6 Tage bis zum Monatsende',
  );
});
