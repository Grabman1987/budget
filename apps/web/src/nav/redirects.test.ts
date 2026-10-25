// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { beforeEach, expect, it } from 'vitest';
import { AUTH_STATUS_KEY, queryClient } from '../auth/status-query';
import { router as appRouter } from '../router';

beforeEach(() => {
  queryClient.setQueryData(AUTH_STATUS_KEY, { authenticated: true, setupRequired: false });
});

it.each([
  ['/reports/liquiditaet?horizon=90d&levers=trim-variable&monat=2026-09', '/plan/prognose'],
  ['/konten/posteingang?von=%2Fplan%2Fmonat&pruefen=reconcile&aufgaben=current', '/konten/pruefen'],
  [
    '/konten/posteingang/synthetic-warning?von=%2Fkonten&pruefen=reconcile',
    '/konten/pruefen/synthetic-warning',
  ],
])('redirects %s and retains every search parameter', async (from, to) => {
  const router = createRouter({
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [from] }),
  });
  await router.load();
  expect(router.state.location.pathname).toBe(to);
  expect(new URLSearchParams(router.state.location.searchStr)).toEqual(
    new URL(from, 'https://budget.invalid').searchParams,
  );
});
