import { expect, it } from 'vitest';
import { balanceForecast } from './balance-forecast';
import { heuteWindow, nextPayday } from './payday';

it('limits actual history, forecast and the earliest low point to the chosen window', () => {
  const today = '2026-10-05';
  const window = heuteWindow('payday', '2026-10', today, nextPayday(today).day);
  const result = balanceForecast(
    {
      startDay: today,
      startCents: 10_001,
      variableMonthlyCents: 0,
      items: [
        { day: '2026-10-17', cents: -101, kind: 'fixed' },
        { day: '2026-10-18', cents: -50_000, kind: 'fixed' },
      ],
    },
    window,
    [
      { day: '2026-09-20', balanceCents: -100_000 },
      { day: '2026-09-21', balanceCents: 9_900 },
      { day: today, balanceCents: 10_001 },
    ],
  );
  expect(result.actual.map((d) => d.day)).toEqual(['2026-09-21', today]);
  expect(result.forecast.at(-1)).toMatchObject({ day: '2026-10-17', balanceCents: 9_900 });
  expect(result.low).toEqual({ day: '2026-09-21', index: 0, cents: 9_900 });
});
