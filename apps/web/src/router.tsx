import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { authStatusQuery, queryClient } from './auth/status-query';
import { validateBookingsSearch } from './ledger/bookings-search';
import { accountsQuery } from './ledger/queries';
import { findReport } from './nav/reports-catalog';
import {
  ACCOUNT_PAGE,
  EINSTELLUNGEN_DATENQUELLEN,
  EINSTELLUNGEN_KATEGORIEN,
  PLAN_ERWARTET,
  IMPORT_REPORT,
  PLAN_MONAT,
  PLAN_SPARZIELE,
  HEUTE,
  KONTEN_BUCHUNGEN_META,
  KONTEN_META,
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
import { isMonth } from './nav/month';
import { isPanelId, type PanelId } from './shell/panels';

// Route-level code splitting: everything except the shell and the generic placeholder page is
// loaded when its route is first visited. Each page module below becomes its own chunk.
const accountPage = () => import('./ledger/account-page');
const overviewPage = () => import('./ledger/overview-page');
const reportsPages = () => import('./pages/reports-pages');

const rootRoute = createRootRoute({
  // `?panel=` opens the side panel (desktop) or bottom sheet (phone) on any page.
  // `?monat=YYYY-MM` selects the month on Heute and Plan (linkable, survives reload).
  validateSearch: (
    search: Record<string, unknown>,
  ): { panel?: PanelId | undefined; monat?: string | undefined } => ({
    panel: isPanelId(search['panel']) ? search['panel'] : undefined,
    monat: isMonth(search['monat']) ? search['monat'] : undefined,
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
const BUILT_PATHS = new Set<string>([
  SECURITY_META.path,
  '/konten',
  '/konten/buchungen',
  EINSTELLUNGEN_KATEGORIEN.path,
  EINSTELLUNGEN_DATENQUELLEN.path,
  PLAN_MONAT.path,
  PLAN_ERWARTET.path,
  PLAN_SPARZIELE.path,
]);
const placeholderRoutes = PAGES.filter((page) => !BUILT_PATHS.has(page.path)).map((page) =>
  pageRoute(page.path, page),
);
const bookingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/konten/buchungen',
  staticData: { meta: KONTEN_BUCHUNGEN_META },
  // Filters and sorting are URL parameters (German names, see ledger/bookings-search.ts).
  validateSearch: validateBookingsSearch,
  component: lazyRouteComponent(() => import('./ledger/bookings-page'), 'BookingsPage'),
});
const overviewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/konten',
  staticData: { meta: KONTEN_META },
  component: lazyRouteComponent(overviewPage, 'OverviewPage'),
});
const securityRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: SECURITY_META.path,
  staticData: { meta: SECURITY_META },
  component: lazyRouteComponent(() => import('./pages/security-page'), 'SecurityPage'),
});
const categoriesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: EINSTELLUNGEN_KATEGORIEN.path,
  staticData: { meta: EINSTELLUNGEN_KATEGORIEN },
  component: lazyRouteComponent(() => import('./budget/categories-page'), 'CategoriesPage'),
});
// Einstellungen › Datenquellen: YNAB import runs and the wizard (`?lauf=&schritt=`), P2d.
const IMPORT_STEPS = ['konten', 'kategorien', 'regeln', 'empfaenger', 'start', 'probelauf'];
const importSearch = (search: Record<string, unknown>) => ({
  lauf: typeof search['lauf'] === 'string' ? search['lauf'] : undefined,
  schritt: IMPORT_STEPS.includes(search['schritt'] as string)
    ? (search['schritt'] as string)
    : undefined,
});
const dataSourcesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: EINSTELLUNGEN_DATENQUELLEN.path,
  staticData: { meta: EINSTELLUNGEN_DATENQUELLEN },
  validateSearch: importSearch,
  component: lazyRouteComponent(() => import('./imports/datasources-page'), 'DataSourcesPage'),
});
const importReportRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: IMPORT_REPORT.path,
  staticData: { meta: IMPORT_REPORT },
  validateSearch: importSearch,
  component: lazyRouteComponent(() => import('./imports/report-page'), 'ImportReportPage'),
});
const planMonthRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_MONAT.path,
  staticData: { meta: PLAN_MONAT },
  component: lazyRouteComponent(() => import('./budget/plan-page'), 'PlanMonthPage'),
});
const planExpectedRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_ERWARTET.path,
  staticData: { meta: PLAN_ERWARTET },
  component: lazyRouteComponent(() => import('./expected/expected-page'), 'ExpectedPage'),
});
const planGoalsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_SPARZIELE.path,
  staticData: { meta: PLAN_SPARZIELE },
  component: lazyRouteComponent(() => import('./budget/goals-page'), 'GoalsPage'),
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
  // The title is the account name, so the document title is right from the first render.
  loader: async ({ params }): Promise<PageTitleData> => {
    try {
      const { accounts } = await queryClient.fetchQuery({ ...accountsQuery(), staleTime: 5_000 });
      const name = accounts.find((a) => a.id === params.id)?.name;
      return name ? { title: name } : {};
    } catch {
      return {};
    }
  },
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
    categoriesRoute,
    dataSourcesRoute,
    importReportRoute,
    planMonthRoute,
    planExpectedRoute,
    planGoalsRoute,
    ...redirects,
    overviewRoute,
    bookingsRoute,
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
