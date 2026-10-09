// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttentionBar } from './attention-bar';
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
it('keeps overspending out of the bar, with neutral inbox and a single action per finding', async () => {
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
  // Overspending lives in the top-bar chip now, not in this bar.
  expect(container.querySelectorAll('[data-overspent]')).toHaveLength(0);
  expect(container.textContent).not.toContain('überzogen');
  expect(screen.queryByRole('link', { name: 'Alle decken' })).toBeNull();
  expect(screen.getAllByRole('link', { name: 'Handeln' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Handeln' }).getAttribute('href')).toBe(
    '/einstellungen/regelwerk#rule-result-R07',
  );
  expect(screen.getByRole('link', { name: 'Zuordnen' }).closest('.is-over')).toBeNull();
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
