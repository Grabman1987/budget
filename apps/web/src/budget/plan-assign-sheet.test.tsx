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

it('Escape closes without assigning', () => {
  const { onCommit, onClose } = mount();
  const dialog = document.querySelector('dialog')!;
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
});

it('refuses a negative amount that would lower the assignment below zero', () => {
  const { onCommit } = mount();
  const input = screen.getByLabelText('Neu zugewiesen');
  fireEvent.change(input, { target: { value: '5' } });
  fireEvent.change(input, { target: { value: '-5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));
  expect(onCommit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('treats a leading + typed first as relative, like the inline cell', () => {
  const { onCommit } = mount();
  fireEvent.change(screen.getByLabelText('Neu zugewiesen'), { target: { value: '+20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zuweisen' }));
  expect(onCommit).toHaveBeenCalledWith(7000);
});

it('Enter in the amount field assigns a complete amount', () => {
  const { onCommit } = mount();
  const input = screen.getByLabelText('Neu zugewiesen');
  fireEvent.change(input, { target: { value: '30' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onCommit).toHaveBeenCalledWith(3000);
});

it('takes the suggestion into the field', () => {
  const onCommit = vi.fn();
  const empty = {
    ...row,
    assignedCents: 0,
    quickAssign: { ghostCents: 4200, ghostSource: 'target', historyMonths: [] },
  } as unknown as PlanRow;
  render(
    <PlanAssignSheet
      row={empty}
      tba={10000}
      onCommit={onCommit}
      onClose={vi.fn()}
      onDetails={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Vorschlag/ }));
  expect((screen.getByLabelText('Neu zugewiesen') as HTMLInputElement).value).toBe('42,00');
});

it('returns focus to the opener on unmount', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const view = render(
    <PlanAssignSheet row={row} tba={0} onCommit={vi.fn()} onClose={vi.fn()} onDetails={vi.fn()} />,
  );
  view.unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
