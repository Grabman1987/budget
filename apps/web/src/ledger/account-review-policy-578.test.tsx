// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import type { AccountReviewStatus } from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { accountCheck } from './overview-model';
import type { AccountRow } from './types';
import { AccountReminderRows } from '../heute/account-reminders';
import { AttentionBar } from '../heute/attention-bar';
import type { AccountReminder, Heute } from '../heute/api';
import { FuturePreviewSetting } from '../pages/future-preview-setting';

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    children,
    to,
    hash,
    search,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    to: string;
    hash?: string;
    search?: unknown;
  }) => (
    <a {...rest} href={`${to}${hash ? `#${hash}` : ''}`} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const checked: AccountReviewStatus = {
  state: 'checked',
  policy: '14-days',
  supported: true,
  checkedOn: '2026-01-31',
  dueOn: '2026-02-14',
  days: 229,
  action: 'reconcile',
};
function row(type: AccountRow['type'], reviewStatus?: AccountReviewStatus) {
  return {
    type,
    lastReconciledOn: '2026-01-31',
    lastValuedOn: '2026-01-31',
    reviewStatus,
  } as AccountRow;
}

it('uses authoritative activity-aware state rather than aging the displayed check date in the browser', () => {
  expect(accountCheck(row('checking', checked))).toEqual({
    text: 'geprüft am 31.01.2026',
    stale: false,
    state: 'checked',
  });
  expect(accountCheck(row('checking', { ...checked, state: 'due' }))).toEqual({
    text: 'Fällig · geprüft am 31.01.2026',
    stale: true,
    state: 'due',
  });
  expect(
    accountCheck(row('p2p', { ...checked, policy: 'calendar-month', action: 'value' })),
  ).toEqual({ text: 'Wert vom 31.01.2026', stale: false, state: 'checked' });
  expect(accountCheck(row('checking', { ...checked, state: 'due', checkedOn: null }))).toEqual({
    text: 'Fällig · nie geprüft',
    stale: true,
    state: 'due',
  });
  expect(accountCheck(row('checking'))).toEqual({
    text: 'Prüfstatus nicht verfügbar',
    stale: false,
    state: 'unavailable',
  });
});

it('shows exactly one Heute source row for the reminder array, retaining both existing check destinations', () => {
  const reminders: AccountReminder[] = [
    {
      accountId: 'budget',
      accountName: 'Synthetic budget',
      days: 14,
      action: 'reconcile',
      dueOn: '2026-09-17',
    },
    {
      accountId: 'manual',
      accountName: 'Synthetic manual',
      days: 31,
      action: 'value',
      dueOn: '2026-09-17',
    },
  ];
  const data = {
    stand: { today: '2026-09-17' },
    nextSteps: { items: [] },
    accountReminders: reminders,
    attention: { inboxCount: 0, pendingCount: 0 },
    financeCheck: { actionRules: [] },
  } as unknown as Heute;
  const { container, rerender } = render(
    <>
      <AttentionBar data={data} />
      <AccountReminderRows items={reminders} />
    </>,
  );
  expect(container.querySelectorAll('.attention-row')).toHaveLength(1);
  expect(screen.getByText('2 Konten warten auf Prüfung')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Prüfen' }).getAttribute('href')).toBe(
    '/konten/pruefen#account-reminder-title',
  );
  expect(container.querySelectorAll('.account-reminder')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Kontostand prüfen' }).getAttribute('href')).toBe(
    '/konten/budget',
  );
  expect(screen.getByRole('link', { name: 'Wert aktualisieren' }).getAttribute('data-search')).toBe(
    JSON.stringify({ pruefen: 'value' }),
  );
  expect(container.querySelector('.account-reminder')?.textContent).toContain(
    'Prüfung fällig seit 17.09.2026',
  );
  rerender(<AttentionBar data={{ ...data, accountReminders: [] }} />);
  expect(container.querySelectorAll('.attention-row')).toHaveLength(0);
});

it('explains fixed covered rules without fetching or overwriting the compatible legacy setting', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<FuturePreviewSetting reminder />);
  const setting = screen.getByRole('region', { name: 'Kontoprüfung · Erinnerung' });
  expect(setting.textContent).toContain('Budget-Konten und Kreditkarten: nach 14 Tagen.');
  expect(setting.textContent).toContain('Kredite und Investments: nach einem Kalendermonat.');
  expect(setting.textContent).toContain(
    'Ohne neue Buchungen seit der Prüfung bleibt ein Konto geprüft.',
  );
  expect(within(setting).queryByRole('spinbutton')).toBeNull();
  expect(within(setting).queryByRole('button', { name: 'Speichern' })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('retains the independent future-preview editor and its undo without changing the legacy reminder payload', async () => {
  let preview = 35;
  const payloads: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      if (init.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { futurePreviewDays: number };
        payloads.push(body);
        preview = body.futurePreviewDays;
        return new Response(JSON.stringify({ groupId: 'synthetic-preview' }));
      }
      if (path === '/api/undo') {
        preview = 35;
        return new Response(JSON.stringify({ groupId: 'synthetic-undo' }));
      }
      return new Response(JSON.stringify({ futurePreviewDays: preview, accountReminderDays: 80 }));
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <FuturePreviewSetting />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const input = await screen.findByLabelText('Zukunftsvorschau (Tage)');
    await waitFor(() => expect((input as HTMLInputElement).disabled).toBe(false));
    expect((input as HTMLInputElement).value).toBe('35');
    await userEvent.clear(input);
    await userEvent.type(input, '36');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Kontovorschau gespeichert.');
    expect(payloads).toEqual([{ futurePreviewDays: 36 }]);
    expect(preview).toBe(36);
    await userEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await screen.findByDisplayValue('35');
    expect(preview).toBe(35);
    expect(payloads).toEqual([{ futurePreviewDays: 36 }]);
  } finally {
    client.clear();
  }
});
