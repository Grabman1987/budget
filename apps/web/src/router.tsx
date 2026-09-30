import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { authStatusQuery, queryClient } from './auth/status-query';
import { findReport } from './nav/reports-catalog';
import {
  ACCOUNT_PAGE,
  HEUTE,
  PAGES,
  REPORTS_CATALOG,
  REPORT_GROUP_PAGES,
  SECURITY_META,
  type PageMeta,
} from './nav/pages';
import { NotFoundPage } from './pages/not-found';
import { PlaceholderPage } from './pages/placeholder-page';
import { AppShell } from './shell/app-shell';
import type { PageTitleData } from './shell/page-meta';
import { isPanelId, type PanelId } from './shell/panels';

// Route-level code splitting: everything except the shell and the generic placeholder page is
// loaded when its route is first visited. Each page module below becomes its own chunk.
const accountPage = () => import('./pages/account-page');
const reportsPages = () => import('./pages/reports-pages');

const rootRoute = createRootRoute({
  // `?panel=` opens the side panel (desktop) or bottom sheet (phone) on any page.
  validateSearch: (search: Record<string, unknown>): { panel?: PanelId | undefined } => ({
    panel: isPanelId(search['panel']) ? search['panel'] : undefined,
  }),
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

/** Everything inside the application shell (sidebar, top bar, tab bar); needs a session. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  beforeLoad: async () => {
    const status = await queryClient.fetchQuery(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: '/setup' });
    if (!status.authenticated) throw redirect({ to: '/login' });
  },
  component: AppShell,
});

const pageRoute = (path: string, meta: PageMeta) =>
  createRoute({
    getParentRoute: () => shellRoute,
    path,
    staticData: { meta },
    component: () => <PlaceholderPage meta={meta} />,
  });

const redirectRoute = (path: string, to: string) =>
  createRoute({
    getParentRoute: () => shellRoute,
    path,
    beforeLoad: () => {
      throw redirect({ to: to as never });
    },
  });

const homeRoute = pageRoute('/', HEUTE);
const placeholderRoutes = PAGES.filter((page) => page.path !== SECURITY_META.path).map((page) =>
  pageRoute(page.path, page),
);
const securityRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: SECURITY_META.path,
  staticData: { meta: SECURITY_META },
  component: lazyRouteComponent(() => import('./pages/security-page'), 'SecurityPage'),
});
const redirects = [
  redirectRoute('/plan', '/plan/monat'),
  redirectRoute('/vermoegen', '/vermoegen/nettovermoegen'),
  redirectRoute('/einstellungen', '/einstellungen/konten'),
];

const accountRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/konten/$id',
  staticData: { meta: ACCOUNT_PAGE },
  loader: ({ params }): PageTitleData => ({ title: `Konto ${params.id}` }),
  component: lazyRouteComponent(accountPage, 'AccountRoute'),
});

const reportsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports',
  staticData: { meta: REPORTS_CATALOG },
  component: lazyRouteComponent(reportsPages, 'ReportsCatalogPage'),
});

const reportGroupRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports/gruppe/$slug',
  staticData: { meta: REPORTS_CATALOG },
  // Every group has its own title ("Reports · Ausgaben", ...), taken from the catalog.
  loader: ({ params }): PageTitleData => {
    const page = REPORT_GROUP_PAGES.find((p) => p.slug === params.slug);
    return page ? { title: page.meta.title } : {};
  },
  component: lazyRouteComponent(reportsPages, 'ReportGroupRoute'),
});

const reportRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports/$reportId',
  staticData: { meta: { ...REPORTS_CATALOG, title: 'Report', register: 'katalog' } },
  loader: ({ params }): PageTitleData => {
    const report = findReport(params.reportId);
    return report ? { title: report.name } : {};
  },
  component: lazyRouteComponent(reportsPages, 'ReportRoute'),
});

// Login and first-device setup live outside the shell (no navigation before a session exists).
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async () => {
    const status = await queryClient.fetchQuery(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: '/setup' });
    if (status.authenticated) throw redirect({ to: '/' });
  },
  component: lazyRouteComponent(() => import('./auth/login-route'), 'LoginRoute'),
});
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  beforeLoad: async () => {
    const status = await queryClient.fetchQuery(authStatusQuery);
    if (status.authenticated) throw redirect({ to: '/' });
    if (!status.setupRequired) throw redirect({ to: '/login' });
  },
  component: lazyRouteComponent(() => import('./auth/setup-route'), 'SetupRoute'),
});

// Developer pages (component gallery, chart spike) live outside the shell and outside the session
// guard, so they exist only in `vite dev` and in the e2e build (`--mode e2e`). In a production build
// the condition is a constant `false`: the routes and their chunks are not emitted at all.
const devRoutesEnabled = import.meta.env.DEV || import.meta.env.MODE === 'e2e';
const devRoutes = devRoutesEnabled
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/diagramme',
        component: lazyRouteComponent(() => import('./routes/charts-spike'), 'ChartsSpikePage'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/bauteile',
        component: lazyRouteComponent(() => import('./routes/components-page'), 'ComponentsRoute'),
      }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/start',
        component: lazyRouteComponent(() => import('./routes/home'), 'HomePage'),
      }),
    ]
  : [];

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    homeRoute,
    ...placeholderRoutes,
    securityRoute,
    ...redirects,
    accountRoute,
    reportsRoute,
    reportGroupRoute,
    reportRoute,
  ]),
  loginRoute,
  setupRoute,
  ...devRoutes,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
