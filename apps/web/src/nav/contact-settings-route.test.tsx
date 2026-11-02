// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from '../router';
import type * as AuthModule from '../auth/status-query';
import type * as AreasModule from './areas';
import { router as offRouter } from '../router';
import * as offAuth from '../auth/status-query';
import * as offAreas from './areas';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

describe.each([false, true])('contact Settings destination, redesign=%s', (enabled) => {
  let appRouter: typeof RouterModule.router;
  let auth: typeof AuthModule;
  let areas: typeof AreasModule;

  beforeAll(async () => {
    if (!enabled) {
      appRouter = offRouter;
      auth = offAuth;
      areas = offAreas;
      return;
    }
    vi.resetModules();
    flags.REDESIGN_ENABLED = enabled;
    vi.stubEnv('DEV', false);
    ({ router: appRouter } = await import('../router'));
    auth = await import('../auth/status-query');
    areas = await import('./areas');
  });
  afterAll(() => {
    auth?.queryClient.clear();
    vi.unstubAllEnvs();
  });

  async function open(path: string) {
    auth.queryClient.setQueryData(auth.AUTH_STATUS_KEY, {
      authenticated: true,
      setupRequired: false,
    });
    const router = createRouter({
      routeTree: appRouter.routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
    });
    await router.load();
    return router;
  }

  it('loads the real ON destination or compatible OFF contact page, preserving existing context', async () => {
    const router = await open(
      '/einstellungen/kontakte?kontakt=synthetic-contact&verlauf=1&monat=2026-10&period=month#synthetic-source',
    );
    const target = enabled ? '/einstellungen/kontakte' : '/konten/kontakte';
    expect(router.state.location.pathname).toBe(target);
    expect(
      router.state.matches.some((match) => match.pathname === target && match.status === 'success'),
    ).toBe(true);
    expect(router.state.location.search).toMatchObject({
      kontakt: 'synthetic-contact',
      verlauf: 1,
      monat: '2026-10',
      period: 'month',
    });
    expect(router.state.location.hash).toBe('synthetic-source');
  });

  it('adds only the ON Contacts entry and preserves every existing Settings group and order', () => {
    expect(
      areas.SETTINGS_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
    ).toEqual([
      [
        'Daten',
        [
          'Konten',
          ...(enabled ? ['Kontakte'] : []),
          'Kategorien',
          'Warenkorb (Teuerung)',
          'Projekte',
          'Anlageklassen',
          'Depots & Kryptos',
        ],
      ],
      ['Automatik', ['Regelwerk', 'Zuordnungsregeln', 'Datenquellen']],
      ['System', ['Sicherheit', 'CSV-Export', 'Profil']],
    ]);
    expect(
      areas.areaById('einstellungen').registers.filter((item) => item.id === 'kontakte'),
    ).toEqual(
      enabled ? [{ id: 'kontakte', label: 'Kontakte', to: '/einstellungen/kontakte' }] : [],
    );
  });
});
