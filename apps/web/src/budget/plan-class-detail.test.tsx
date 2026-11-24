// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PlanClassDetail } from './plan-presentation';

afterEach(cleanup);

const rows = [
  { id: 'a', name: 'Miete', assignedCents: 100_000, activityCents: -100_000 },
  { id: 'b', name: 'Haushalt', assignedCents: 0, activityCents: -20_000 },
  { id: 'c', name: 'Leer', assignedCents: 0, activityCents: 0 },
  { id: 'd', name: 'Lebensmittel', assignedCents: 40_000, activityCents: -45_000 },
];

it('lists the class categories by assignment and states the gap above the income target', () => {
  render(<PlanClassDetail label="Bedarf" target={50} incomeCents={200_000} rows={rows} />);
  const names = screen.getAllByRole('rowheader').map((c) => c.textContent);
  expect(names).toEqual(['Miete', 'Lebensmittel', 'Haushalt']);
  // 1.400 € assigned vs. 50 % of 2.000 € = 1.000 € → 400 € above.
  expect(screen.getByText(/über dem Ziel/).textContent).toMatch(/400,00.*1\.000,00.*50 %/);
  expect(screen.getAllByRole('row')[1]!.textContent).toContain('50 %');
});

it('says how much is left when below the target and has no target without income', () => {
  render(<PlanClassDetail label="Zukunft" target={20} incomeCents={200_000} rows={[]} />);
  expect(screen.getByText(/noch .* bis zum Ziel/)).toBeTruthy();
  expect(screen.getByText(/Keine Kategorie/)).toBeTruthy();
  cleanup();
  render(<PlanClassDetail label="Wunsch" target={30} incomeCents={0} rows={rows} />);
  expect(screen.getByText(/ohne Einnahmen kein Zielwert/)).toBeTruthy();
});
