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
  const patches: Profile[] = [];
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

describe.each([true, false])('family situation section (redesign %s)', (enabled) => {
  beforeEach(() => {
    flag.enabled = enabled;
  });

  it('starts as "Keine Angabe" everywhere and assumes nothing', async () => {
    mount();
    expect(await screen.findByText('Familie und Verpflichtungen (freiwillig)')).toBeTruthy();
    for (const label of [
      'Partnerschaft',
      'Finanziell abhängige Personen',
      'Davon Kinder',
      'Laufende Unterstützungszahlungen',
    ]) {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      expect(select.value).toBe('');
      expect(select.options[0]?.text).toBe('Keine Angabe');
    }
    expect(screen.queryByLabelText('Einkommen der Partnerschaft')).toBeNull();
    expect(screen.getByText('Ohne vollständige Angaben wird nichts angenommen.')).toBeTruthy();
  });

  it('keeps zero distinct, limits children to the dependants and saves the facts', async () => {
    const patches = mount();
    await screen.findByText('Familie und Verpflichtungen (freiwillig)');
    await userEvent.selectOptions(screen.getByLabelText('Partnerschaft'), 'none');
    await userEvent.selectOptions(screen.getByLabelText('Finanziell abhängige Personen'), '0');
    await userEvent.selectOptions(
      screen.getByLabelText('Laufende Unterstützungszahlungen'),
      'none',
    );
    expect(screen.getByText(/keine zusätzlichen Verpflichtungen/)).toBeTruthy();
    const children = screen.getByLabelText('Davon Kinder') as HTMLSelectElement;
    expect([...children.options].map((o) => o.value)).toEqual(['', '0']);
    await userEvent.selectOptions(screen.getByLabelText('Finanziell abhängige Personen'), '2');
    await userEvent.selectOptions(screen.getByLabelText('Davon Kinder'), '1');
    expect(screen.getByText(/Das kann für deine Rücklage/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Profil gespeichert.');
    expect(patches).toHaveLength(1);
    expect(patches[0]?.family).toEqual({
      partnership: 'none',
      partnerIncome: null,
      dependants: 2,
      children: 1,
      support: 'none',
    });
  });

  it('asks for the partner income only with a partner and clears it again', async () => {
    mount();
    await screen.findByText('Familie und Verpflichtungen (freiwillig)');
    await userEvent.selectOptions(screen.getByLabelText('Partnerschaft'), 'partner');
    await userEvent.selectOptions(screen.getByLabelText('Einkommen der Partnerschaft'), 'none');
    expect(screen.getByText(/hängt allein von dir ab/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Partnerschaft'), 'none');
    expect(screen.queryByLabelText('Einkommen der Partnerschaft')).toBeNull();
    expect(screen.queryByText(/hängt allein von dir ab/)).toBeNull();
  });
});
