// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from '../router';
import type * as AuthModule from '../auth/status-query';
import type * as AreasModule from './areas';
import { router as offRouter } from '../router';
import * as offAuth from '../auth/status-query';
import * as offAreas from './areas';
import { PAGES as offPages } from './pages';
import { REPORTS, REPORT_GROUPS } from './reports-catalog';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTACT_SETTINGS_PATH,
  expectedSettingsGroups,
  LEGACY_PAGE_PATHS,
} from '../../../../e2e/navigation-contract';
import { ROUTES } from '../../../../e2e/routes';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

it('loads the independent navigation contract in real Node without Vite and retains the complete legacy route sequence', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--input-type=module',
    '-e',
    `const data = await import(process.argv[1]); console.log(JSON.stringify({
      viteEnvDefined: typeof import.meta.env !== 'undefined',
      paths: data.LEGACY_PAGE_PATHS,
      off: data.expectedSettingsGroups(false),
      on: data.expectedSettingsGroups(true)
    }));`,
    pathToFileURL(resolve(process.cwd(), 'e2e/navigation-contract.ts')).href,
  ]);
  expect(JSON.parse(stdout)).toEqual({
    viteEnvDefined: false,
    paths: LEGACY_PAGE_PATHS,
    off: expectedSettingsGroups(false),
    on: expectedSettingsGroups(true),
  });
  const legacyRoutes = [
    '/',
    ...offPages.map((page) => page.path),
    '/konten/demo-konto',
    '/reports',
    ...REPORT_GROUPS.map((group) => `/reports/gruppe/${group.slug}`),
    ...REPORTS.map((report) => `/reports/${report.id}`),
  ];
  expect(ROUTES.slice(0, -1)).toEqual(legacyRoutes);
  expect(ROUTES.at(-1)).toBe(CONTACT_SETTINGS_PATH);
  expect(ROUTES).toHaveLength(legacyRoutes.length + 1);
});

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

  it('keeps the independent Node-safe browser expectations equal to the actual app catalogue', async () => {
    const { PAGES } = await import('./pages');
    expect(PAGES.map((page) => page.path)).toEqual(
      enabled ? [CONTACT_SETTINGS_PATH, ...LEGACY_PAGE_PATHS] : [...LEGACY_PAGE_PATHS],
    );
    expect(areas.SETTINGS_GROUPS).toEqual(expectedSettingsGroups(enabled));
  });
});
