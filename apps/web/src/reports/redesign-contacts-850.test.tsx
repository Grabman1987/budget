// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContactForgivenessAction, contactCalculation } from './contact-report-redesign';
afterEach(cleanup);
it('ON exposes only positive-current-debt forgiveness; credit, zero and missing balances have no write action', () => {
  const open = vi.fn();
  for (const balance of [-5000, 0, undefined]) {
    render(<ContactForgivenessAction balance={balance} ready onOpen={open} />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
  }
  const { rerender } = render(
    <ContactForgivenessAction balance={5000} ready={false} onOpen={open} />,
  );
  const action = screen.getByRole('button', { name: 'Schulden erlassen' }) as HTMLButtonElement;
  expect(action.disabled).toBe(true);
  fireEvent.click(action);
  expect(open).not.toHaveBeenCalled();
  rerender(<ContactForgivenessAction balance={5000} ready onOpen={open} />);
  fireEvent.click(action);
  expect(open).toHaveBeenCalledTimes(1);
});
it('ON frame receives the original independent receivable, payable and net cents', () => {
  const calc = contactCalculation({
    asOf: '2026-10-02',
    currency: 'EUR',
    contacts: [],
    totals: { receivableCents: 5000, payableCents: 2000, balanceCents: 3000 },
  });
  expect(calc.terms.map((term) => [term.label, term.value, term.op])).toEqual([
    ['Wir bekommen', 5000, undefined],
    ['Wir schulden', 2000, '-'],
  ]);
  expect(calc.result).toEqual({ label: 'Offener Kontaktsaldo', value: 3000, unit: 'money' });
});
