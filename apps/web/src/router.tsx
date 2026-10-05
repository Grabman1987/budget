import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { Period } from '@budget/domain';
import type { HeutePeriod } from './heute/api';
import { authStatusQuery, queryClient } from './auth/status-query';
import { validateBookingsSearch } from './ledger/bookings-search';
import { accountsQuery } from './ledger/queries';
import { captureContinuation, validateCaptureSearch } from './ledger/capture-link';
import { findReport } from './nav/reports-catalog';
import {
  ACCOUNT_PAGE,
  CSV_EXPORT_META,
  EINSTELLUNGEN_KATEGORIEN,
  KONTEN_SETTINGS_META,
  PLAN_ERWARTET,
  EINSTELLUNGEN_REGELWERK,
  PLAN_MONAT,
  PLAN_JAHR,
  PLAN_SPARZIELE,
  HEUTE,
  SETTINGS_INDEX,
  KONTEN_BUCHUNGEN_META,
  KONTEN_META,
  PAGES,
  REPORTS_CATALOG,
  REPORT_GROUP_PAGES,
  SECURITY_META,
  PROFILE_META,
  INVESTMENT_SETTINGS_META,
  VERMOEGEN_FREIHEIT_META,
  VERMOEGEN_NETTO_META,
  VERMOEGEN_PORTFOLIO_META,
  VERMOEGEN_SCHULDEN_META,
  type PageMeta,
} from './nav/pages';
import { NotFoundPage } from './pages/not-found';
import { PlaceholderPage } from './pages/placeholder-page';
import { AppShell } from './shell/app-shell';
import type { PageTitleData } from './shell/page-meta';
import { isMonth } from './nav/month';
import { isZeitraum } from './wealth/zeitraum';
import { isPanelId, type PanelId } from './shell/panels';

// Route-level code splitting: everything except the shell and the generic placeholder page is
// loaded when its route is first visited. Each page module below becomes its own chunk.
const accountPage = () => import('./ledger/account-page');
const overviewPage = () => import('./ledger/overview-page');
const reportsPages = () => import('./pages/reports-pages');
const heutePage = () => import('./heute/heute-page');

const rootRoute = createRootRoute({
  // `?panel=` opens the side panel (desktop) or bottom sheet (phone) on any page.
  // `?monat=YYYY-MM` selects the month on Heute and Plan (linkable, survives reload).
  // `?zeitraum=1M|3M|YTD|1J|3J|Alles` is the period of the Vermögen pages.
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    panel?: PanelId | undefined;
    monat?: string | undefined;
    period?: HeutePeriod | undefined;
    zeitraum?: Period | undefined;
    trend?: boolean | undefined;
    klasse?: string | undefined;
    instrument?: string | undefined;
  } => ({
    panel: isPanelId(search['panel']) ? search['panel'] : undefined,
    klasse:
      typeof search['klasse'] === 'string' && search['klasse'].length <= 64
        ? search['klasse']
        : undefined,
    instrument:
      typeof search['instrument'] === 'string' && search['instrument'].length <= 64
        ? search['instrument']
        : undefined,
    monat: isMonth(search['monat']) ? search['monat'] : undefined,
    period:
      search['period'] === 'month' || search['period'] === 'payday' ? search['period'] : undefined,
    trend: search['trend'] === true || search['trend'] === 'true' ? true : undefined,
    zeitraum: isZeitraum(search['zeitraum']) ? search['zeitraum'] : undefined,
  }),
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

/** Everything inside the application shell (sidebar, top bar, tab bar); needs a session. */
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  beforeLoad: async ({ location }) => {
    const status = await queryClient.fetchQuery(authStatusQuery);
    if (status.setupRequired) throw redirect({ to: '/setup' });
    if (!status.authenticated)
      throw redirect({ to: '/login', search: { weiter: captureContinuation(location.href) } });
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

const homeRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  staticData: { meta: HEUTE },
  component: lazyRouteComponent(heutePage, 'HeutePage'),
});
const captureRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/erfassen',
  staticData: { meta: { ...HEUTE, title: 'Buchung erfassen' } },
  validateSearch: validateCaptureSearch,
  component: lazyRouteComponent(() => import('./ledger/capture-page'), 'CapturePage'),
});
const BUILT_PATHS = new Set<string>([
  '/einstellungen/zuordnung',
  '/einstellungen/datenquellen',
  SECURITY_META.path,
  PROFILE_META.path,
  INVESTMENT_SETTINGS_META.path,
  KONTEN_SETTINGS_META.path,
  '/konten',
  '/einstellungen/warenkorb',
  '/einstellungen/projekte',
  '/einstellungen/anlageklassen',
  '/konten/buchungen',
  '/konten/kontakte',
  '/konten/posteingang',
  EINSTELLUNGEN_KATEGORIEN.path,
  EINSTELLUNGEN_REGELWERK.path,
  PLAN_MONAT.path,
  PLAN_JAHR.path,
  PLAN_ERWARTET.path,
  VERMOEGEN_FREIHEIT_META.path,
  VERMOEGEN_NETTO_META.path,
  VERMOEGEN_PORTFOLIO_META.path,
  VERMOEGEN_SCHULDEN_META.path,
  PLAN_SPARZIELE.path,
  CSV_EXPORT_META.path,
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
const inboxRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/konten/posteingang',
  staticData: { meta: PAGES.find((p) => p.path === '/konten/posteingang')! },
  component: lazyRouteComponent(() => import('./inbox/inbox-page'), 'InboxPage'),
});
const contactsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/konten/kontakte',
  validateSearch: (search: Record<string, unknown>) => ({
    kontakt:
      typeof search['kontakt'] === 'string' && search['kontakt'].length <= 64
        ? search['kontakt']
        : undefined,
  }),
  staticData: { meta: PAGES.find((p) => p.path === '/konten/kontakte')! },
  component: lazyRouteComponent(() => import('./contacts/contacts-page'), 'ContactsPage'),
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
const inflationBasketSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/einstellungen/warenkorb',
  staticData: { meta: PAGES.find((p) => p.path === '/einstellungen/warenkorb')! },
  component: lazyRouteComponent(
    () => import('./pages/inflation-basket-settings'),
    'InflationBasketSettingsPage',
  ),
});
const projectsSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/einstellungen/projekte',
  staticData: { meta: PAGES.find((p) => p.path === '/einstellungen/projekte')! },
  component: lazyRouteComponent(() => import('./pages/project-settings'), 'ProjectSettings'),
});
const assetClassesSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/einstellungen/anlageklassen',
  staticData: { meta: PAGES.find((p) => p.path === '/einstellungen/anlageklassen')! },
  component: lazyRouteComponent(
    () => import('./pages/asset-classes-settings'),
    'AssetClassesSettingsPage',
  ),
});
const profileRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PROFILE_META.path,
  staticData: { meta: PROFILE_META },
  component: lazyRouteComponent(() => import('./pages/profile-settings'), 'ProfileSettingsPage'),
});
const investmentSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: INVESTMENT_SETTINGS_META.path,
  staticData: { meta: INVESTMENT_SETTINGS_META },
  component: lazyRouteComponent(
    () => import('./pages/investment-settings'),
    'InvestmentSettingsPage',
  ),
});
const accountsSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: KONTEN_SETTINGS_META.path,
  staticData: { meta: KONTEN_SETTINGS_META },
  component: lazyRouteComponent(() => import('./pages/accounts-settings'), 'AccountsSettingsPage'),
});
const categoriesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: EINSTELLUNGEN_KATEGORIEN.path,
  staticData: { meta: EINSTELLUNGEN_KATEGORIEN },
  component: lazyRouteComponent(() => import('./budget/categories-page'), 'CategoriesPage'),
});
const rulesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: EINSTELLUNGEN_REGELWERK.path,
  staticData: { meta: EINSTELLUNGEN_REGELWERK },
  component: lazyRouteComponent(() => import('./rules/rules-page'), 'RulesPage'),
});
const assignmentRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/einstellungen/zuordnung',
  staticData: { meta: PAGES.find((p) => p.path === '/einstellungen/zuordnung')! },
  component: lazyRouteComponent(() => import('./assignment/assignment-page'), 'AssignmentPage'),
});
const planMonthRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_MONAT.path,
  validateSearch: (
    search: Record<string, unknown>,
  ): { ansicht?: 'triage'; kategorie?: string } => ({
    ...(search['ansicht'] === 'triage' ? { ansicht: 'triage' as const } : {}),
    ...(typeof search['kategorie'] === 'string' && search['kategorie'].length <= 64
      ? { kategorie: search['kategorie'] }
      : {}),
  }),
  staticData: { meta: PLAN_MONAT },
  component: lazyRouteComponent(() => import('./budget/plan-page'), 'PlanMonthPage'),
});
const dataSourcesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/einstellungen/datenquellen',
  staticData: { meta: PAGES.find((p) => p.path === '/einstellungen/datenquellen')! },
  component: lazyRouteComponent(() => import('./pages/data-sources'), 'DataSourcesPage'),
});
const exportRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: CSV_EXPORT_META.path,
  staticData: { meta: CSV_EXPORT_META },
  component: lazyRouteComponent(
    () => import('./pages/export-placeholder'),
    'ExportPlaceholderPage',
  ),
});
const planYearRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_JAHR.path,
  staticData: { meta: PLAN_JAHR },
  validateSearch: (search: Record<string, unknown>) => ({
    ereignis:
      typeof search['ereignis'] === 'string' && search['ereignis'].length <= 64
        ? search['ereignis']
        : undefined,
  }),
  component: lazyRouteComponent(() => import('./budget/plan-year-page'), 'PlanYearPage'),
});
const planExpectedRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_ERWARTET.path,
  staticData: { meta: PLAN_ERWARTET },
  component: lazyRouteComponent(() => import('./expected/expected-page'), 'ExpectedPage'),
});
const freedomRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: VERMOEGEN_FREIHEIT_META.path,
  staticData: { meta: VERMOEGEN_FREIHEIT_META },
  component: lazyRouteComponent(() => import('./wealth/freedom-page'), 'FreedomPage'),
});

const netWorthRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: VERMOEGEN_NETTO_META.path,
  staticData: { meta: VERMOEGEN_NETTO_META },
  component: lazyRouteComponent(() => import('./wealth/networth-page'), 'NetWorthPage'),
});
const portfolioRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/vermoegen/portfolio',
  staticData: { meta: VERMOEGEN_PORTFOLIO_META },
  validateSearch: (search: Record<string, unknown>) => ({
    sparplan:
      typeof search['sparplan'] === 'string' && search['sparplan'].length <= 64
        ? search['sparplan']
        : undefined,
    allokation: search['allokation'] === 'ziele' ? 'ziele' : undefined,
    produkt:
      typeof search['produkt'] === 'string' && search['produkt'].length <= 64
        ? search['produkt']
        : undefined,
    handel:
      typeof search['handel'] === 'string' && search['handel'].length <= 64
        ? search['handel']
        : undefined,
  }),
  component: lazyRouteComponent(() => import('./wealth/portfolio-page'), 'PortfolioPage'),
});
const debtsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/vermoegen/schulden',
  staticData: { meta: VERMOEGEN_SCHULDEN_META },
  validateSearch: (search: Record<string, unknown>) => ({
    kredit:
      typeof search['kredit'] === 'string' && search['kredit'].length <= 64
        ? search['kredit']
        : undefined,
  }),
  component: lazyRouteComponent(() => import('./wealth/debts-page'), 'DebtsPage'),
});
const planGoalsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: PLAN_SPARZIELE.path,
  staticData: { meta: PLAN_SPARZIELE },
  component: lazyRouteComponent(() => import('./budget/goals-page'), 'GoalsPage'),
});
/** Whether the viewport is wide enough for the settings rail (the app's desktop breakpoint). */
const isDesktopViewport = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(min-width: 768px)').matches;
// Phone: the grouped index list. Desktop keeps the old behaviour: the rail is always visible, so the
// bare address opens the first page.
const settingsIndexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/einstellungen',
  staticData: { meta: SETTINGS_INDEX },
  beforeLoad: () => {
    if (isDesktopViewport()) throw redirect({ to: '/einstellungen/konten' as never });
  },
  component: lazyRouteComponent(() => import('./pages/settings-index'), 'SettingsIndexPage'),
});
const redirects = [
  // Legacy import bookmarks lead to the export placeholder; no import action remains in the UI.
  redirectRoute('/einstellungen/import', '/einstellungen/export'),
  redirectRoute('/plan', '/plan/monat'),
  redirectRoute('/vermoegen', '/vermoegen/nettovermoegen'),
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
  validateSearch: (search: Record<string, unknown>) => ({
    gehaltszettel:
      typeof search['gehaltszettel'] === 'string' && search['gehaltszettel'].length <= 64
        ? search['gehaltszettel']
        : undefined,
    kontakt:
      typeof search['kontakt'] === 'string' &&
      search['kontakt'].length > 0 &&
      search['kontakt'].length <= 100
        ? search['kontakt']
        : undefined,
  }),
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
  validateSearch: (search: Record<string, unknown>): { weiter?: string | undefined } => {
    const weiter = captureContinuation(search['weiter']);
    return weiter ? { weiter } : {};
  },
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
        path: '/dev/panels',
        component: lazyRouteComponent(() => import('./routes/panels-harness'), 'PanelsHarnessPage'),
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
    captureRoute,
    ...placeholderRoutes,
    securityRoute,
    profileRoute,
    projectsSettingsRoute,
    inflationBasketSettingsRoute,
    assetClassesSettingsRoute,
    investmentSettingsRoute,
    accountsSettingsRoute,
    categoriesRoute,
    rulesRoute,
    assignmentRoute,
    exportRoute,
    dataSourcesRoute,
    planMonthRoute,
    planYearRoute,
    planExpectedRoute,
    freedomRoute,
    netWorthRoute,
    portfolioRoute,
    debtsRoute,
    planGoalsRoute,
    ...redirects,
    settingsIndexRoute,
    overviewRoute,
    bookingsRoute,
    contactsRoute,
    inboxRoute,
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
