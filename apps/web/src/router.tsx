import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ChartsSpikePage } from './routes/charts-spike';
import { HomePage } from './routes/home';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const chartsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/diagramme',
  component: ChartsSpikePage,
});

const routeTree = rootRoute.addChildren([homeRoute, chartsRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
