// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type { RegisterMonth } from '@budget/domain';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { MonthSums } from './booking-table';
import { RegisterSummary } from './register-summary';

const months: RegisterMonth[] = [
  { month: '2026-10', count: 2, cents: 2400, cumulativeCents: 101_900 },
  { month: '2026-09', count: 1, cents: -500, cumulativeCents: 99_500 },
];
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => act(() => setAmountsHidden(false)));

it('shows the net change and the month-end balance for a whole account', () => {
  const { container } = render(<MonthSums row={months[0]} kind="balance" />);
  expect(container.textContent).toContain('Monat 24,00 €');
  expect(container.textContent).toContain('Saldo Monatsende 1.019,00 €');
  expect(container.textContent).toContain('2 Buchungen');
});

it('labels filtered and multi-account sums and never shows a balance for them', () => {
  const filtered = render(
    <MonthSums row={{ ...months[1]!, cumulativeCents: null }} kind="filtered" />,
  );
  expect(filtered.container.textContent).toContain('Monat gefiltert −5,00 €');
  expect(filtered.container.textContent).not.toContain('Saldo');
  filtered.unmount();
  const rows = render(<MonthSums row={months[1]} kind="rows" />);
  expect(rows.container.textContent).toContain('Monat (angezeigt)');
  expect(rows.container.textContent).not.toContain('Saldo');
});

it('masks month sums and the balance when amounts are hidden', () => {
  act(() => setAmountsHidden(true));
  const { container } = render(<MonthSums row={months[0]} kind="balance" />);
  expect(container.textContent).not.toMatch(/\d\.\d{3}|2\.400|101\.900/);
  expect(container.textContent).toContain('•••');
});

it('summary KPIs and the table fallback honour the mask and include the balance column', () => {
  const view = render(
    <RegisterSummary months={months} kind="balance" today="2026-10-15" pending={false} />,
  );
  expect(view.container.textContent).toContain('Saldo Monatsende');
  expect(view.container.textContent).toContain('1.019,00 €');
  act(() => setAmountsHidden(true));
  expect(view.container.textContent).not.toMatch(/\d\.\d{3},\d{2}/);
  expect(screen.getByText('Beträge ausgeblendet')).toBeTruthy();
});

it('anchors the window at today: a month without bookings still appears', () => {
  const { container } = render(
    <RegisterSummary months={months} kind="filtered" today="2026-11-20" pending={false} />,
  );
  expect(container.textContent).toContain('2026-11');
  expect(container.textContent).toContain('gefiltert');
  expect(container.textContent).not.toContain('Saldo Monatsende');
});
