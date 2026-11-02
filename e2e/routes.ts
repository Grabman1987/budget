import { monthLabel, monthOf } from '../apps/web/src/nav/month';
import { CONTACT_SETTINGS_PATH, LEGACY_PAGE_PATHS } from './navigation-contract';
import { REPORTS, REPORT_GROUPS } from '../apps/web/src/nav/reports-catalog';

/** Every reachable URL of the sitemap (SPEC §3). */
export const ROUTES = [
  '/',
  ...LEGACY_PAGE_PATHS,
  '/konten/demo-konto',
  '/reports',
  ...REPORT_GROUPS.map((g) => `/reports/gruppe/${g.slug}`),
  ...REPORTS.map((r) => `/reports/${r.id}`),
  CONTACT_SETTINGS_PATH,
];

/** The h1 of Heute is the current month (as in the prototype). */
export const HEUTE_HEADING = monthLabel(monthOf(new Date()));
