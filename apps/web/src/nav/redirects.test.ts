// @vitest-environment jsdom
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { beforeEach, expect, it } from 'vitest';
import { AUTH_STATUS_KEY, queryClient } from '../auth/status-query';
import { router as appRouter } from '../router';

// Owner mapping #487: literals deliberately independent of the production alias table.
const reportLandings = [
  ['onepager', '/reports/onepager', {}],
  ['gehalt', '/reports/gehalt', {}],
  ['einnahmen', '/reports/einnahmen-ausgaben', { darstellung: 'income' }],
  ['geldfluss', '/reports/geldfluss', {}],
  ['jahresansicht', '/reports/explorer', { vorlage: 'year' }],
  ['kategorien', '/reports/explorer', { vorlage: 'category' }],
  ['sparquote', '/reports/sparquote', {}],
  ['gesamttabelle', '/reports/explorer', { vorlage: 'total' }],
  ['projekte', '/reports/einnahmen-ausgaben', { darstellung: 'projekte' }],
  ['einnahmen-ausgaben', '/reports/einnahmen-ausgaben', {}],
  ['planungstreue', '/reports/budgettreue', { darstellung: 'planungstreue' }],
  ['ausgaben', '/reports/ausgaben', {}],
  ['budgettreue', '/reports/budgettreue', {}],
  ['abos', '/reports/abos', {}],
  ['inflation', '/reports/inflation', {}],
  ['empfaenger', '/reports/ausgaben', { darstellung: 'empfaenger' }],
  ['kosten', '/reports/abos', { darstellung: 'bankkosten' }],
  ['liquiditaet', '/plan/prognose', {}],
  ['cashflow', '/reports/einnahmen-ausgaben', { darstellung: 'cashflow' }],
  ['vermoegen', '/reports/vermoegen-schulden', { darstellung: 'verlauf' }],
  ['vorschau', '/plan/erwartet', {}],
  ['sparziele', '/plan/sparziele', {}],
  ['vermoegen-schulden', '/reports/vermoegen-schulden', {}],
  ['pdepots', '/reports/pdepots', {}],
  ['pallocation', '/reports/pallocation', {}],
  ['peinzahlungen', '/reports/pallocation', { darstellung: 'einzahlungen' }],
  ['prendite', '/reports/pallocation', { darstellung: 'rendite' }],
  ['psteuern', '/reports/psteuern', {}],
  ['jahresreport', '/reports/jahresreport', {}],
  ['finanzcheck', '/', {}],
  ['explorer', '/reports/explorer', {}],
  ['kontakte', '/konten/kontakte', {}],
  ['vergleich', '/reports/vergleich', {}],
  ['gesamtuebersicht', '/reports/vermoegen-schulden', { darstellung: 'gesamt' }],
] as const;

async function open(from: string) {
  const router = createRouter({
    routeTree: appRouter.routeTree,
    history: createMemoryHistory({ initialEntries: [from] }),
  });
  await router.load();
  return router;
}

beforeEach(() => {
  queryClient.setQueryData(AUTH_STATUS_KEY, { authenticated: true, setupRequired: false });
});

it.each(reportLandings)('lands legacy %s on %s with its original view', async (slug, to, intent) => {
  const router = await open(`/reports/${slug}?monat=2026-08&zeitraum=2026-01..2026-08#details`);
  expect(router.state.location.pathname).toBe(to);
  expect(router.state.location.hash).toBe('details');
  expect(router.state.matches.every((match) => match.status === 'success')).toBe(true);
  expect(router.state.matches.at(-1)?.search).toMatchObject({
    monat: '2026-08',
    zeitraum: '2026-01..2026-08',
    ...intent,
  });
  // Loading the canonical bookmark again must settle, including the 16 unchanged paths.
  const refreshed = await open(router.state.location.href);
  expect(refreshed.state.location.href).toBe(router.state.location.href);
});

it.each([
  ['einnahmen', 'income'],
  ['cashflow', 'cashflow'],
  ['projekte', 'projekte'],
  ['empfaenger', 'empfaenger'],
  ['planungstreue', 'planungstreue'],
  ['kosten', 'bankkosten'],
  ['vermoegen', 'verlauf'],
  ['gesamtuebersicht', 'gesamt'],
  ['peinzahlungen', 'einzahlungen'],
  ['prendite', 'rendite'],
])('keeps %s capability despite a conflicting incoming view', async (slug, darstellung) => {
  const router = await open(`/reports/${slug}?darstellung=bilanz&trend=true&zeitraum=3M`);
  expect(router.state.matches.at(-1)?.search).toMatchObject({
    darstellung,
    trend: true,
    zeitraum: '3M',
  });
});

it.each([
  ['kategorien', 'category', 'YTD'],
  ['jahresansicht', 'year', 'YTD'],
  ['gesamttabelle', 'total', 'Alles'],
])('retains %s template and source fallback without repurposing saved-view IDs', async (slug, vorlage, zeitraum) => {
  const router = await open(
    `/reports/${slug}?ansicht=server-view&vorlage=heatmap&exakt=true&kategorien=%5B%22food%22%5D&gruppen=%5B%22household%22%5D&zelle=cat%3Afood&spalte=2026-08`,
  );
  expect(router.state.matches.at(-1)?.search).toMatchObject({
    vorlage,
    zeitraum,
    ansicht: 'server-view',
    exakt: true,
    kategorien: ['food'],
    gruppen: ['household'],
    zelle: 'cat:food',
    spalte: '2026-08',
  });
});

it.each([
  ['', { projekt: undefined, projektUngueltig: undefined }],
  ['?projekt=active-project', { projekt: 'active-project', projektUngueltig: undefined }],
  ['?projekt=deleted-project', { projekt: 'deleted-project', projektUngueltig: undefined }],
  ['?projekt=', { projekt: undefined, projektUngueltig: true }],
  [`?projekt=${'x'.repeat(65)}`, { projekt: undefined, projektUngueltig: true }],
  ['?projektUngueltig=true', { projekt: undefined, projektUngueltig: true }],
])('preserves explicit project scope in %s without inventing or broadening it', async (query, expected) => {
  const router = await open(`/reports/projekte${query}`);
  expect(router.state.matches.at(-1)?.search).toMatchObject({ darstellung: 'projekte', ...expected });
});

it.each(['true', '%22true%22'])('retains the exact heatmap flag encoded as %s', async (exakt) => {
  const router = await open(`/reports/explorer?vorlage=heatmap&exakt=${exakt}&zeitraum=2026-08..2026-08&kategorien=%5B%22food%22%5D`);
  expect(router.state.matches.at(-1)?.search).toMatchObject({
    vorlage: 'heatmap',
    exakt: true,
    zeitraum: '2026-08..2026-08',
    kategorien: ['food'],
  });
});

it.each([
  ['kategorien', '%223M%22', '3M'],
  ['jahresansicht', '%223M%22', '3M'],
  ['gesamttabelle', '%223M%22', '3M'],
  ['kategorien', '%222026-01..2026-08%22', '2026-01..2026-08'],
  ['jahresansicht', '%222026-01..2026-08%22', '2026-01..2026-08'],
  ['gesamttabelle', '%222026-01..2026-08%22', '2026-01..2026-08'],
  ['kategorien', 'unknown', 'YTD'],
  ['jahresansicht', 'unknown', 'YTD'],
  ['gesamttabelle', 'unknown', 'Alles'],
])('validates the decoded period on %s before applying a source fallback', async (slug, period, expected) => {
  const router = await open(`/reports/${slug}?zeitraum=${period}`);
  expect(router.state.matches.at(-1)?.search).toMatchObject({ zeitraum: expected });
});

it('retains recipient and contact identity and supports return to a Heute/Plan entry', async () => {
  const payee = await open('/reports/empfaenger?empfaenger=recipient-a&zeitraum=1J');
  expect(payee.state.matches.at(-1)?.search).toMatchObject({ empfaenger: 'recipient-a', zeitraum: '1J' });
  const contact = await open('/reports/kontakte?kontakt=contact-a');
  expect(contact.state.matches.at(-1)?.search).toMatchObject({ kontakt: 'contact-a' });
  const router = await open('/plan/monat?monat=2026-08');
  await router.navigate({ to: '/reports/cashflow', search: { monat: '2026-08', trend: true } });
  expect(router.state.location.pathname).toBe('/reports/einnahmen-ausgaben');
  router.history.back();
  await router.load();
  expect(router.state.location.pathname).toBe('/plan/monat');
  await router.navigate({ to: '/reports/finanzcheck' });
  expect(router.state.location.pathname).toBe('/');
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
