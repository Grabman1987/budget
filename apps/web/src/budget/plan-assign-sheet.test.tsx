// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { PlanAssignSheet } from './plan-assign-sheet';
import type { PlanRow } from './plan-model';

beforeAll(() => {
  // jsdom has no modal dialog support.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
});
afterEach(cleanup);

const row = {
  id: 'cat-1',
  name: 'Musterkategorie',
  assignedCents: 5000,
  activityCents: -1200,
  availableCents: 3800,
} as unknown as PlanRow;

function mount() {
  const onCommit = vi.fn();
  const onClose = vi.fn();
  const onDetails = vi.fn();
  render(
    <PlanAssignSheet
      row={row}
      tba={10000}
      onCommit={onCommit}
      onClose={onClose}
      onDetails={onDetails}
    />,
  );
  return { onCommit, onClose, onDetails };
}

it('starts with the current amount and a decimal keypad', () => {
  mount();
  const input = screen.getByLabelText('Neu zugewiesen') as HTMLInputElement;
  expect(input.value).toBe('50,00');
  expect(input.inputMode).toBe('decimal');
});

it('calculates in the field and assigns the result through onCommit', () => {
  const { onCommit, onClose } = mount();
  fireEvent.change(screen.getByLabelText('Neu zugewiesen'), { target: { value: '12,50+7,50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));
  expect(onCommit).toHaveBeenCalledWith(2000);
  expect(onClose).toHaveBeenCalled();
});

it('refuses an invalid amount and offers the details', () => {
  const { onCommit, onDetails } = mount();
  fireEvent.change(screen.getByLabelText('Neu zugewiesen'), { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));
  expect(onCommit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('nicht möglich');
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(onDetails).toHaveBeenCalled();
});
