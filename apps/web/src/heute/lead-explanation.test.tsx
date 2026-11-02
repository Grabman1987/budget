// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { occurrencesQuery } from '../expected/api';
import { LeadExplanation } from './lead-explanation';
import { heuteReturn } from './return-context';
import type { Heute } from './api';

const href = '/heute/details/free?monat=2026-08&period=payday';
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({ select }: { select: (location: { href: string }) => unknown }) =>
    select({ href }),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
  }) => <a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>,
}));
afterEach(cleanup);

it.each(['occurrence', 'payment|2026-09-20'])(
  'uses exact canonical terms and %s source identity, keeping current-source and viewed-month scopes distinct',
  (identity) => {
    const data = {
      stand: {
        today: '2026-09-17',
        month: '2026-08',
        period: 'payday',
        payday: { day: '2026-09-30' },
      },
      lead: {
        needCents: 1001,
        wantCents: 202,
        openCents: 103,
        freeCents: 1100,
        // Older API responses round their overview chain; the full explanation must retain cents.
        chain: [{ label: 'Bedarf', value: 1000 }],
        items: {
          need: [{ id: 'need', name: 'Synthetic need', availableCents: 1001 }],
          want: [{ id: 'want', name: 'Synthetic want', availableCents: 202 }],
          open: [{ id: identity, label: 'Synthetic payment', day: '2026-09-20', cents: 103 }],
        },
      },
    } as unknown as Heute;
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    client.setQueryData(occurrencesQuery('2026-09-20', '2026-09-30').queryKey, [
      {
        occurrenceId: 'occurrence',
        paymentId: 'payment',
        dueDate: '2026-09-20',
        name: 'Synthetic payment',
        kind: 'outflow',
        status: 'expected',
        amountCents: -103,
        currency: 'EUR',
        contactShareCents: 0,
        accountId: null,
        accountName: null,
        payeeId: null,
        payeeName: null,
        contactId: null,
        contactName: null,
        categoryId: null,
        categoryName: null,
        categoryClass: null,
        incomeTypeId: null,
        incomeTypeName: null,
        bookingId: null,
        bookedAmountCents: null,
        suggestion: null,
      },
    ]);
    const view = render(
      <QueryClientProvider client={client}>
        <LeadExplanation data={data} />
      </QueryClientProvider>,
    );
    expect(view.container.textContent).toContain('10,01 €');
    expect(view.container.textContent).toContain('2,02 €');
    expect(view.container.textContent).toContain('1,03 €');
    expect(view.container.textContent).toContain('11,00 €');
    expect(view.container.textContent).toContain('17.09.2026');
    const need = within(screen.getByRole('region', { name: 'Bedarf' })).getByRole('link');
    const target = new URL(need.getAttribute('href')!, 'https://budget.invalid');
    expect(target.pathname).toBe('/plan/monat/envelope/need');
    expect(target.searchParams.get('monat')).toBe('2026-09');
    expect(target.searchParams.get('von')).toBe(href);
    expect(screen.getByRole('link', { name: /Synthetic payment/ }).getAttribute('href')).toContain(
      '/plan/erwartet/payment?',
    );
    client.clear();
  },
);

it('keeps valid Heute contexts and rejects external, control and unrelated return targets', () => {
  expect(heuteReturn(href)).toBe(href);
  expect(heuteReturn('/?monat=2026-09&period=month')).toBe('/?monat=2026-09&period=month');
  for (const value of [
    'https://example.invalid',
    '//example.invalid',
    '/\\example.invalid',
    '/heute/details/free\n',
    '/konten',
    '/heute/details/unknown',
    '/'.repeat(1600),
  ]) {
    expect(heuteReturn(value)).toBeUndefined();
  }
});
