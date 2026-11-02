// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from '../router';
import type * as AuthModule from './status-query';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

describe.each([false, true])('real login router, redesign=%s', (enabled) => {
  let appRouter: typeof RouterModule.router;
  let auth: typeof AuthModule;

  beforeAll(async () => {
    vi.resetModules();
    flags.REDESIGN_ENABLED = enabled;
    ({ router: appRouter } = await import('../router'));
    auth = await import('./status-query');
  });
  afterAll(() => auth.queryClient.clear());

  it.each([
    ['https://example.invalid/erfassen', undefined],
    ['//example.invalid/erfassen', undefined],
    ['/konten', undefined],
    ['/erfassen', '/erfassen'],
    [
      '/erfassen?betrag=-12.50&konto=cash&extra=ignored#raw',
      '/erfassen?betrag=-12%2C50&konto=cash',
    ],
  ])('validates raw weiter=%s in the actual route search merge', async (raw, expected) => {
    auth.queryClient.setQueryData(auth.AUTH_STATUS_KEY, {
      authenticated: false,
      setupRequired: false,
    });
    const router = createRouter({
      routeTree: appRouter.routeTree,
      history: createMemoryHistory({
        initialEntries: [`/login?weiter=${encodeURIComponent(raw!)}`],
      }),
    });
    await router.load();
    expect(router.state.location.pathname).toBe('/login');
    // The location retains untrusted input; the consumed match must overwrite it even on rejection.
    expect(router.state.location.search.weiter).toBe(raw);
    const login = router.state.matches.at(-1)!;
    expect(login.routeId).toBe('/login');
    expect(login.status).toBe('success');
    expect(login.search).toHaveProperty('weiter', expected);
  });
});
