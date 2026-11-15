// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { EMPTY_PROFILE, type Profile } from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePanel } from './profile-settings';

const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return flag.enabled;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  let stored: Profile = { ...EMPTY_PROFILE };
  const patches: { risk: Profile['risk'] }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init: RequestInit) => {
      if (init.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Profile;
        patches.push(body);
        stored = body;
        return new Response(JSON.stringify({ ...stored, groupId: 'synthetic-group' }));
      }
      return new Response(JSON.stringify(stored));
    }),
  );
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: '/einstellungen/profil',
    component: () => <ProfilePanel />,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/einstellungen/profil'] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return patches;
}

describe.each([true, false])('risk profile section (redesign %s)', (enabled) => {
  beforeEach(() => {
    flag.enabled = enabled;
  });

  it('shows everything as unknown with "Keine Angabe" until answers are given', async () => {
    mount();
    expect(await screen.findByText('Risikobereitschaft: unbekannt')).toBeTruthy();
    expect(screen.getByText('Risikotragfähigkeit: unbekannt')).toBeTruthy();
    expect(screen.getByText(/0 von 2 Fragen beantwortet\. Offen: Reaktion/)).toBeTruthy();
    const horizon = screen.getByLabelText('Anlagehorizont') as HTMLSelectElement;
    expect(horizon.value).toBe('');
    expect(horizon.options[0]?.text).toBe('Keine Angabe');
    expect((screen.getByRole('button', { name: 'Speichern' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('explains a complete dimension with its basis and saves the answers', async () => {
    const patches = mount();
    await screen.findByText('Risikobereitschaft: unbekannt');
    await userEvent.selectOptions(screen.getByLabelText('Reaktion auf Kursverluste'), 'buyMore');
    await userEvent.selectOptions(
      screen.getByLabelText('Akzeptabler vorübergehender Verlust'),
      'p50',
    );
    expect(screen.getByText('Risikobereitschaft: hoch')).toBeTruthy();
    expect(screen.getByText('Grundlage: 2 von 2 Fragen beantwortet.')).toBeTruthy();
    expect(screen.getByText('Risikotragfähigkeit: unbekannt')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Profil gespeichert.');
    expect(patches).toHaveLength(1);
    expect(patches[0]?.risk).toEqual({
      horizon: null,
      liquidity: null,
      reserve: null,
      income: null,
      lossReaction: 'buyMore',
      acceptableLoss: 'p50',
    });
  });
});
