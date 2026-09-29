import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ChartsSpikePage } from './routes/charts-spike';
import { ComponentsRoute } from './routes/components-page';
import { HomePage } from './routes/home';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const chartsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/diagramme',
  component: ChartsSpikePage,
});

const componentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/bauteile',
  component: ComponentsRoute,
});

const routeTree = rootRoute.addChildren([homeRoute, chartsRoute, componentsRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
