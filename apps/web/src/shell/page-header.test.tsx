// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { PageHeader } from './page-header';

vi.mock('./inbox', () => ({ useInboxCount: () => ({ count: 4, label: 'Prüfen, 4 offen' }) }));
vi.mock('./mobile-chrome', () => ({ MobileProfile: () => <button>Profilmenü</button> }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

it.each(['Heute', 'Plan', 'Konten', 'Vermögen', 'Reports'])(
  '%s retains the same utility slots with optional page controls',
  async (title) => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal('scrollTo', () => {});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const toggle = vi.fn();
    const root = createRootRoute({
      component: () => (
        <PageHeader
          title={title}
          controls={title === 'Heute' ? <button>Monatswahl</button> : undefined}
          collapsed={false}
          onToggle={toggle}
          onSearchChange={() => {}}
        />
      ),
    });
    const router = createRouter({
      routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' })]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const header = await screen.findByRole('banner');
    expect(header.querySelector('.page-header-title')?.textContent).toBe(title);
    expect(header.querySelectorAll('.page-header-controls')).toHaveLength(1);
    expect(header.querySelector('.page-header-controls')?.textContent).toBe(
      title === 'Heute' ? 'Monatswahl' : '',
    );
    const actions = within(header.querySelector<HTMLElement>('.page-header-actions')!);
    expect(actions.getByRole('link', { name: 'Prüfen, 4 offen' }).getAttribute('href')).toMatch(
      /^\/konten\/pruefen/,
    );
    expect(actions.getByRole('link', { name: 'Buchung' }).getAttribute('href')).toContain(
      'panel=buchung',
    );
    const privacy = actions.getByRole('button', { name: 'Beträge verbergen' });
    fireEvent.click(privacy);
    expect(privacy.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(header).getByRole('button', { name: 'Seitenleiste einklappen' }));
    expect(toggle).toHaveBeenCalledOnce();
  },
);
