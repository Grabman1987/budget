import { expect, it } from 'vitest';
import { closeEntryMonth, closeSteps } from './month-close';

it('offers the previous month for the first five days and the current month for the last five', () => {
  expect(
    ['2026-01-01', '2026-01-05', '2026-01-06', '2026-02-23', '2026-02-24', '2026-02-28'].map(
      closeEntryMonth,
    ),
  ).toEqual(['2025-12', '2025-12', null, null, '2026-02', '2026-02']);
});
it('never treats the future steps as completed and only accepts the matching work version', () => {
  const work = [{ step: 3 as const, id: 'category', fingerprint: '200' }];
  const decisions = [{ ...work[0]!, reason: 'Übertrag akzeptiert' }];
  expect(closeSteps(work, decisions).map((s) => s.status)).toEqual([
    'done',
    'done',
    'skipped',
    'following',
    'following',
  ]);
  expect(closeSteps([{ ...work[0]!, fingerprint: '201' }], decisions)[2]?.status).toBe('open');
});
