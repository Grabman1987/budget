// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Upcoming } from './upcoming-payments';
import type { HeuteOccurrence } from './api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
afterEach(cleanup);

const occurrence: HeuteOccurrence = {
  occurrenceId: 'synthetic-occurrence',
  paymentId: 'synthetic-payment',
  name: 'Testzahlung',
  kind: 'outflow',
  dueDate: '2026-10-05',
  status: 'expected',
  amountCents: -5000,
  accountId: null,
  accountName: null,
  contactName: null,
  categoryId: null,
  categoryName: null,
  categoryClass: null,
  covered: null,
};

it('opens the tapped due occurrence through a named button', () => {
  const open = vi.fn();
  render(<Upcoming id="due" title="Fällig 14 Tage" items={[occurrence]} onOpenOccurrence={open} />);
  fireEvent.click(screen.getByRole('button', { name: /Testzahlung · fällig .* · öffnen/ }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(occurrence);
});

it('keeps rows read-only when no opener is given', () => {
  render(<Upcoming id="due" title="Fällig 14 Tage" items={[occurrence]} />);
  expect(screen.queryByRole('button', { name: /öffnen/ })).toBeNull();
  expect(screen.getByText('Testzahlung')).toBeTruthy();
});
