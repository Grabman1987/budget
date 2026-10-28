import { expect, sampleTest as test } from './sample';

// Literal owner #487 mapping; these expectations do not read the router's alias table.
const landings = [
  ['onepager', '/reports/onepager', ''],
  ['gehalt', '/reports/gehalt', ''],
  ['einnahmen', '/reports/einnahmen-ausgaben', 'Einnahmen'],
  ['geldfluss', '/reports/geldfluss', ''],
  ['jahresansicht', '/reports/explorer', 'Jahresansicht'],
  ['kategorien', '/reports/explorer', 'Kategorie im Verlauf'],
  ['sparquote', '/reports/sparquote', ''],
  ['gesamttabelle', '/reports/explorer', 'Gesamttabelle'],
  ['projekte', '/reports/einnahmen-ausgaben', 'Projekt-Ergebnisse'],
  ['einnahmen-ausgaben', '/reports/einnahmen-ausgaben', 'Einnahmen und Ausgaben'],
  ['planungstreue', '/reports/budgettreue', 'Planungstreue'],
  ['ausgaben', '/reports/ausgaben', 'Gruppen und Kategorien'],
  ['budgettreue', '/reports/budgettreue', 'Plan und Ist'],
  ['abos', '/reports/abos', 'Verträge'],
  ['inflation', '/reports/inflation', ''],
  ['empfaenger', '/reports/ausgaben', 'Empfänger'],
  ['kosten', '/reports/abos', 'Bank- und Zinskosten'],
  ['liquiditaet', '/plan/prognose', ''],
  ['cashflow', '/reports/einnahmen-ausgaben', 'Cashflow'],
  ['vermoegen', '/reports/vermoegen-schulden', 'Vermögensverlauf'],
  ['vorschau', '/plan/erwartet', ''],
  ['sparziele', '/plan/sparziele', ''],
  ['vermoegen-schulden', '/reports/vermoegen-schulden', 'Vermögen und Schulden'],
  ['pdepots', '/reports/pdepots', ''],
  ['pallocation', '/reports/pallocation', 'Verteilung über Zeit'],
  ['peinzahlungen', '/reports/pallocation', 'Einzahlungen und Wert'],
  ['prendite', '/reports/pallocation', 'Rendite & Risiko'],
  ['psteuern', '/reports/psteuern', ''],
  ['jahresreport', '/reports/jahresreport', ''],
  ['finanzcheck', '/', ''],
  ['explorer', '/reports/explorer', ''],
  ['kontakte', '/konten/kontakte', ''],
  ['vergleich', '/reports/vergleich', ''],
  ['gesamtuebersicht', '/reports/vermoegen-schulden', 'Gesamtübersicht'],
] as const;

for (const [slug, target, view] of landings) {
  test(`620 ${slug} opens ${target} with its supported bookmark state`, async ({ page }) => {
    // An explicit Heute period avoids its existing other-month normalization.
    const todayPeriod = slug === 'finanzcheck' ? '&period=month' : '';
    await page.goto(
      `/reports/${slug}?monat=2026-08&zeitraum=2026-01..2026-08${todayPeriod}#details`,
    );
    await expect.poll(() => new URL(page.url()).pathname).toBe(target);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Report nicht gefunden', exact: true }),
    ).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('2026-01..2026-08');
    expect(new URL(page.url()).hash).toBe('#details');
    if (view)
      await expect(
        page.getByRole('button', { name: view, exact: true, pressed: true }),
      ).toBeVisible();
    const bookmark = page.url();
    await page.reload();
    await expect(page).toHaveURL(bookmark);
    if (view)
      await expect(
        page.getByRole('button', { name: view, exact: true, pressed: true }),
      ).toBeVisible();
  });
}

test('620 absent Heute period uses the same normalization through the alias and the direct target', async ({
  page,
}) => {
  for (const path of ['/', '/reports/finanzcheck']) {
    await page.goto(`${path}?monat=2026-08&zeitraum=2026-01..2026-08#details`);
    await expect.poll(() => new URL(page.url()).searchParams.get('period')).toBe('month');
    expect(new URL(page.url()).pathname).toBe('/');
    expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-08');
    expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('2026-01..2026-08');
    expect(new URL(page.url()).hash).toBe('');
  }
});

test('620 aliases preserve exact Explorer state and a missing saved view takes precedence over the template', async ({
  page,
}) => {
  await page.goto(
    '/reports/kategorien?ansicht=missing-view-620&exakt=true&zeitraum=3M&kategorien=%5B%22food%22%5D',
  );
  await expect.poll(() => new URL(page.url()).pathname).toBe('/reports/explorer');
  expect(new URL(page.url()).searchParams.get('vorlage')).toBe('category');
  expect(new URL(page.url()).searchParams.get('ansicht')).toBe('missing-view-620');
  expect(new URL(page.url()).searchParams.get('exakt')).toBe('true');
  await expect(
    page.getByText('Diese gespeicherte Auswertung ist nicht mehr verfügbar.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('template-category')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'CSV exportieren', exact: true })).toHaveCount(0);
  await page.reload();
  expect(new URL(page.url()).searchParams.get('ansicht')).toBe('missing-view-620');
  await expect(page.getByTestId('template-category')).toHaveCount(0);
});

test('620 a malformed project bookmark keeps its invalid scope after reload', async ({ page }) => {
  await page.goto('/reports/projekte?projekt=&zeitraum=2026-08..2026-08');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/reports/einnahmen-ausgaben');
  await expect(page.getByRole('combobox', { name: 'Projektfilter', exact: true })).toHaveValue(
    '__invalid__',
  );
  await expect(page.getByTestId('projects-report')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Projektfilter', exact: true })).toHaveValue(
    '__invalid__',
  );
  await expect(page.getByTestId('projects-report')).toHaveCount(0);
});

test('620 browser Back returns to Plan through the replaced alias without a redirect cycle', async ({
  page,
}) => {
  await page.goto('/plan/monat?monat=2026-08');
  await page.goto('/reports/cashflow?monat=2026-08&zeitraum=3M&trend=true');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/reports/einnahmen-ausgaben');
  await expect(page.getByTestId('cf-figure')).toBeVisible();
  await expect(page.getByTestId('report-trend-line').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-08$/);
});
