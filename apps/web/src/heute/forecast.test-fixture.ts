import type { HeuteForecast35d, HeuteForecastReport } from './api';

/** Hand-checked fixed outflow on day 35; dates and balances do not use the forecast formula. */
export function forecast35dFixture(): HeuteForecast35d & { report: HeuteForecastReport } {
  return {
    asOf: '2026-03-18',
    horizon: '35d',
    levers: [],
    available: true,
    report: {
      startDay: '2026-03-18',
      startCents: 100_000,
      horizon: '35d',
      horizonDays: 35,
      points: Array.from({ length: 36 }, (_, index) => {
        const day = new Date(Date.UTC(2026, 2, 18 + index)).toISOString().slice(0, 10);
        const balanceCents = index < 35 ? 100_000 : 87_500;
        return { day, balanceCents, bufferCents: balanceCents, plainCents: balanceCents };
      }),
      eventMarks: [],
      scheduledInflows: [],
      low: { day: '2026-04-22', index: 35, cents: 87_500 },
    },
  };
}
