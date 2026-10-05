import { expect, it } from 'vitest';
import { forecastStepLabels } from './forecast-labels';
it('selects five largest named steps from synthetic payments; threshold includes exactly 250 EUR', () => {
  const rows = [
    {
      day: '2026-01-02',
      items: [100, 24999, -25000, -60000, 80000, -40000, 30000, 50000].map((cents, i) => ({
        cents,
        label: `Zahlung ${i}`,
      })),
    },
  ];
  const labels = forecastStepLabels(rows);
  expect(labels).toHaveLength(5);
  expect(labels.map((l) => Math.abs(l.cents)).sort((a, b) => a - b)).toEqual([
    30000, 40000, 50000, 60000, 80000,
  ]);
  expect(
    forecastStepLabels([{ day: '2026-01-03', items: [{ cents: -25000, label: 'Miete Test' }] }])[0],
  ).toEqual({ day: '2026-01-03', cents: -25000, label: 'Miete Test' });
});
