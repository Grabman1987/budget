// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { budgetQuery } from '../budget/budget-api';
import { goalsQuery } from '../budget/goals-api';
import { AttentionBar, FundingNotes } from './attention-bar';
import type { Heute } from './api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    children,
    to,
    search,
    hash,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    to: string;
    search?: unknown;
    hash?: string;
  }) => (
    <a href={`${to}${hash ? `#${hash}` : ''}`} data-search={JSON.stringify(search)} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);

it('hides funded goals and labels current-only funding work in other months', () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const key = budgetQuery('2026-09').queryKey;
  client.setQueryData(key, { summary: { envelopes: [] } } as never);
  for (const month of ['2026-08', '2026-09'])
    client.setQueryData(goalsQuery(month).queryKey, { goals: [] } as never);
  const data = { stand: { today: '2026-09-17', month: '2026-08' } } as Heute;
  const { container, unmount } = render(
    <QueryClientProvider client={client}>
      <FundingNotes data={data} />
    </QueryClientProvider>,
  );
  expect(container.childElementCount).toBe(0);
  unmount();
  client.setQueryData(key, {
    summary: { envelopes: [{ categoryId: 'synthetic', target: {}, needCents: 100 }] },
  } as never);
  render(
    <QueryClientProvider client={client}>
      <FundingNotes data={data} />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Stand heute · 17.09.2026')).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: '1 Envelope-Ziele noch nicht finanziert' })
      .getAttribute('data-search'),
  ).toBe(JSON.stringify({ monat: '2026-09', ansicht: 'triage' }));
});
it('does not give an all-clear when rules lack inputs', () => {
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: { items: [] },
    attention: { inboxCount: 0, pendingCount: 0 },
    financeCheck: { actionRules: [], counts: { notEvaluated: 3 } },
  } as unknown as Heute;
  render(<AttentionBar data={data} />);
  expect(screen.queryByText('Keine offenen Aufgaben aus den Heute-Prüfungen.')).toBeNull();
});
it('summarizes overspending without duplicating cover actions, with neutral inbox and one rule action', async () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    kind: 'overspent' as const,
    urgent: true,
    categoryId: `e${i}`,
    categoryName: `Envelope ${i}`,
    cents: 100 + i,
    count: 1,
  }));
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: { items },
    attention: { inboxCount: 3, pendingCount: 2, pendingBefore: '2026-09-10' },
    financeCheck: {
      actionRules: [{ code: 'R07', name: 'Liquidität', valueText: 'Handlungsbedarf' }],
    },
  } as unknown as Heute;
  const { container } = render(<AttentionBar data={data} />);
  // The top-bar chip remains the only cover action; Today summarizes the source.
  expect(container.querySelectorAll('[data-overspent]')).toHaveLength(0);
  expect(screen.getByText('8 Kategorien überzogen')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Alle decken' })).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Handeln' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Handeln' }).getAttribute('href')).toBe(
    '/einstellungen/regelwerk#rule-result-R07',
  );
  expect(screen.getByRole('link', { name: 'Zuordnen' }).closest('.is-over')).toBeNull();
});

it('groups eight accounts and pending work into at most four source rows, urgent sources first', () => {
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: { items: [{ kind: 'overspent', categoryId: 'synthetic', count: 1 }] },
    accountReminders: Array.from({ length: 8 }, (_, i) => ({
      accountId: `synthetic-${i}`,
      accountName: `Prüfkonto ${i}`,
      days: 35,
      action: 'reconcile',
    })),
    attention: { inboxCount: 9, pendingCount: 2, pendingBefore: '2026-09-10' },
    financeCheck: { actionRules: [{ code: 'R07' }, { code: 'R02' }] },
  } as unknown as Heute;
  const { container } = render(<AttentionBar data={data} />);
  const rows = [...container.querySelectorAll('.attention-row')];
  expect(rows).toHaveLength(4);
  expect(rows[0]!.textContent).toContain('1 Kategorie überzogen');
  expect(rows[1]!.textContent).toContain('2 Regelbefunde');
  expect(rows[2]!.textContent).toContain('9 im Posteingang');
  expect(rows[3]!.textContent).toContain('8 Konten warten auf Prüfung');
  expect(screen.getByRole('link', { name: 'Prüfen' }).getAttribute('href')).toBe(
    '/konten/posteingang#account-reminder-title',
  );
  expect(screen.getByRole('link', { name: 'Bestätigen' }).getAttribute('data-search')).toBe(
    JSON.stringify({ status: 'pending', bis: '2026-09-10' }),
  );
  expect(screen.queryByRole('link', { name: 'Kontostand prüfen' })).toBeNull();
});

it('hides an empty task block without promising all rules were evaluated', () => {
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: { items: [] },
    accountReminders: [],
    attention: { inboxCount: 0, pendingCount: 0 },
    financeCheck: { actionRules: [], counts: { notEvaluated: 3 } },
  } as unknown as Heute;
  const { container } = render(<AttentionBar data={data} />);
  expect(container.childElementCount).toBe(0);
});

it('keeps savings proposals and their load failures in the review source even without other tasks', () => {
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: { items: [] },
    attention: { inboxCount: 0, pendingCount: 0 },
    financeCheck: { actionRules: [] },
  } as unknown as Heute;
  const onClick = vi.fn();
  const { container, rerender } = render(
    <AttentionBar
      data={data}
      savingsRows={[
        {
          id: 'synthetic-proposal',
          letter: 'A',
          title: 'Sparplan: Musterinstrument',
          detail: '100,00 €',
          action: { label: 'Ausführung prüfen', onClick },
        },
      ]}
    />,
  );
  expect(container.querySelectorAll('.attention-row')).toHaveLength(1);
  expect(screen.getByText('1 Sparplanausführung prüfen')).toBeTruthy();
  screen.getByRole('button', { name: 'Ausführung prüfen', hidden: true }).click();
  expect(onClick).toHaveBeenCalledOnce();
  rerender(<AttentionBar data={data} savingsError={<p>Vorschläge nicht verfügbar</p>} />);
  expect(screen.getByText('Vorschläge nicht verfügbar')).toBeTruthy();
  expect(container.querySelectorAll('.attention-row')).toHaveLength(1);
});

it('keeps month close in the Plan source rather than adding a separate next-steps block', () => {
  const data = {
    stand: { today: '2026-10-01' },
    nextSteps: { items: [] },
    accountReminders: [],
    attention: { inboxCount: 0, pendingCount: 0 },
    financeCheck: { actionRules: [] },
  } as unknown as Heute;
  const { container } = render(<AttentionBar data={data} />);
  expect(container.querySelectorAll('.attention-row')).toHaveLength(1);
  expect(
    screen.getByRole('link', { name: 'Monatsabschluss · September 2026' }).getAttribute('href'),
  ).toBe('/monatsabschluss/2026-09');
});

it('does not claim there are no open tasks when overspending is the only finding', () => {
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: {
      items: [
        {
          kind: 'overspent' as const,
          urgent: true,
          categoryId: 'rent',
          categoryName: 'Envelope rent',
          cents: 2_500,
          count: 1,
        },
      ],
    },
    attention: { inboxCount: 0, pendingCount: 0, pendingBefore: null },
    financeCheck: { actionRules: [] },
  } as unknown as Heute;

  render(<AttentionBar data={data} />);

  expect(screen.queryByText('Keine offenen Aufgaben aus den Heute-Prüfungen.')).toBeNull();
  const link = screen.getByRole('link', { name: 'Plan prüfen' });
  expect(link.getAttribute('href')).toBe('/plan/monat');
  expect(link.getAttribute('data-search')).toBe(
    JSON.stringify({ monat: '2026-09', ansicht: 'triage' }),
  );
  expect(link.textContent).not.toContain('25,00');
});
