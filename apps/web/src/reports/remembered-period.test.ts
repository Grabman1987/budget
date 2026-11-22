// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import {
  forgetReportPeriod,
  rememberedReportPeriod,
  rememberReportPeriod,
  supportsReportPeriod,
} from './remembered-period';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('remembers a validated calendar range on this device, with explicit links taking priority', () => {
  rememberReportPeriod('2026-01..2026-03');
  expect(rememberedReportPeriod('ausgaben', {})).toBe('2026-01..2026-03');
  expect(rememberedReportPeriod('sparquote', { zeitraum: 'Alles' })).toBeUndefined();
  expect(rememberedReportPeriod('pdepots', {})).toBe('2026-01..2026-03');
});

it('does not apply or adopt periods from fixed, monthly, annual or saved-view reports', () => {
  rememberReportPeriod('3M');
  for (const id of [
    'onepager',
    'jahresreport',
    'kontakte',
    'vergleich',
    'gehalt',
    'abos',
    'unknown',
  ]) {
    expect(rememberedReportPeriod(id, {})).toBeUndefined();
    expect(supportsReportPeriod(id, {})).toBe(false);
  }
  expect(supportsReportPeriod('einnahmen-ausgaben', { darstellung: 'income' })).toBe(
    import.meta.env.VITE_BUDGET_REDESIGN === '1',
  );
  expect(supportsReportPeriod('vermoegen-schulden', { darstellung: 'freiheit' })).toBe(false);
  expect(supportsReportPeriod('vermoegen-schulden', { darstellung: 'verteilung' })).toBe(false);
  expect(supportsReportPeriod('explorer', { ansicht: 'synthetic-view' })).toBe(false);
  expect(supportsReportPeriod('explorer', { vorlage: 'year' })).toBe(false);
  expect(supportsReportPeriod('explorer', { vorlage: 'total' })).toBe(true);
  expect(rememberedReportPeriod('explorer', {})).toBe('3M');
});

it('clears the shared device default in one action', () => {
  rememberReportPeriod('Alles');
  forgetReportPeriod();
  expect(rememberedReportPeriod('ausgaben', {})).toBeUndefined();
});

it('ignores invalid preferences and handles unavailable browser storage', () => {
  rememberReportPeriod('invalid');
  expect(rememberedReportPeriod('ausgaben', {})).toBeUndefined();
  localStorage.setItem('budget.reports.period', '2026-13..2026-15');
  expect(rememberedReportPeriod('ausgaben', {})).toBeUndefined();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => rememberReportPeriod('3M')).not.toThrow();
  expect(rememberedReportPeriod('ausgaben', {})).toBeUndefined();
});
