// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Upcoming } from './upcoming-payments';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#source">{children}</a>,
}));

afterEach(cleanup);

it('labels envelope reserves without implying account coverage', () => {
  const payment = {
    occurrenceId: 'synthetic-occurrence',
    paymentId: 'synthetic-payment',
    name: 'Testzahlung',
    kind: 'outflow' as const,
    dueDate: '2026-10-05',
    status: 'expected' as const,
    amountCents: -5000,
    accountId: 'synthetic-overdrawn-account',
    accountName: 'Beispielkonto',
    contactName: null,
    categoryId: 'synthetic-envelope',
    categoryName: 'Miete',
    categoryClass: 'need' as const,
    covered: true,
  };
  render(
    <Upcoming
      id="upcoming-title"
      title="Anstehend · 14 Tage"
      items={[payment, { ...payment, paymentId: 'synthetic-unfunded', covered: false }]}
    />,
  );

  expect(screen.getByText('Budgetrücklage reicht')).toBeTruthy();
  expect(screen.getByText('Budgetrücklage reicht nicht')).toBeTruthy();
  expect(
    screen.getByText(
      'Die Budgetrücklage vergleicht nur das Verfügbar im Envelope mit der Zahlung. Kontostand und Überziehungsrahmen werden nicht geprüft.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('nicht gedeckt')).toBeNull();
});

it('keeps the existing empty-state treatment when there are no upcoming payments', () => {
  const { container } = render(<Upcoming id="upcoming-title" title="Anstehend" items={[]} />);

  expect(screen.getByText('Keine wiederkehrenden Zahlungen in diesem Zeitraum.')).toBeTruthy();
  expect(container.querySelector('.rev-empty')).toBeTruthy();
});
