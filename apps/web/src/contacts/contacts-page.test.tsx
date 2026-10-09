// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { beforeEach, expect, it, vi } from 'vitest';
import { ContactsPage } from './contacts-page';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/konten/kontakte', searchStr: '?verlauf=1' }),
  Link: ({
    to,
    search,
    children,
    activeOptions: _activeOptions,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
    activeOptions?: unknown;
  }) => {
    void _activeOptions;
    return (
      <a href={`${to}${search ? `?${new URLSearchParams(search)}` : ''}`} {...props}>
        {children}
      </a>
    );
  },
}));
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            contacts: [
              {
                id: 'synthetic-contact',
                name: 'Kontakt Beispiel',
                balanceCents: 0,
                creditCents: 0,
              },
            ],
          }),
        ),
    ),
  );
});
it('links retained contact history to its statement page with the overview context', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ContactsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const link = await screen.findByRole('link', { name: 'Kontakt Beispiel' }, { timeout: 10000 });
  expect(link.getAttribute('href')).toBe('/konten/kontakte/synthetic-contact?verlauf=1');
  expect((screen.getByLabelText('Auch ausgeglichene Kontakte') as HTMLInputElement).checked).toBe(
    true,
  );
});
