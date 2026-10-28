import { expect, it } from 'vitest';
import { payeeHeaderRange } from './payee-analysis-report';

it('preserves the exact day boundaries in the compact title-row basis', () => {
  expect(payeeHeaderRange('2026-08-01', '2026-08-31')).toBe('01.–31.08.2026');
  expect(payeeHeaderRange('2026-07-01', '2026-08-31')).toBe('01.07.26–31.08.26');
  expect(payeeHeaderRange('2025-12-01', '2026-01-31')).toBe('01.12.25–31.01.26');
  expect(payeeHeaderRange(null, '2026-08-31')).toBe('keine geschlossenen Monate');
});
