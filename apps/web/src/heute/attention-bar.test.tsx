// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttentionBar } from './attention-bar';
import type { Heute } from './api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#source">{children}</a>,
}));
afterEach(cleanup);
it('renders each overspending once, top two first, neutral inbox and a single action per finding', async () => {
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
  expect(container.querySelectorAll('[data-overspent]')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'weitere 6' }));
  for (const item of items)
    expect(container.querySelectorAll(`[data-overspent="${item.categoryId}"]`)).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Alle decken' })).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Handeln' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Zuordnen' }).closest('.is-over')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Weniger zeigen' }));
  expect(container.querySelectorAll('[data-overspent]')).toHaveLength(2);
});
