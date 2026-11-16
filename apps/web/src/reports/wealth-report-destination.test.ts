import { expect, it, vi } from 'vitest';
import { wealthReportDestination } from './report-search';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));

it('routes retired wealth views only to their existing wealth pages', () => {
  expect(wealthReportDestination('vermoegen-schulden', 'freiheit')).toBe('/vermoegen/freiheit');
  expect(wealthReportDestination('vermoegen-schulden', 'schulden')).toBe('/vermoegen/schulden');
  expect(wealthReportDestination('vermoegen-schulden', 'bilanz')).toBeUndefined();
  expect(wealthReportDestination('vermoegen-schulden', 'rendite')).toBeUndefined();
  expect(wealthReportDestination('ausgaben', 'freiheit')).toBeUndefined();
});
