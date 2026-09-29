import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { ChartsSpikePage } from './routes/charts-spike';
import { ComponentsRoute } from './routes/components-page';
import { HomePage } from './routes/home';
import {
  ACCOUNT_PAGE,
  HEUTE,
  PAGES,
  REPORTS_CATALOG,
  REPORT_GROUP_PAGES,
  type PageMeta,
} from './nav/pages';
import { AccountPage } from './pages/account-page';
import { NotFoundPage } from './pages/not-found';
import { PlaceholderPage } from './pages/placeholder-page';
import { ReportGroupPage, ReportPage, ReportsCatalogPage } from './pages/reports-pages';
import { AppShell } from './shell/app-shell';
import { isPanelId, type PanelId } from './shell/panels';

const rootRoute = createRootRoute({
  // `?panel=` opens the side panel (desktop) or bottom sheet (phone) on any page.
  validateSearch: (search: Record<string, unknown>): { panel?: PanelId | undefined } => ({
    panel: isPanelId(search['panel']) ? search['panel'] : undefined,
  }),
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

/** Everything inside the application shell (sidebar, top bar, tab bar). */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
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
const placeholderRoutes = PAGES.map((page) => pageRoute(page.path, page));
const redirects = [
  redirectRoute('/plan', '/plan/monat'),
  redirectRoute('/vermoegen', '/vermoegen/nettovermoegen'),
  redirectRoute('/einstellungen', '/einstellungen/konten'),
];

const accountRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/konten/$id',
  staticData: { meta: ACCOUNT_PAGE },
  component: function Account() {
    return <AccountPage id={accountRoute.useParams().id} />;
  },
});

const reportsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports',
  staticData: { meta: REPORTS_CATALOG },
  component: ReportsCatalogPage,
});

const reportGroupRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports/gruppe/$slug',
  staticData: { meta: REPORT_GROUP_PAGES[0]?.meta ?? REPORTS_CATALOG },
  component: function ReportGroup() {
    return <ReportGroupPage slug={reportGroupRoute.useParams().slug} />;
  },
});

const reportRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/reports/$reportId',
  staticData: { meta: { ...REPORTS_CATALOG, title: 'Report', register: 'katalog' } },
  component: function Report() {
    return <ReportPage reportId={reportRoute.useParams().reportId} />;
  },
});

// Developer pages live outside the shell (own layout).
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
const startRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/start',
  component: HomePage,
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    homeRoute,
    ...placeholderRoutes,
    ...redirects,
    accountRoute,
    reportsRoute,
    reportGroupRoute,
    reportRoute,
  ]),
  chartsRoute,
  componentsRoute,
  startRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
