// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { EMPTY_PROFILE, type Profile } from '@budget/domain';
import { afterEach, expect, it } from 'vitest';
import { PROFILE_KEY } from '../shell/use-profile';
import { PortfolioRiskContext } from './portfolio-risk-context';

afterEach(cleanup);

async function show(profile: Profile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(PROFILE_KEY, profile);
  const root = createRootRoute({ component: PortfolioRiskContext });
  const profileRoute = createRoute({
    getParentRoute: () => root,
    path: '/einstellungen/profil',
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([profileRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return screen.findByTestId('portfolio-risk-context');
}

it('shows unknown risk as "nicht erfasst" and links to the profile', async () => {
  const note = await show(EMPTY_PROFILE);
  expect(note.textContent).toContain('Risikobereitschaft: nicht erfasst');
  expect(note.textContent).toContain('Risikotragfähigkeit: nicht erfasst');
  expect(screen.getByRole('link', { name: 'Im Profil ansehen' }).getAttribute('href')).toBe(
    '/einstellungen/profil',
  );
  expect(note.textContent).not.toMatch(/niedrig|mittel|hoch/);
});

it('shows the stored classification per dimension without alarm markup', async () => {
  const note = await show({
    ...EMPTY_PROFILE,
    risk: {
      ...EMPTY_PROFILE.risk,
      lossReaction: 'buyMore',
      acceptableLoss: 'p50',
      horizon: 'lt3',
      liquidity: 'high',
      reserve: 'lt3',
      income: 'unstable',
    },
  });
  expect(note.textContent).toContain('Risikobereitschaft: hoch');
  expect(note.textContent).toContain('Risikotragfähigkeit: niedrig');
  expect(screen.queryByRole('alert')).toBeNull();
});
