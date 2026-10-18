// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NetWorthView } from './api';
import { NetWorthChart } from './networth-chart';
import { chainTerms } from './networth-model';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 640] }));

const view = {
  period: '1M',
  from: '2026-01-01',
  to: '2026-01-03',
  daily: [
    { date: '2026-01-01', netWorthCents: 1_000_000 },
    { date: '2026-01-02', netWorthCents: 990_000 },
    { date: '2026-01-03', netWorthCents: 980_000 },
  ],
  bars: {
    unit: 'month',
    buckets: [{ from: '2026-01-01', to: '2026-01-03', ownCents: -30_000, marketCents: 10_000 }],
  },
} as unknown as NetWorthView;

describe('Nettovermögen: Gespart and orange negatives (#549)', () => {
  it('draws a negative Gespart month in the orange token, never the red one', () => {
    const { container } = render(<NetWorthChart view={view} periodLabel="letzter Monat" />);
    expect(container.querySelector('.bar-neg2')).not.toBeNull();
    fireEvent.focus(screen.getByRole('group', { name: /Gespart/ }));
    const tooltip = screen.getByRole('status');
    expect(tooltip.textContent).toContain('Gespart');
    expect(tooltip.textContent).not.toContain('Eigenleistung');
    const fills = [...tooltip.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
    expect(fills).toContain('var(--minus-ink)');
    expect(fills).not.toContain('var(--red)');
  });

  it('names the chain term Gespart and keeps Anfang + Gespart + Markt = jetzt', () => {
    const terms = chainTerms(
      { startCents: 7_000_000, ownCents: -500_000, marketCents: 200_000, nowCents: 6_700_000 },
      '2025-12-31',
    );
    expect(terms.map((t) => t.label)).toEqual(['Anfang Dez 2025', 'Gespart', 'Markt', 'jetzt']);
    expect(terms[1]).toMatchObject({ value: 500_000, op: '-' });
  });
});
