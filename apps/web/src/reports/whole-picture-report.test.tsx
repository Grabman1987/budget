// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { WholePicture } from '@budget/db';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { WholePictureVerdict, WholeChart } from './whole-picture-report';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [undefined, 800] }));

afterEach(cleanup);
const row: WholePicture['totals'] = {
  month: '2026-09',
  incomeCents: 200000,
  capitalCents: 1000,
  needCents: 68000,
  wantCents: 20000,
  savedCents: 112000,
  savingsRateBp: 5600,
  investmentsInCents: 50000,
  marketCents: -34000,
  principalCents: 10000,
  startCents: 1000000,
  endCents: 1078000,
  deltaCents: 78000,
  otherCents: 0,
};
it('explains the latest full month with signed market verdict and estimated marker', () => {
  render(<WholePictureVerdict row={row} estimated />);
  const text = screen.getByTestId('whole-verdict').textContent?.replace(/\s+/g, ' ');
  // Market sentence plus the rest of the old line: saved amount and net-worth change.
  expect(text).toContain('340 €');
  expect(text).toContain('· Gespart +1.120 € · Nettovermögen +780 € · vorläufig');
  expect(text).not.toMatch(/Markt .*· Markt/);
});
it('shows a positive and neutral market without colour as the only signal', () => {
  const { rerender } = render(<WholePictureVerdict row={{ ...row, marketCents: 1 }} />);
  expect(screen.getByTestId('whole-verdict').textContent).toMatch(/Markt|Marktbewegung/);
  expect(screen.getByTestId('whole-verdict').textContent).toContain('0,01 €');
  rerender(<WholePictureVerdict row={{ ...row, marketCents: 0 }} />);
  expect(screen.getByTestId('whole-verdict').textContent).toContain('1.120 €');
});

it.each([
  { ends: [99000], expected: '≈990,00 €' },
  { ends: [99000, 99001], expected: '≈990,01 €' },
])('renders flat/narrow integer-cent chart data $ends without passing fractional ticks to the money guard', ({ ends, expected }) => {
  const rows = ends.map((endCents, index) => ({
    ...row,
    month: index === 0 ? '2026-08' : '2026-09',
    endCents,
    savedCents: 0,
    marketCents: 0,
  }));
  const data: WholePicture & WithValuationNotes = {
    period: '2026-08..2026-09',
    asOf: '2026-09-30',
    today: '2026-10-01',
    from: '2026-07-31',
    to: '2026-09-30',
    rows,
    totals: rows.at(-1)!,
    latestFullMonth: rows.at(-1)!,
    incomplete: [{ securityId: 'synthetic', quality: 'estimated', from: '2026-08-01', to: '2026-09-30' }],
  };
  const { container } = render(<WholeChart data={data} />);
  const drawing = screen.getByTestId('whole-chart');
  expect(drawing.getAttribute('width')).toBe('800');
  const line = drawing.querySelector('path.l-actual')!;
  expect(line.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  if (ends.length === 1) expect(line.getAttribute('d')).toBe('M422,115Z');
  const chart = screen.getByRole('group', { name: 'Monatlicher Sparbetrag und Markteffekt mit Nettovermögen' });
  fireEvent.focus(chart);
  if (ends.length === 2) fireEvent.keyDown(chart, { key: 'ArrowRight' });
  const value = Array.from(document.querySelectorAll('.chart-tooltip-row')).find((element) =>
    element.querySelector('span')?.textContent === 'Nettovermögen Ende',
  )?.querySelector('strong');
  expect(value?.textContent).toBe(expected);
  expect(data.rows.map((point) => point.endCents)).toEqual(ends);
  expect(container.querySelectorAll('svg[data-testid="whole-chart"]')).toHaveLength(1);
});
