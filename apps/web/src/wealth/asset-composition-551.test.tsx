// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { projectAssetComposition } from '@budget/domain';
import { AssetCompositionChart } from './asset-composition-chart';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 640] }));
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});
it('does not bridge an unknown month, and keyboard/tooltip/table mask the same literal EUR values', () => {
  const point = (asOf: string, value: number | null) =>
    projectAssetComposition({
      asOf,
      pointKind: 'month_end',
      totalCents: value,
      byAccount: { a: value },
      accounts: [
        {
          accountId: 'a',
          name: 'Synthetic account',
          type: 'checking',
          role: 'budget',
          referenceAccountId: null,
        },
      ],
      components: [
        {
          accountId: 'a',
          securityId: null,
          kind: 'cash',
          valueCents: value,
          quality: value === null ? 'missing' : 'exact',
          missing: value === null ? 'fx' : null,
        },
      ],
      securityKinds: new Map(),
    });
  const { container } = render(
    <AssetCompositionChart
      points={[point('2026-01-31', 10_000), point('2026-02-28', null), point('2026-03-31', 12_345)]}
    />,
  );
  expect(container.querySelectorAll('[data-composition-key] path')).toHaveLength(0);
  expect(container.querySelectorAll('.l-actual')).toHaveLength(0);
  expect(container.querySelectorAll('.dot-actual')).toHaveLength(2);
  const chart = screen.getByRole('group', { name: /Zusammensetzung des Nettovermögens/ });
  fireEvent.focus(chart);
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('Wert fehlt');
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('123,45 €');
  fireEvent.click(container.querySelector('.chart-data-table summary')!);
  expect(container.querySelector('.chart-data-table')?.textContent).toContain('123,45 €');
  act(() => setAmountsHidden(true));
  expect(screen.getByRole('status').textContent).not.toContain('123,45');
  expect(container.querySelector('.chart-data-table')?.textContent).not.toContain('123,45');
});
