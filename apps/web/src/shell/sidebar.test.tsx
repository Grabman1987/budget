// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { AUTH_STATUS_KEY } from '../auth/status-query';
import { Sidebar } from './sidebar';

vi.mock('./use-profile', () => ({ useShellIdentity: () => ({ name: 'Profil', initials: 'NU' }) }));
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
  expect(screen.queryByText('Passkey · dieses Gerät')).toBeNull();
});
