// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { projectAssetComposition, type AssetCompositionPoint } from '@budget/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetComposition } from './asset-composition';
import { AssetCompositionChart } from './asset-composition-chart';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 640] }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(() => setAmountsHidden(false));
function point(asOf = '2026-02-28'): AssetCompositionPoint {
  return projectAssetComposition({
    asOf,
    pointKind: 'as_of',
    totalCents: 800000,
    byAccount: { bank: 1000000, loan: -200000 },
    accounts: [
      {
        accountId: 'bank',
        name: 'Bank 10.000 EUR',
        type: 'checking',
        role: 'budget',
        referenceAccountId: null,
      },
      { accountId: 'loan', name: 'Kredit', type: 'loan', role: 'debt', referenceAccountId: null },
    ],
    securityKinds: new Map(),
    components: [
      {
        accountId: 'bank',
        securityId: null,
        kind: 'cash',
        valueCents: 1000000,
        quality: 'exact',
        missing: null,
      },
      {
        accountId: 'loan',
        securityId: null,
        kind: 'cash',
        valueCents: -200000,
        quality: 'exact',
        missing: null,
      },
    ],
  });
}

describe('asset composition presentation #550/#551', () => {
  it('drills down to exact signed account contributions and switches to authoritative whole accounts', () => {
    render(<AssetComposition point={point()} />);
    const cash = screen.getByText('Konten & Bargeld').closest('details')!;
    expect(cash.querySelector('summary')?.textContent).toContain('10.000,00');
    expect(cash.querySelector('summary')?.textContent).toContain('125,0 %');
    fireEvent.click(cash.querySelector('summary')!);
    expect(within(cash).getByRole('link', { name: 'Bank 10.000 EUR' }).getAttribute('href')).toBe(
      '/konten/bank',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nach Konto' }));
    const rows = within(
      screen.getByRole('table', { name: 'Ganze Kontowerte am gewählten Stichtag' }),
    ).getAllByRole('row');
    expect(rows[1]?.textContent).toContain('10.000,00');
    expect(rows[2]?.textContent).toContain('−2.000,00');
    expect(rows[2]?.textContent).toContain('−25,0 %');
  });

  it('retains legacy account ordering: assets descending, then signed debts ascending and gaps last', () => {
    const value = point();
    value.accounts = [
      value.accounts[1]!,
      { ...value.accounts[0]!, accountId: 'gap', name: 'Fehlt', valueCents: null },
      { ...value.accounts[0]!, accountId: 'small', name: 'Klein', valueCents: 500000 },
      { ...value.accounts[1]!, accountId: 'large-debt', name: 'Große Schuld', valueCents: -300000 },
      value.accounts[0]!,
    ];
    render(<AssetComposition point={value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nach Konto' }));
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Bank 10.000 EUR',
      'Klein',
      'Große Schuld',
      'Kredit',
      'Fehlt',
    ]);
  });

  it('reactively masks money-bearing names, amounts and shares in list and chart inspection/table', () => {
    const { container } = render(
      <>
        <AssetComposition point={point()} />
        <AssetCompositionChart points={[point()]} />
      </>,
    );
    fireEvent.focus(container.querySelector('.chart-interactive')!);
    fireEvent.click(screen.getByText('Tabelle anzeigen'));
    expect(screen.getByRole('status').textContent).toContain('125,0 %');
    act(() => setAmountsHidden(true));
    expect(container.textContent).not.toContain('10.000');
    expect(container.textContent).not.toContain('2.000');
    expect(container.textContent).not.toContain('125,0');
    expect(container.textContent).not.toContain('−25,0');
    expect(screen.getByRole('status').textContent).not.toContain('125,0');
    expect(container.textContent).toContain('•••');
    act(() => setAmountsHidden(false));
    expect(screen.getByRole('status').textContent).toContain('125,0 %');
  });

  it('uses identical literal values for keyboard inspection and the accessible history table', () => {
    const { container } = render(<AssetCompositionChart points={[point('2026-01-31'), point()]} />);
    fireEvent.focus(container.querySelector('.chart-interactive')!);
    fireEvent.keyDown(container.querySelector('.chart-interactive')!, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('28.02.2026');
    const tooltipValues = [
      ...screen.getByRole('status').querySelectorAll('.chart-tooltip-row strong'),
    ].map((e) => e.textContent);
    fireEvent.click(screen.getByText('Tabelle anzeigen'));
    const debtRows = screen.getAllByRole('row').filter((r) => r.textContent?.includes('Schulden'));
    expect(debtRows[1]?.textContent).toContain('−2.000,00');
    expect(debtRows[1]?.textContent).toContain('−25,0 %');
    expect(tooltipValues.length).toBeGreaterThan(0);
    for (const value of tooltipValues)
      expect(container.querySelector('.chart-data-table')?.textContent).toContain(value);
    expect(container.textContent).toContain('Historische Werte sind nach der heutigen');
  });

  it('breaks areas and net-source segments at missing monthly values', () => {
    const missing = point('2026-02-28');
    missing.totalCents = null;
    missing.complete = false;
    missing.groups[0]!.valueCents = null;
    const { container } = render(
      <AssetCompositionChart points={[point('2026-01-31'), missing, point('2026-03-31')]} />,
    );
    const svg = screen.getByTestId('asset-composition-chart');
    expect(svg.querySelectorAll('path')).toHaveLength(0);
    expect(svg.querySelectorAll('line.l-actual')).toHaveLength(0);
    expect(svg.querySelectorAll('circle.dot-actual')).toHaveLength(2);
    fireEvent.focus(container.querySelector('.chart-interactive')!);
    fireEvent.keyDown(container.querySelector('.chart-interactive')!, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('Wert fehlt');
  });

  it('keeps the final anchor label clear of a nearby month end without moving any data point', () => {
    render(
      <AssetCompositionChart
        points={[point('2026-01-31'), point('2026-02-28'), point('2026-03-01')]}
      />,
    );
    const svg = screen.getByTestId('asset-composition-chart');
    const labels = [...svg.querySelectorAll('text[y="314"]')];
    expect(labels).toHaveLength(2);
    expect(svg.querySelectorAll('circle.dot-actual')).toHaveLength(3);
    expect(labels[0]?.textContent).toContain('Jän');
    expect(labels[1]?.textContent).toContain('Mär');
  });

  it('draws debts below the shared zero axis with an unfilled dashed outline', () => {
    render(<AssetCompositionChart points={[point('2026-01-31'), point()]} />);
    const svg = screen.getByTestId('asset-composition-chart');
    expect([...svg.querySelectorAll('text')].map((node) => node.textContent)).not.toContain('-0');
    const debt = svg.querySelector('path[stroke="var(--ink-2)"]')!;
    expect(debt.getAttribute('fill')).toBe('none');
    expect(debt.getAttribute('stroke-dasharray')).toBe('7 5');
    const coordinates = debt
      .getAttribute('d')!
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    // First two y values delimit zero and negative debt in screen coordinates.
    expect(coordinates[3]).toBeGreaterThan(coordinates[1]!);
  });
});
