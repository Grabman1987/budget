// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Upcoming } from './upcoming-payments';

it('shows planned one-off dates and signed cents with navigation to the year plan', () => {
  render(
    <Upcoming
      id="upcoming"
      title="Was steht an?"
      items={[]}
      events={[
        {
          eventId: 'synthetic-event',
          name: 'Testereignis',
          date: '2026-10-22',
          amountCents: -12345,
          categoryId: null,
        },
      ]}
    />,
  );
  expect(screen.getByText('Testereignis')).toBeTruthy();
  expect(screen.getByText('22.10.')).toBeTruthy();
  expect(screen.getByRole('link', { name: /123,45/ }).getAttribute('href')).toBe(
    '/plan/jahr?ereignis=synthetic-event',
  );
  expect(screen.getByText('Geplantes Einmalereignis')).toBeTruthy();
  expect(screen.queryByText('Keine wiederkehrenden Zahlungen in diesem Zeitraum.')).toBeNull();
});

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    children,
    to,
    search,
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, unknown>;
  }) => (
    <a
      href={`${to}${search ? `?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : ''}`}
    >
      {children}
    </a>
  ),
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
  expect(screen.getAllByRole('link', { name: /Beispielkonto/ })[0]?.getAttribute('href')).toContain(
    '/konten/synthetic-overdrawn-account?',
  );
  expect(screen.getAllByRole('link', { name: /Beispielkonto/ })[0]?.getAttribute('href')).toContain(
    'faellig=2026-10-05',
  );
});

it('hides the whole due block when neither payments nor events are due', () => {
  const { container } = render(<Upcoming id="upcoming-title" title="Anstehend" items={[]} />);

  expect(screen.queryByRole('heading', { name: 'Anstehend' })).toBeNull();
  expect(container.childElementCount).toBe(0);
});
