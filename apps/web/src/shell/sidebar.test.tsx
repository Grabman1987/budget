// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AUTH_STATUS_KEY } from '../auth/status-query';
import { Sidebar } from './sidebar';

const identity = vi.hoisted(() => ({ name: 'Profil', initials: 'NU' }));
vi.mock('./use-profile', () => ({ useShellIdentity: () => identity }));
beforeEach(() => {
  identity.name = 'Profil';
});
vi.mock('./account-tree', () => ({ AccountTree: () => null }));
vi.mock('./theme-button', () => ({ ThemeButton: () => null }));
vi.mock('../pwa/queue-ui', () => ({ QueueBadge: () => null }));
vi.mock('./app-link', () => ({
  AppLink: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

it.each([false, true])('shows the actual session method (recovery=%s)', (viaRecovery) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(AUTH_STATUS_KEY, { authenticated: true, viaRecovery });
  render(
    <QueryClientProvider client={client}>
      <Sidebar area="konten" />
    </QueryClientProvider>,
  );
  expect(screen.getByText(viaRecovery ? 'Wiederherstellungscode' : 'Passkey')).toBeTruthy();
  expect(
    screen.getByRole('link', {
      name: `Profil / Einstellungen ${viaRecovery ? 'Wiederherstellungscode' : 'Passkey'}`,
    }),
  ).toBeTruthy();
  expect(screen.queryByText('Passkey · dieses Gerät')).toBeNull();
});

it('keeps the five navigation icons and active link without sheet numbers', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(AUTH_STATUS_KEY, { authenticated: true, viaRecovery: false });
  const { container } = render(
    <QueryClientProvider client={client}>
      <Sidebar area="konten" />
    </QueryClientProvider>,
  );
  const links = container.querySelectorAll('.sheetlist a');
  expect([...links].map((link) => link.getAttribute('aria-label'))).toEqual([
    'Heute',
    'Plan',
    'Konten',
    'Vermögen',
    'Reports',
  ]);
  expect(container.querySelectorAll('.sheetlist a svg')).toHaveLength(5);
  expect(container.querySelector('.sheet-no')).toBeNull();
  expect(container.querySelector('.sheetlist a[aria-current="page"]')?.textContent).toBe('Konten');
  const footer = container.querySelector('.sidebar-foot')!;
  expect(footer.querySelectorAll('a')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Profil / Einstellungen Passkey' })).toBe(
    footer.querySelector('a'),
  );
});

it('includes the visible owner name and keeps an icon-only profile link named', () => {
  identity.name = 'Ada';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(AUTH_STATUS_KEY, { authenticated: true, viaRecovery: false });
  const view = (collapsed: boolean) => (
    <QueryClientProvider client={client}>
      <Sidebar area="konten" collapsed={collapsed} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(false));
  expect(screen.getByRole('link', { name: 'Ada Profil / Einstellungen' })).toBeTruthy();
  rerender(view(true));
  expect(screen.getByRole('link', { name: 'Ada Profil / Einstellungen' })).toBeTruthy();
  identity.name = 'Profil';
  rerender(view(true));
  expect(screen.getByRole('link', { name: 'Profil / Einstellungen Passkey' })).toBeTruthy();
});
