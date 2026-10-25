// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Heute } from './api';
import { AttentionBar } from './attention-bar';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
afterEach(cleanup);

const data = {
  stand: { today: '2026-09-17' },
  nextSteps: { items: [] },
  attention: { inboxCount: 0, pendingCount: 0, loanTermsMissing: true },
  financeCheck: { actionRules: [] },
  accountReminders: [],
} as unknown as Heute;

it('shows one terms row linking to the account settings and drops it when terms are complete', () => {
  const { container, rerender } = render(<AttentionBar data={data} />);
  expect(container.querySelectorAll('.attention-row')).toHaveLength(1);
  const link = screen.getByRole('link', { name: 'Konditionen ergänzen' });
  expect(link.getAttribute('href')).toBe('/einstellungen/konten');
  rerender(
    <AttentionBar data={{ ...data, attention: { ...data.attention, loanTermsMissing: false } }} />,
  );
  expect(container.childElementCount).toBe(0);
});

it('adds the terms row next to the other to-dos without replacing them', () => {
  const { container } = render(
    <AttentionBar
      data={
        {
          ...data,
          nextSteps: { items: [{ kind: 'overspent' }] },
          attention: { inboxCount: 1, pendingCount: 0, loanTermsMissing: true },
          accountReminders: [{ accountId: 'synthetic' }],
        } as unknown as Heute
      }
    />,
  );
  expect(container.querySelectorAll('.attention-row')).toHaveLength(3);
  const accountRow = screen.getByRole('link', { name: 'Prüfen' }).closest('.attention-row');
  expect(accountRow).not.toBeNull();
  expect(accountRow?.contains(screen.getByRole('link', { name: 'Konditionen ergänzen' }))).toBe(
    true,
  );
  expect(accountRow?.textContent).toContain('1 Konto wartet auf Prüfung');
  expect(accountRow?.textContent).toContain('Kreditkonditionen fehlen');
  for (const name of ['Plan prüfen', 'Zuordnen', 'Prüfen', 'Konditionen ergänzen'])
    expect(screen.getByRole('link', { name })).toBeTruthy();
});
