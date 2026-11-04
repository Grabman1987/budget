// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_EXPLORER_QUERY, type ExplorerResult } from '@budget/domain';
import { ExplorerPhoneRows, explorerDraftDirty, explorerHeadline } from './explorer-redesign';
import { customChartModel } from './explorer-chart-model-626';
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/konten/buchungen">{children}</a>
  ),
}));
afterEach(cleanup);
const source: ExplorerResult = {
  query: DEFAULT_EXPLORER_QUERY,
  unit: 'cents',
  months: ['2026-07', '2026-08', '2026-09'],
  good: 'low',
  truncated: 0,
  columns: [{ key: '2026-Q3', months: ['2026-07', '2026-08', '2026-09'] }],
  rows: [
    { key: 'synthetic', label: 'Synthetic category', class: 'want', values: [10001], total: 10001 },
  ],
  totals: { values: [10001], total: 10001 },
};
it('ON headline uses authoritative cents, and non-additive/missing totals stay a count', () => {
  expect(explorerHeadline(source)).toMatchObject({ value: 10001, unit: 'money' });
  expect(explorerHeadline({ ...source, totals: null })).toMatchObject({ value: 1, unit: 'count' });
  expect(explorerHeadline({ ...source, query: { ...source.query, meas: 'avg' } })).toMatchObject({
    unit: 'count',
  });
});
it('ON phone source action receives the original row and column; null cells have no action', () => {
  const open = vi.fn();
  const model = customChartModel(source);
  render(<ExplorerPhoneRows data={model} onOpen={open} />);
  fireEvent.click(screen.getByRole('button', { name: /Synthetic category/ }));
  expect(open.mock.calls[0]!.slice(1)).toEqual(['synthetic', '2026-Q3']);
  cleanup();
  render(
    <ExplorerPhoneRows
      data={{ ...model, rows: model.rows.map((row) => ({ ...row, values: [null] })) }}
      onOpen={open}
    />,
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('–')).toBeTruthy();
});
it('named saved-view edits block abandonment, but browsing an unnamed query does not', () => {
  expect(explorerDraftDirty('', source.query)).toBe(false);
  expect(explorerDraftDirty('Draft', source.query)).toBe(true);
  const original = { name: 'Saved', query: source.query };
  expect(explorerDraftDirty('Saved', source.query, original)).toBe(false);
  expect(explorerDraftDirty('Saved', { ...source.query, meas: 'avg' }, original)).toBe(true);
});
