// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from '../router';
import type * as AuthModule from '../auth/status-query';
import {
  aliasPatterns,
  baselinePatterns,
  currentHub16,
  devPatterns,
  plannedStable16,
} from './redesign-route-cases.test-data';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

const fixtureParams: Record<string, string> = {
  kind: 'liquid',
  month: '2026-09',
  slug: 'monat',
  reportId: 'onepager',
  code: 'R07',
  id: 'synthetic-a2',
};
const concrete = (pattern: string) =>
  pattern.replace(/\$(\w+)/g, (_, name: string) => fixtureParams[name]!);

// This checks the actual constructed router and its validators, not rendered page bodies.
// Browser body/fixture acceptance is separate; a matching pattern never counts as a body pass.
describe.each([false, true])('actual A2 router, redesign=%s', (enabled) => {
  let appRouter: typeof RouterModule.router;
  let auth: typeof AuthModule;

  beforeAll(async () => {
    vi.resetModules();
    flags.REDESIGN_ENABLED = enabled;
    vi.stubEnv('DEV', true);
    ({ router: appRouter } = await import('../router'));
    auth = await import('../auth/status-query');
    auth.queryClient.setQueryData(auth.AUTH_STATUS_KEY, {
      authenticated: true,
      setupRequired: false,
    });
  });

  afterAll(() => {
    auth.queryClient.clear();
    vi.unstubAllEnvs();
  });

  async function open(at: string) {
    // Each independent load starts with a current real guard cache; no network/auth mock.
    auth.queryClient.setQueryData(auth.AUTH_STATUS_KEY, {
      authenticated: true,
      setupRequired: false,
    });
    const router = createRouter({
      routeTree: appRouter.routeTree,
      history: createMemoryHistory({ initialEntries: [at] }),
    });
    await router.load();
    expect(router.state.matches.every((match) => match.status === 'success')).toBe(true);
    return router;
  }

  it('accounts bidirectionally for every runtime pattern, including auth and dev routes', () => {
    const actual = Object.values(appRouter.routesById)
      .filter((route) => 'path' in route.options && route.options.path !== undefined)
      .map((route) => route.fullPath.replace(/\/$/, '') || '/');
    const expected = [
      ...baselinePatterns.map((row) => row[1]),
      ...aliasPatterns.map((row) => row[0]),
      ...devPatterns.map((row) => row[0]),
    ];
    expect(new Set(expected).size).toBe(expected.length);
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.toSorted()).toEqual(expected.toSorted());
    expect(baselinePatterns.filter((row) => row[2] === 'auth').map((row) => row[1])).toEqual([
      '/login',
      '/setup',
    ]);
  });

  it.each([
    ['/', false],
    ['/konten', false],
    ['/konten/buchungen', true],
    ['/konten/pruefen', false],
    ['/einstellungen/profil', false],
    ['/suche', false],
  ] as const)(
    'keeps restoration scoped at %s, enabling the S3 journal return only ON',
    async (path, journal) => {
      const router = await open(path);
      const restoration = appRouter.options.scrollRestoration;
      if (typeof restoration !== 'function')
        throw new Error('Expected the existing restoration policy');
      expect(restoration({ location: router.state.location })).toBe(enabled && journal);
    },
  );

  it.each(aliasPatterns.map(([from, , target, intent]) => [from, target, intent] as const))(
    'settles alias %s on its literal current destination',
    async (from, target, intent) => {
      const offFinanzcheck = from === '/reports/finanzcheck' && !enabled;
      const router = await open(
        `${concrete(from)}?monat=2026-08&period=month&zeitraum=2026-01..2026-08#details`,
      );
      expect(router.state.location.pathname).toBe(offFinanzcheck ? '/' : concrete(target));
      expect(router.state.location.hash).toBe('details');
      expect(router.state.matches.at(-1)?.search).toMatchObject({
        monat: '2026-08',
        zeitraum: '2026-01..2026-08',
        ...(offFinanzcheck ? {} : intent),
      });
      const reloaded = await open(router.state.location.href);
      expect(reloaded.state.location.href).toBe(router.state.location.href);
    },
  );

  it('retains each current hub identity and each planned identity’s current working destination', async () => {
    const { HUB_REPORTS } = await import('../reports/report-hub-model');
    expect(HUB_REPORTS.map((report) => report.id).toSorted()).toEqual(
      currentHub16.map((row) => row[0]).toSorted(),
    );
    for (const [id, target] of plannedStable16) {
      const router = await open(`/reports/${id}?monat=2026-09`);
      expect(router.state.location.pathname).toBe(target);
    }
  });
});

it.each([false, true])(
  'excludes every dev route from the production router, redesign=%s',
  async (enabled) => {
    vi.resetModules();
    flags.REDESIGN_ENABLED = enabled;
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    try {
      const { router } = await import('../router');
      const actual = Object.values(router.routesById).map((route) => route.fullPath);
      expect(actual.filter((path) => path.startsWith('/dev/'))).toEqual([]);
      expect(actual).toContain('/erfassen');
    } finally {
      vi.unstubAllEnvs();
    }
  },
);
