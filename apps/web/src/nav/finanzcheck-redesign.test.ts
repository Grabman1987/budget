// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { AUTH_STATUS_KEY, queryClient } from '../auth/status-query';
import { router as appRouter } from '../router';
import { validateReportSearch } from '../reports/report-search';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));

beforeEach(() => {
  queryClient.setQueryData(AUTH_STATUS_KEY, { authenticated: true, setupRequired: false });
});

it('ON restores the Finanzcheck bookmark to its canonical history with valid context intact', async () => {
  const router = createRouter({
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({
      initialEntries: [
        '/reports/finanzcheck?monat=2026-08&period=month&zeitraum=2026-01..2026-08&darstellung=bilanz&trend=true&ansicht=synthetic-view&kategorien=%5B%22synthetic-food%22%5D#fc-matrix',
      ],
    }),
  });
  await router.load();
  expect(router.state.location.pathname).toBe('/reports/onepager');
  expect(router.state.location.hash).toBe('fc-matrix');
  expect(router.state.matches.at(-1)?.search).toMatchObject({
    monat: '2026-08',
    period: 'month',
    zeitraum: '2026-01..2026-08',
    darstellung: 'finanzcheck',
    trend: true,
    ansicht: 'synthetic-view',
    kategorien: ['synthetic-food'],
  });
  expect(router.state.matches.every((match) => match.status === 'success')).toBe(true);
});

it('ON validates the explicit Finanzcheck presentation and rejects unknown presentations', () => {
  expect(validateReportSearch({ darstellung: 'finanzcheck' }).darstellung).toBe('finanzcheck');
  expect(validateReportSearch({ darstellung: 'unknown-finanzcheck' }).darstellung).toBeUndefined();
});

it('ON changes the real route title with the validated presentation on the same report route', async () => {
  const router = createRouter({
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({ initialEntries: ['/reports/onepager'] }),
  });
  await router.load();
  expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ title: 'Monats-One-Pager' });
  await router.navigate({ to: '/reports/onepager', search: { darstellung: 'finanzcheck' } });
  expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ title: 'Finanz-Check-Verlauf' });
  await router.navigate({ to: '/reports/onepager', search: {} });
  expect(router.state.matches.at(-1)?.loaderData).toMatchObject({ title: 'Monats-One-Pager' });
});
