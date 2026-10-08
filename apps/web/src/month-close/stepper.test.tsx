// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { closeSteps } from '@budget/domain';
import { CloseStepper } from './stepper';
afterEach(cleanup);
it('shows five statuses, exposes the current step and supports keyboard navigation', async () => {
  const onSelect = vi.fn();
  render(
    <CloseStepper
      steps={closeSteps([{ step: 2, id: 'a', fingerprint: 'v' }], [])}
      current={2}
      onSelect={onSelect}
    />,
  );
  const navigation = screen.getByRole('navigation', { name: 'Monatsabschluss' });
  expect(within(navigation).getAllByRole('listitem')).toHaveLength(5);
  expect(
    screen
      .getByRole('button', { name: /2.*Konten abgleichen.*offen/ })
      .getAttribute('aria-current'),
  ).toBe('step');
  expect(screen.getAllByText('folgt')).toHaveLength(2);
  const button = screen.getByRole('button', { name: /1.*Posteingang leeren/ });
  button.focus();
  await userEvent.keyboard('{Enter}');
  expect(onSelect).toHaveBeenCalledWith(1);
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('2');
});
