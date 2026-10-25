// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskSourceSummary } from './task-source-summary';

afterEach(cleanup);
it('keeps receipt intake reachable before any unlinked receipt exists', () => {
  const select = vi.fn();
  render(
    <TaskSourceSummary
      counts={{ accounts: 0, plan: 0, receipts: 0, payslips: 0, other: 0 }}
      selected={undefined}
      onSelect={select}
    />,
  );
  const uploadSource = screen.getByRole('button', { name: 'Belege ohne Buchung öffnen' });
  expect((uploadSource as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(uploadSource);
  expect(select).toHaveBeenCalledExactlyOnceWith('receipts');
});
it('retains all five source rows with raw counts and opens the chosen source without counting rows as tasks', () => {
  const select = vi.fn();
  const { rerender } = render(
    <TaskSourceSummary
      counts={{ accounts: 3, plan: 9, receipts: 2, payslips: 1, other: 4 }}
      selected={undefined}
      onSelect={select}
    />,
  );
  expect(screen.getAllByRole('row')).toHaveLength(6);
  const plan = screen.getByRole('row', { name: 'Plan 9 Öffnen' });
  expect(within(plan).getByRole('cell', { name: '9' })).toBeTruthy();
  expect(within(plan).getByRole('button', { name: 'Plan öffnen' }).textContent).toBe('Öffnen');
  fireEvent.click(within(plan).getByRole('button', { name: 'Plan öffnen' }));
  expect(select).toHaveBeenCalledExactlyOnceWith('plan');
  rerender(
    <TaskSourceSummary
      counts={{ accounts: 3, plan: 9, receipts: 2, payslips: 1, other: 4 }}
      selected="plan"
      onSelect={select}
    />,
  );
  expect(screen.getByRole('button', { name: 'Plan schließen' }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(screen.getByRole('row', { name: 'Weitere Aufgaben 4 Öffnen' })).toBeTruthy();
});
