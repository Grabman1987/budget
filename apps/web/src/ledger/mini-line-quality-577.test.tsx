// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MiniLine } from './mini-line';
import type { AccountSeriesDayQuality, SeriesPoint } from './types';

const points: SeriesPoint[] = [
  { date: '2026-10-01', balanceCents: 1000 },
  { date: '2026-10-02', balanceCents: 0 },
  { date: '2026-10-03', balanceCents: 3000 },
];
const known: AccountSeriesDayQuality = {
  source: 'native_cash',
  currency: 'USD',
  known: true,
  quality: 'exact',
  missing: null,
};
const quality = {
  '2026-10-01': known,
  '2026-10-02': { ...known, known: false, quality: 'missing', missing: 'fx' },
  '2026-10-03': known,
} satisfies Record<string, AccountSeriesDayQuality>;
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
});

it('does not bridge a missing day or present its legacy numeric zero as a known value', () => {
  const { container } = render(
    <MiniLine
      points={points}
      currency="USD"
      days={30}
      requireQuality
      quality={quality}
      label="Synthetic"
      table
    />,
  );
  expect(container.querySelectorAll('path.l-actual')).toHaveLength(0);
  expect(container.querySelectorAll('circle.dot-actual').length).toBeGreaterThanOrEqual(2);
  const chart = screen.getByRole('group', { name: 'Synthetic · Kontoverlauf der letzten 30 Tage' });
  fireEvent.focus(chart);
  expect(screen.getByRole('status').textContent).toContain('10,00');
  expect(screen.getByRole('status').textContent).toContain('Buchungssaldo (USD)');
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('Wechselkurs fehlt');
  expect(screen.getByRole('status').textContent).not.toContain('0,00');
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('30,00');
  const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', {
    hidden: true,
  });
  expect(
    rows.find(
      (row) => row.textContent?.includes('02.10.2026') && row.textContent.includes('Buchungssaldo'),
    )?.textContent,
  ).toContain('–');
  expect(
    rows.find(
      (row) => row.textContent?.includes('03.10.2026') && row.textContent.includes('Buchungssaldo'),
    )?.textContent,
  ).toContain('30,00');
});

it('fails closed for absent quality and distinguishes a genuine known zero from missing', () => {
  const { container, rerender } = render(
    <MiniLine points={points} currency="USD" days={30} requireQuality label="Synthetic" />,
  );
  expect(container.querySelectorAll('path.l-actual, circle.dot-actual')).toHaveLength(0);
  expect(screen.getByText('Nicht verfügbar')).toBeTruthy();
  const chart = screen.getByRole('group', { name: 'Synthetic · Kontoverlauf der letzten 30 Tage' });
  fireEvent.focus(chart);
  expect(screen.getByRole('status').textContent).toContain('Qualität nicht verfügbar');
  rerender(
    <MiniLine
      points={points}
      currency="USD"
      days={30}
      requireQuality
      label="Synthetic"
      quality={{ ...quality, '2026-10-02': known }}
    />,
  );
  fireEvent.keyDown(chart, { key: 'ArrowRight' });
  expect(screen.getByRole('status').textContent).toContain('0,00');
  expect(screen.getByRole('status').textContent).toContain('Bekannter Wert');
  expect(container.querySelectorAll('path.l-actual')).toHaveLength(1);
});

it('labels EUR holding value separately and masks literal tooltip/table amounts without changing them', () => {
  render(
    <MiniLine
      points={points}
      days={30}
      requireQuality
      label="Synthetic 123,45 EUR"
      quality={Object.fromEntries(
        points.map((point) => [
          point.date,
          { ...known, source: 'account_value_eur', currency: 'EUR' },
        ]),
      )}
      table
    />,
  );
  const chart = screen.getByRole('group', {
    name: 'Synthetic 123,45 EUR · Kontoverlauf der letzten 30 Tage',
  });
  fireEvent.focus(chart);
  expect(screen.getByRole('status').textContent).toContain('Kontowert inkl. Depot-Cash (EUR)');
  expect(screen.getByRole('status').textContent).toContain('10,00 €');
  act(() => setAmountsHidden(true));
  expect(chart.getAttribute('aria-label')).not.toContain('123,45');
  expect(screen.getByRole('status').textContent).not.toContain('10,00');
  expect(screen.getByRole('table', { hidden: true }).textContent).not.toContain('30,00');
  act(() => setAmountsHidden(false));
  expect(screen.getByRole('status').textContent).toContain('10,00 €');
  expect(screen.getByRole('table', { hidden: true }).textContent).toContain('30,00 €');
});
