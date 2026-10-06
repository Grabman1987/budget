// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttentionBar } from './attention-bar';
import type { Heute } from './api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#source">{children}</a>,
}));
afterEach(cleanup);
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
  expect(screen.getByRole('link', { name: 'Zuordnen' }).closest('.is-over')).toBeNull();
});
