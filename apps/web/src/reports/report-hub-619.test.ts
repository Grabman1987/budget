// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { LIQUIDITY_FORECAST, REPORTS } from '../nav/reports-catalog';
import {
  HUB_GROUPS,
  HUB_REPORTS,
  hubReport,
  matchingHubReports,
  recentReports,
  rememberReport,
} from './report-hub-model';
import { validateReportSearch } from './report-search';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: false }));

beforeEach(() => sessionStorage.clear());
it('lists the exact sixteen mapped reports in four groups without removing the old report catalog', () => {
  expect(HUB_REPORTS.map((r) => r.id)).toEqual([
    'einnahmen-ausgaben',
    'ausgaben',
    'gehalt',
    'geldfluss',
    'sparquote',
    'budgettreue',
    'abos',
    'inflation',
    'vermoegen-schulden',
    'pdepots',
    'pallocation',
    'psteuern',
    'explorer',
    'vergleich',
    'onepager',
    'jahresreport',
  ]);
  expect(HUB_REPORTS.map((r) => r.no)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  ]);
  expect(HUB_GROUPS.map((g) => g.id)).toEqual(['income', 'wealth', 'portfolio', 'reports']);
  expect(HUB_GROUPS.map((g) => HUB_REPORTS.filter((r) => r.group === g.id).length)).toEqual([
    8, 1, 3, 4,
  ]);
  // Historical positions stay stable after removing the five standalone catalog entries.
  expect(REPORTS).toHaveLength(29);
  expect(new Set([LIQUIDITY_FORECAST.id, ...REPORTS.map((r) => r.id)]).size).toBe(30);
  expect(hubReport('prendite')?.id).toBe('pallocation');
  expect(hubReport('planungstreue')).toBeUndefined();
});
it('finds literal names and question text, preserving catalog numbers when filtered', () => {
  expect(matchingHubReports(' INFLATION ').map((r) => [r.no, r.id])).toEqual([[8, 'inflation']]);
  expect(matchingHubReports('Halten wir den Plan').map((r) => r.id)).toEqual(['budgettreue']);
  expect(matchingHubReports('', 'portfolio').map((r) => r.no)).toEqual([10, 11, 12]);
  expect(matchingHubReports('inflation', 'wealth')).toEqual([]);
});
it('stores only three unique public report IDs and rejects tampered or oversized session data', () => {
  for (const id of ['ausgaben', 'gehalt', 'geldfluss', 'inflation', 'gehalt']) rememberReport(id);
  expect(recentReports().map((r) => r.id)).toEqual(['gehalt', 'inflation', 'geldfluss']);
  expect(sessionStorage.getItem('budget.reports.recent.v1')).toBe(
    '["gehalt","inflation","geldfluss"]',
  );
  rememberReport('ausgaben?private=123');
  expect(recentReports().map((r) => r.id)).toEqual(['gehalt', 'inflation', 'geldfluss']);
  sessionStorage.setItem(
    'budget.reports.recent.v1',
    JSON.stringify(['unknown', {}, 'gehalt', 'gehalt']),
  );
  expect(recentReports().map((r) => r.id)).toEqual(['gehalt']);
  sessionStorage.setItem('budget.reports.recent.v1', 'x'.repeat(1025));
  expect(recentReports()).toEqual([]);
});
it('validates bounded saved-view IDs without losing the live F exact-window parser', () => {
  expect(
    validateReportSearch({ ansicht: 'saved-id', exakt: 'true', vorlage: 'heatmap' }),
  ).toMatchObject({ ansicht: 'saved-id', exakt: true, vorlage: 'heatmap' });
  expect(validateReportSearch({ ansicht: 'x'.repeat(65), exakt: false })).toMatchObject({
    ansicht: undefined,
    exakt: undefined,
  });
  expect(validateReportSearch({ ansicht: 12, exakt: true })).toMatchObject({
    ansicht: undefined,
    exakt: true,
  });
});
