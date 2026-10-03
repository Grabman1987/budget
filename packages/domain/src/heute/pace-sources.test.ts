import { expect, it } from 'vitest';
import { paceSources } from './pace-sources';
import { paceModel } from '../kpi/pace';
import { paceForecastCurve } from './pace-forecast';

it('keeps rent and insurance once, reserves apart, and only variable spending extrapolated', () => {
  const sources = paceSources('2026-09', '2026-09-10', [
    { kind: 'fixed', planCents: 90000, actualCents: 95000, dueDay: 1, scheduled: [] },
    { kind: 'periodic', planCents: 5000, actualCents: 0, dueDay: null, scheduled: [] },
    { kind: 'variable', planCents: 30000, actualCents: 5000, dueDay: null, scheduled: [] },
    {
      kind: 'fixed',
      planCents: 10000,
      actualCents: 2000,
      dueDay: 20,
      scheduled: [{ day: '2026-09-20', cents: 10000, settled: false }],
    },
  ]);
  const m = paceModel({
    month: '2026-09',
    today: '2026-09-10',
    ...sources,
    spending: [{ day: '2026-09-01', cents: 102000 }],
  });
  expect(m.figures).toMatchObject({
    spentCents: 102000,
    variableSoFarCents: 5000,
    openFixedCents: 8000,
    forecastEndCents: 120000,
  });
  expect(paceForecastCurve(m, sources.fixed).at(-1)).toBe(120000);
});
it('starts an overdue forecast at actuals and adds the unpaid remainder only once', () => {
  const fixed = [{ day: '2026-09-01', cents: 90000, paidCents: 20000, settled: false }];
  const m = paceModel({
    month: '2026-09',
    today: '2026-09-10',
    fixed,
    limitCents: 90000,
    fixedSpentCents: 20000,
    spending: [{ day: '2026-09-01', cents: 20000 }],
  });
  expect(paceForecastCurve(m, fixed)[0]).toBe(20000);
  expect(paceForecastCurve(m, fixed).at(-1)).toBe(90000);
});
