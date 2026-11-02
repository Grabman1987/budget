// A2 positive browser bodies, using the real sample ledger and isolated import-detail fixture.
// Expected patterns: approved 00-bestand rows 1..54; bodies: s3-a2-body-bindings-20261031.md.
// Run each owned OFF/ON artifact separately with A2_EXPECT_REDESIGN=0/1; this never activates a flag.
// No spec imports, financial mocks/formulas, shared-ledger setup writes, timeout changes or skipped cases.
// Existing product rule derivation on reads is retained; no test POST changes SAMPLE state.
import type { Page, Locator } from '@playwright/test';
import { inboxItem, insertTracked, openDatabase } from '@budget/db';
import { sampleTest as test, expect } from './sample';
import { test as isolatedTest } from './isolated-ledger';
import { openPruefenSource } from './pruefen-part';

const on = process.env['A2_EXPECT_REDESIGN'] === '1';
const id = (p: Page, name: string) => expect(p.getByTestId(name)).toBeVisible();
const css = (p: Page, selector: string) => expect(p.locator(selector).first()).toBeVisible();
async function read<T>(p: Page, path: string): Promise<T> {
  const response = await p.request.get(path);
  expect(response.ok(), path).toBe(true);
  return (await response.json()) as T;
}
async function disclose(box: Locator) {
  if ((await box.getAttribute('open')) === null) await box.locator(':scope > summary').click();
  await expect(box).toHaveAttribute('open', '');
}
async function flag(p: Page) {
  await expect(p.locator('.app')).toHaveCount(1);
  if (on) await expect(p.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  else await expect(p.locator('.app')).not.toHaveAttribute('data-budget-redesign', '1');
}
async function journal(p: Page) {
  await expect(p.getByLabel('In Buchungen suchen', { exact: true })).toBeVisible();
  await expect(
    p
      .getByRole('table', { name: 'Alle Buchungen nach Tag', exact: true })
      .locator('tr[data-booking]')
      .first(),
  ).toBeVisible();
}
async function instrument(p: Page) {
  await css(p, '.instrument-detail[aria-label="ETF Welt"] .instrument-metadata');
  await css(p, '.instrument-detail .trade-list tr[data-trade-id]');
  await id(p, 'instrument-value-chart');
}
async function savings(p: Page) {
  const detail = p.getByRole('region', { name: 'Sparplandetails', exact: true });
  await expect(detail).toContainText('ETF Welt');
  await expect(detail).toContainText('01.10.2023 bis 31.12.2023');
  await expect(
    detail.getByRole('region', { name: 'Letzte zwölf Monate', exact: true }),
  ).toBeVisible();
  await disclose(detail.locator('.savings-versions'));
  await expect(detail.locator('.savings-history li')).toHaveCount(2);
  await expect(detail.locator('.savings-history li').first()).toContainText('01.01.2024 bis offen');
}
async function payrollHistory(p: Page) {
  const link = p.locator('.pp-history .pp-history-link').first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(p).toHaveURL(
    (u) => u.pathname === '/reports/gehalt/historie' && Boolean(u.searchParams.get('zettel')),
  );
  await expect(p.locator('.pp-slip table.rtable').first()).toContainText(
    'Brutto ohne zusätzliche Bezüge',
  );
  await expect(p.locator('.pp-slip table.rtable').first()).toContainText('Auszahlung');
}
async function assignment(p: Page) {
  const data = await read<{ rules: { name: string }[] }>(p, '/api/assignment-rules');
  await expect(
    p.locator('.assignment-page').getByRole('button', { name: 'Regel erstellen', exact: true }),
  ).toBeVisible();
  if (data.rules.length)
    await expect(
      p.getByRole('table', { name: 'Reihenfolge und Status der Zuordnungsregeln', exact: true }),
    ).toContainText(data.rules[0]!.name);
  else
    await expect(
      p.getByText(
        'Noch keine Regeln. Erstelle eine Regel oder lerne sie aus einer kategorisierten Bankbuchung.',
        { exact: true },
      ),
    ).toBeVisible();
}
async function basket(p: Page) {
  const data = await read<{ categories: { id: string; name: string }[] }>(
    p,
    '/api/inflation-basket',
  );
  const rent = data.categories.find((c) => c.id === 'cat-miete');
  expect(rent, 'real sample rent category').toBeDefined();
  await expect(
    p
      .getByTestId('basket-category-cat-miete')
      .getByLabel(`Zählt mit: ${rent!.name}`, { exact: true }),
  ).toBeVisible();
  await css(p, '.basket-settings .basket-summary');
}
async function projects(p: Page) {
  const data = await read<{ projects: { name: string }[] }>(p, '/api/projects');
  expect(data.projects.length, 'real sample projects').toBeGreaterThan(0);
  await expect(p.locator('.pp-settings').getByLabel('Projektname', { exact: true })).toBeVisible();
  await expect(p.locator('.pp-settings .pp-scroll table')).toContainText(data.projects[0]!.name);
}
const probes = {
  heute: (p: Page) =>
    expect(p.getByRole('region', { name: 'Spielraum bis Gehalt', exact: true })).toBeVisible(),
  dimension: async (p: Page) => {
    await css(p, '.heute-dimension .heute-breakdown a[href="/konten/acc-giro"]');
    await expect(p.locator('#dimension-title')).toHaveText('Liquidität');
  },
  capture: (p: Page) =>
    expect(
      p
        .getByRole('dialog', { name: 'Buchung erfassen', exact: true })
        .getByLabel('Betrag', { exact: true }),
    ).toBeVisible(),
  search: (p: Page) => css(p, '#search-query'),
  plan: (p: Page) => css(p, '.pname[data-category-id="cat-miete"]'),
  envelope: (p: Page) => css(p, '.activity-terms .activity-term'),
  income: (p: Page) => id(p, 'income-received'),
  year: async (p: Page) => {
    await expect(p.locator('.year-scenario-context')).toContainText('Einnahmen:');
    await expect(p.locator('.year-scenario-context')).toContainText('Konsum:');
  },
  expected: (p: Page) =>
    expect(p.locator('tr.prow').filter({ hasText: 'Gehalt' }).first()).toBeVisible(),
  payment: (p: Page) => css(p, '.xp-big'),
  goals: (p: Page) => id(p, 'goals-summary'),
  goal: async (p: Page) => {
    await expect(p.locator('#goal-detail-title')).toHaveText('Weihnachten 2026');
    await expect(
      p
        .locator('section[aria-labelledby="goal-detail-title"]')
        .getByRole('button', { name: 'Sparziel bearbeiten', exact: true }),
    ).toBeVisible();
  },
  forecast: (p: Page) => id(p, 'liquidity-lowpoint'),
  close: (p: Page) =>
    expect(p.locator('.month-close .close-body .close-step-help')).toContainText('Danach'),
  accounts: (p: Page) => id(p, 'budget-accounts-balance'),
  account: async (p: Page) => {
    await id(p, 'account-balance');
    await css(p, '.kacct-register tr[data-booking]');
  },
  journal,
  contacts: async (p: Page) => {
    // The immutable sample deliberately has no contact-bearing splits (ledger.test.ts).
    const data = await read<{ contacts: unknown[] }>(p, '/api/contacts?history=0');
    expect(data.contacts).toEqual([]);
    await expect(p.getByRole('button', { name: 'Neuer Kontakt', exact: true })).toBeVisible();
    await expect(p.locator('.contacts-page')).toContainText(
      'Keine offenen Kontaktbeträge. Ausgeglichene Kontakte bleiben mit ihrem Verlauf erhalten.',
    );
  },
  contact: async (p: Page) => {
    const data = await read<{ balanceCents: number; movements: unknown[] }>(
      p,
      '/api/contacts/con-muster',
    );
    expect(data.balanceCents).toBe(0);
    expect(data.movements).toEqual([]);
    const detail = p.getByRole('region', { name: 'Kontaktkontoauszug' });
    await expect(detail).toContainText('Kontakt M. Muster');
    await expect(detail.locator('.contacts-balance')).toHaveText('Ausgeglichen 0,00 €');
    await expect(
      detail.getByRole('button', { name: 'Rückzahlung buchen', exact: true }),
    ).toBeEnabled();
    await expect(detail).toContainText('In diesem Monat gibt es noch keine Kontaktbuchungen.');
    await expect(detail).toContainText('Noch keine ältere oder spätere Kontaktbewegung.');
  },
  networth: (p: Page) => id(p, 'nw-figure'),
  portfolio: (p: Page) => id(p, 'portfolio-overview-chart'),
  positions: async (p: Page) => {
    await id(p, 'portfolio-value');
    await css(p, '.portfolio-table tbody tr');
  },
  allocation: (p: Page) => css(p, '.vallo'),
  savingsList: (p: Page) =>
    expect(
      p
        .getByRole('region', { name: 'Sparpläne', exact: true })
        .getByRole('table')
        .locator('tbody tr')
        .first(),
    ).toBeVisible(),
  metrics: (p: Page) =>
    expect(p.getByRole('link', { name: 'Portfolio-Auswertung öffnen', exact: true })).toBeVisible(),
  instrument,
  savings,
  debts: (p: Page) => id(p, 'debt-total'),
  freedom: (p: Page) => id(p, 'freedom-chart'),
  hub: (p: Page) => expect(p.locator('.report-hub-list > li')).toHaveCount(16),
  reportGroup: (p: Page) => css(p, '.report-hub-list a[href="/reports/einnahmen-ausgaben"]'),
  onepager: (p: Page) => id(p, 'onepager-saved'), // Actual OnePagerSheet, not the unrelated rg-all table.
  // The hub opens the current (September) month, whose sample payslip is intentionally absent.
  // Its loaded historical payment rows still prove the real report; August's primary body is checked below.
  payroll: (p: Page) =>
    expect(
      p
        .getByRole('region', { name: 'Auszahlungen nach Kalenderjahr', exact: true })
        .locator('tbody tr')
        .first(),
    ).toBeVisible(),
  payrollHistory,
  sources: (p: Page) => css(p, '[data-testid="income-expense-sources"] .report-source-link'),
  settingsIndex: (p: Page) => css(p, '.settings-nav-index .settings-item-label'),
  profile: (p: Page) =>
    expect(p.locator('.profile-settings').getByLabel('Name', { exact: true })).toBeVisible(),
  security: (p: Page) =>
    expect(p.getByRole('button', { name: 'Abmelden', exact: true })).toBeVisible(),
  accountSettings: (p: Page) =>
    expect(p.locator('.accounts-name strong').filter({ hasText: 'Girokonto' })).toBeVisible(),
  depotSettings: (p: Page) =>
    expect(p.getByLabel('Einstandskostenmethode', { exact: true })).toBeEnabled(),
  categories: (p: Page) => css(p, '.cat-table .kname-btn'),
  category: async (p: Page) => {
    await expect(p.locator('#category-detail-title')).toHaveText('Lebensmittel');
    await expect(
      p
        .locator('section[aria-labelledby="category-detail-title"]')
        .getByRole('button', { name: 'Kategorie bearbeiten', exact: true }),
    ).toBeVisible();
  },
  rules: (p: Page) => css(p, '[data-rule-code="R07"]'),
  rule: async (p: Page) => {
    await css(p, '.rw-now[aria-label="Aktueller Stand"] .rw-action');
    await expect(p.locator('.rw-now')).toContainText('Schwelle:');
    await expect(p.locator('.rw nav [aria-current="page"]')).toContainText('R07');
  },
  assignment,
  dataSources: (p: Page) =>
    expect(p.locator('.data-sources .bank-connect')).toContainText(
      'Bank-Sync ist noch nicht eingerichtet.',
    ),
  assetClasses: (p: Page) => css(p, '.asset-class-table tbody tr'),
  basket,
  export: (p: Page) =>
    expect(p.getByRole('button', { name: 'ZIP-Export herunterladen', exact: true })).toBeVisible(),
  projects,
  incomeReport: (p: Page) => id(p, 'income-total'),
  incomeExpense: (p: Page) => id(p, 'income-expense-report'),
  cashflow: (p: Page) => id(p, 'cf-figure'),
  projectReport: (p: Page) => css(p, '[data-testid="projects-report"] .pp-project'),
  payees: (p: Page) => id(p, 'payee-total'),
  accuracy: (p: Page) =>
    css(p, '[data-testid="planning-accuracy"] section[aria-label="Trefferquote"]'),
  bankCosts: (p: Page) => id(p, 'bc-total'),
  wealthHistory: (p: Page) => id(p, 'wh-figure'),
  whole: (p: Page) => css(p, '[data-testid="whole-table"] tbody tr'),
  contributions: (p: Page) => id(p, 'contributions-end-value'),
  performance: (p: Page) => id(p, 'period-ttwror'),
  yearTemplate: (p: Page) =>
    css(p, '[data-testid="template-year"] table.ex-template-table tbody tr'),
  categoryTemplate: (p: Page) =>
    css(p, '[data-testid="template-category"] table.ex-template-table tbody tr'),
  totalTemplate: (p: Page) =>
    css(p, '[data-testid="template-total"] table.ex-template-table tbody tr'),
  spending: (p: Page) => id(p, 'sa-consumption'),
  flow: (p: Page) => id(p, 'sankey-chart'),
  savingsAge: async (p: Page) => {
    await id(p, 'savings-rate');
    await id(p, 'money-age');
  },
  adherence: (p: Page) => id(p, 'ba-over'),
  contracts: (p: Page) => id(p, 'co-bound'),
  inflation: (p: Page) => id(p, 'pi-rate'),
  assetsDebts: (p: Page) => id(p, 'ad-net'),
  depots: (p: Page) =>
    expect(p.getByTestId('depot-total').getByTestId('depot-value')).toBeVisible(),
  portfolioReport: (p: Page) => id(p, 'sunburst-classes'),
  costs: (p: Page) => id(p, 'costs-net'),
  explorer: (p: Page) => css(p, '[data-testid="ex-table"] tbody tr'),
  compare: (p: Page) => id(p, 'vg-consumption'),
  yearReport: (p: Page) => id(p, 'yr-income'),
  finanzcheck: (p: Page) => css(p, '.finanzcheck-report .fc-table tr[data-rule="R07"] .ov-cell'),
};
type Body = keyof typeof probes;
async function loaded(p: Page, path: string, body: Body) {
  await expect(p).toHaveURL((u) => u.pathname === path);
  await flag(p);
  await probes[body](p);
  await expect(p.getByRole('heading', { name: 'Report nicht gefunden', exact: true })).toHaveCount(
    0,
  );
}
async function reload(p: Page, path: string, body: Body) {
  const bookmark = p.url();
  await p.reload();
  await expect(p).toHaveURL(bookmark);
  await loaded(p, path, body);
}
const direct = [
  [1, '/?monat=2026-09&period=month', 'heute'],
  [2, '/heute/details/liquid?monat=2026-09&period=month', 'dimension'],
  [3, '/erfassen', 'capture'],
  [4, '/suche', 'search'],
  [5, '/plan/monat?monat=2026-09', 'plan'],
  [6, '/plan/monat/envelope/cat-miete?monat=2026-09', 'envelope'],
  [7, '/plan/monat/einnahmen?monat=2026-09', 'income'],
  [8, '/plan/jahr?monat=2026-01', 'year'],
  [9, '/plan/erwartet?monat=2026-09', 'expected'],
  [10, '/plan/erwartet/ep-gehalt?monat=2026-09', 'payment'],
  [11, '/plan/erwartet/einnahmen?monat=2026-09', 'income'],
  [12, '/plan/sparziele?monat=2026-09', 'goals'],
  [13, '/plan/sparziele/goal-weihnachten?monat=2026-09', 'goal'],
  [14, '/plan/prognose?monat=2026-09', 'forecast'],
  [15, '/monatsabschluss/2026-09', 'close'],
  [16, '/konten', 'accounts'],
  [17, '/konten/acc-giro', 'account'],
  [18, '/konten/buchungen?von=2026-09-01&bis=2026-09-17', 'journal'],
  [21, '/konten/kontakte', 'contacts'],
  [22, '/konten/kontakte/con-muster', 'contact'],
  [23, '/vermoegen/nettovermoegen', 'networth'],
  [24, '/vermoegen/portfolio', 'portfolio'],
  [25, '/vermoegen/portfolio/positionen', 'positions'],
  [26, '/vermoegen/portfolio/allokation', 'allocation'],
  [27, '/vermoegen/portfolio/sparplaene', 'savingsList'],
  [28, '/vermoegen/portfolio/kennzahlen', 'metrics'],
  [29, '/vermoegen/portfolio/instrument/sec-etfw?zeitraum=Alles', 'instrument'],
  [30, '/vermoegen/portfolio/sparplan/sp-etfw-1', 'savings'],
  [31, '/vermoegen/schulden', 'debts'],
  [32, '/vermoegen/freiheit', 'freedom'],
  [33, '/reports', 'hub'],
  [34, '/reports/gruppe/monat', 'reportGroup'],
  [35, '/reports/onepager?monat=2026-08', 'onepager'],
  [36, '/reports/gehalt/historie?monat=2026-08', 'payrollHistory'],
  [37, '/reports/einnahmen-ausgaben/buchungen?zeitraum=1J&zelle=inc&spalte=2025-09', 'sources'],
  [38, '/einstellungen', 'settingsIndex'],
  [39, '/einstellungen/profil', 'profile'],
  [40, '/einstellungen/sicherheit', 'security'],
  [41, '/einstellungen/konten', 'accountSettings'],
  [42, '/einstellungen/depots', 'depotSettings'],
  [43, '/einstellungen/kategorien', 'categories'],
  [44, '/einstellungen/kategorien/cat-lebensmittel', 'category'],
  [45, '/einstellungen/regelwerk?monat=2026-09', 'rules'],
  [46, '/einstellungen/regelwerk/R07?monat=2026-09', 'rule'],
  [47, '/einstellungen/zuordnung', 'assignment'],
  [48, '/einstellungen/datenquellen', 'dataSources'],
  [49, '/einstellungen/anlageklassen', 'assetClasses'],
  [50, '/einstellungen/warenkorb', 'basket'],
  [51, '/einstellungen/export', 'export'],
  [52, '/einstellungen/projekte', 'projects'],
] as const;
for (const [row, url, body] of direct)
  test(`A2 sample baseline ${row}: ${url}`, async ({ page }) => {
    const desktopIndex = row === 38 && page.viewportSize()!.width >= 768;
    const path = desktopIndex ? '/einstellungen/konten' : new URL(url, 'http://fixture').pathname;
    const expectedBody = desktopIndex ? 'accountSettings' : body;
    await page.goto(url);
    await loaded(page, path, expectedBody);
    await reload(page, path, expectedBody);
  });
// Literal #620 intents; a family default is never accepted for a nondefault view.
const reportAliases = [
  ['liquiditaet', '/plan/prognose', '', '', 'forecast'],
  ['einnahmen', '/reports/einnahmen-ausgaben', 'darstellung=income', 'Einnahmen', 'incomeReport'],
  ['cashflow', '/reports/einnahmen-ausgaben', 'darstellung=cashflow', 'Cashflow', 'cashflow'],
  [
    'projekte',
    '/reports/einnahmen-ausgaben',
    'darstellung=projekte',
    'Projekt-Ergebnisse',
    'projectReport',
  ],
  ['empfaenger', '/reports/ausgaben', 'darstellung=empfaenger', 'Empfänger', 'payees'],
  [
    'planungstreue',
    '/reports/budgettreue',
    'darstellung=planungstreue',
    'Planungstreue',
    'accuracy',
  ],
  ['kosten', '/reports/abos', 'darstellung=bankkosten', 'Bank- und Zinskosten', 'bankCosts'],
  [
    'vermoegen',
    '/reports/vermoegen-schulden',
    'darstellung=verlauf',
    'Vermögensverlauf',
    'wealthHistory',
  ],
  [
    'gesamtuebersicht',
    '/reports/vermoegen-schulden',
    'darstellung=gesamt',
    'Gesamtübersicht',
    'whole',
  ],
  [
    'peinzahlungen',
    '/reports/pallocation',
    'darstellung=einzahlungen',
    'Einzahlungen und Wert',
    'contributions',
  ],
  ['prendite', '/reports/pallocation', 'darstellung=rendite', 'Rendite & Risiko', 'performance'],
  ['jahresansicht', '/reports/explorer', 'vorlage=year', 'Jahresansicht', 'yearTemplate'],
  [
    'kategorien',
    '/reports/explorer',
    'vorlage=category',
    'Kategorie im Verlauf',
    'categoryTemplate',
  ],
  ['gesamttabelle', '/reports/explorer', 'vorlage=total', 'Gesamttabelle', 'totalTemplate'],
  ['vorschau', '/plan/erwartet', '', '', 'expected'],
  ['sparziele', '/plan/sparziele', '', '', 'goals'],
  ['kontakte', '/konten/kontakte', '', '', 'contacts'],
  [
    'finanzcheck',
    on ? '/reports/onepager' : '/',
    on ? 'darstellung=finanzcheck' : '',
    '',
    on ? 'finanzcheck' : 'heute',
  ],
] as const;
for (const [slug, path, intent, view, body] of reportAliases)
  test(`A2 report alias ${slug}`, async ({ page }) => {
    await page.goto('/plan/monat?monat=2026-08');
    await probes.plan(page);
    await page.goto(
      `/reports/${slug}?monat=2026-08&period=month&zeitraum=2026-01..2026-08#details`,
    );
    const check = async () => {
      await loaded(page, path, body);
      const url = new URL(page.url());
      expect(url.searchParams.get('monat')).toBe('2026-08');
      expect(url.searchParams.get('zeitraum')).toBe('2026-01..2026-08');
      expect(url.hash).toBe('#details');
      for (const [key, value] of new URLSearchParams(intent))
        expect(url.searchParams.get(key)).toBe(value);
      if (view)
        await expect(
          page.getByRole('button', { name: view, exact: true, pressed: true }),
        ).toBeVisible();
    };
    await check();
    await page.reload();
    await check();
    await page.goBack();
    await loaded(page, '/plan/monat', 'plan');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
  });
const fixedAliases = [
  ['/plan', '/plan/monat', 'plan', 'monat=2026-09'],
  ['/vermoegen', '/vermoegen/nettovermoegen', 'networth', ''],
  ['/einstellungen/import', '/einstellungen/export', 'export', ''],
] as const;
for (const [from, path, body, query] of fixedAliases)
  test(`A2 fixed alias ${from}`, async ({ page }) => {
    await page.goto('/plan/monat?monat=2026-08');
    await probes.plan(page);
    await page.goto(`${from}${query ? '?' + query : ''}#details`);
    await loaded(page, path, body);
    expect(new URL(page.url()).hash).toBe('#details');
    for (const [key, value] of new URLSearchParams(query))
      expect(new URL(page.url()).searchParams.get(key)).toBe(value);
    await reload(page, path, body);
    await page.goBack();
    await loaded(page, '/plan/monat', 'plan');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
  });
// Both literal sets retain current capabilities; this does not migrate Kontakte or pallocation.
const currentHub = [
  ['einnahmen-ausgaben', 'incomeExpense'],
  ['ausgaben', 'spending'],
  ['gehalt', 'payroll'],
  ['geldfluss', 'flow'],
  ['sparquote', 'savingsAge'],
  ['budgettreue', 'adherence'],
  ['abos', 'contracts'],
  ['inflation', 'inflation'],
  ['vermoegen-schulden', 'assetsDebts'],
  ['pdepots', 'depots'],
  ['pallocation', 'portfolioReport'],
  ['psteuern', 'costs'],
  ['explorer', 'explorer'],
  ['vergleich', 'compare'],
  ['onepager', 'onepager'],
  ['jahresreport', 'yearReport'],
] as const;
for (const [name, body] of currentHub)
  test(`A2 current hub entry ${name}`, async ({ page }) => {
    await page.goto('/reports');
    await probes.hub(page);
    await page.locator(`.report-hub-list a[href="/reports/${name}"]`).click();
    await loaded(page, `/reports/${name}`, body);
    await reload(page, `/reports/${name}`, body);
  });
function seedImports(databasePath: string) {
  const opened = openDatabase(databasePath);
  try {
    for (const [key, date, reason] of [
      ['history', '2026-09-30', 'mapping_required'],
      ['check-a', '2026-10-01', 'mapping_required'],
      ['check-b', '2026-10-02', 'mapping_required'],
      ['format', '2026-10-02', 'schema'],
    ]) {
      insertTracked(
        opened.db,
        inboxItem,
        {
          id: key!,
          kind: 'import',
          title: 'Quellsaldo: Synthetische Datenprüfung',
          refType: 'read_source',
          refId: 'synthetic-source',
          detail: JSON.stringify({ reason, source: { id: key } }),
          createdAt: `${date}T12:00:00.000Z`,
        },
        { actor: 'e2e' },
      );
    }
  } finally {
    opened.close();
  }
}
async function importBody(p: Page, detail: boolean) {
  if (detail) {
    await expect(p.getByTestId('inbox-row')).toContainText('Quellsaldo: Synthetische Datenprüfung');
    await disclose(p.locator('.source-inbox-detail').locator('details'));
    await expect(p.locator('.source-inbox-detail pre')).toContainText('check-a');
    await expect(p.getByRole('link', { name: 'Datenquelle prüfen', exact: true })).toBeVisible();
  } else {
    if ((await p.getByLabel('Zeitraum der Aufgaben').inputValue()) !== 'current')
      await p.getByLabel('Zeitraum der Aufgaben').selectOption('current');
    await openPruefenSource(p, 'Weitere Aufgaben');
    const group = p.getByRole('button', { name: /Synthetische Datenprüfung.*2 Aufgaben/ });
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
    await expect(p.getByTestId('inbox-row')).toHaveCount(3);
  }
}
for (const [label, url, path, detail] of [
  [19, '/konten/pruefen', '/konten/pruefen', false],
  [20, '/konten/pruefen/check-a', '/konten/pruefen/check-a', true],
  ['alias-list', '/konten/posteingang', '/konten/pruefen', false],
  ['alias-detail', '/konten/posteingang/check-a', '/konten/pruefen/check-a', true],
] as const)
  isolatedTest(`A2 isolated import ${label}`, async ({ page, isolatedLedger }) => {
    seedImports(isolatedLedger.databasePath);
    const data = await read<{ entry: { id: string; kind: string } }>(
      page,
      `${isolatedLedger.origin}/api/inbox/check-a`,
    );
    expect(data.entry).toMatchObject({ id: 'check-a', kind: 'import' });
    await page.goto('/konten/pruefen');
    await importBody(page, false);
    const search = new URL(page.url()).search;
    await page.goto('/plan/monat?monat=2026-09');
    await page.goto(`${url}${search}#details`);
    await expect(page).toHaveURL((u) => u.pathname === path);
    await flag(page);
    await importBody(page, detail);
    expect(new URL(page.url()).search).toBe(search);
    expect(new URL(page.url()).hash).toBe('#details');
    const bookmark = page.url();
    await page.reload();
    await expect(page).toHaveURL(bookmark);
    await importBody(page, detail);
    await page.goBack();
    await expect(page).toHaveURL(
      (u) => u.pathname === '/plan/monat' && u.searchParams.get('monat') === '2026-09',
    );
    await page.goForward();
    await expect(page).toHaveURL(bookmark);
    await importBody(page, detail);
    if (detail) {
      await page.getByRole('link', { name: 'Zurück zu Prüfen', exact: true }).click();
      await expect(page).toHaveURL((u) => u.pathname === '/konten/pruefen');
    }
  });
test('A2 unknown report is explicit, not a home fallback', async ({ page }) => {
  await page.goto('/reports/not-a-report-a2');
  await expect(page).toHaveURL((u) => u.pathname === '/reports/not-a-report-a2');
  await expect(
    page.getByRole('heading', { name: 'Report nicht gefunden', exact: true }),
  ).toBeVisible();
});

test('A2 salary retains its populated August primary body as well as the current-month history', async ({
  page,
}) => {
  await page.goto('/reports/gehalt?monat=2026-08');
  await loaded(page, '/reports/gehalt', 'payroll');
  await expect(page.getByRole('group', { name: 'Brutto zu Netto', exact: true })).toBeVisible();
  await reload(page, '/reports/gehalt', 'payroll');
  await expect(page.getByRole('group', { name: 'Brutto zu Netto', exact: true })).toBeVisible();
});

test('A2 zero-balance sample contacts remain reachable through the actual retained history filter', async ({
  page,
}) => {
  await page.goto('/konten/kontakte?verlauf=1');
  await flag(page);
  const link = page
    .locator('.contacts-table')
    .getByRole('link', { name: 'Kontakt M. Muster', exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/konten/kontakte/con-muster' && url.searchParams.get('verlauf') === '1',
  );
  await probes.contact(page);
  await reload(page, '/konten/kontakte/con-muster', 'contact');
});

test('A2 an unknown presentation keeps the real default OnePager and cannot fabricate Finanzcheck', async ({
  page,
}) => {
  await page.goto('/reports/onepager?monat=2026-08&darstellung=unknown-a2');
  await loaded(page, '/reports/onepager', 'onepager');
  await expect(page.locator('.finanzcheck-report')).toHaveCount(0);
  await reload(page, '/reports/onepager', 'onepager');
});
test('A2 missing saved Explorer identity never silently becomes its template', async ({ page }) => {
  await page.goto(
    '/reports/kategorien?ansicht=missing-view-620&exakt=true&zeitraum=3M&kategorien=%5B%22food%22%5D',
  );
  await expect(page).toHaveURL(
    (u) =>
      u.pathname === '/reports/explorer' && u.searchParams.get('ansicht') === 'missing-view-620',
  );
  await expect(
    page.getByText('Diese gespeicherte Auswertung ist nicht mehr verfügbar.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('template-category')).toHaveCount(0);
});
// MATRIX: SAMPLE baseline 1–18,21–52 (50); isolated real import 19,20 (2); auth53,54 existing actual auth.spec.ts; currentHub16 + aliases23 above; planned16 reuse the same real current destinations (Kontakte: baseline21/alias, other15: hub entries) and the separate actual-router identity contract; dev6 excluded from this authenticated content draft, retained by separate mode/inventory proof.
