import AxeBuilder from '@axe-core/playwright';
import { openDatabase, type PortfolioSummary } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-12-31' });

async function privacy(page: Page, hidden: boolean) {
  const profile = page.locator('.m-profile summary');
  const mobile = await profile.isVisible();
  if (mobile) await profile.click();
  const toggle = page.getByRole('button', { name: 'Beträge verbergen', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', String(hidden));
  if (mobile) await profile.press('Escape');
}

async function compactDesktop(page: Page, info: TestInfo, state: string) {
  if (info.project.name !== 'desktop') return;
  expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
  const geometry = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth }));
  await info.attach(state, { body: JSON.stringify(geometry), contentType: 'application/json' });
  expect(geometry.height).toBeLessThanOrEqual(1800);
}

function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date)
        VALUES ('depot','Synthetic depot','brokerage','investment',0,'2025-12-31');
      INSERT INTO security (id,name,kind) VALUES ('s','Synthetic holding','fund'),('benchmark-ftse','Synthetic index','etf');
      INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents)
        VALUES ('opening','s','depot','2025-12-31',100000000,10000);
      INSERT INTO trade (id,security_id,account_id,date,kind,units_e8,amount_cents)
        VALUES ('deposit','s','depot','2026-12-31','buy',100000000,10000);
      WITH RECURSIVE days(day) AS (
        VALUES ('2025-12-31') UNION ALL SELECT date(day,'+1 day') FROM days WHERE day<'2026-12-31'
      ) INSERT INTO price (security_id,date,price_micro,currency,source)
        SELECT 's',day,CASE WHEN day='2026-12-31' THEN 110000000 ELSE 100000000 END,'EUR','manual' FROM days;
      INSERT INTO price (security_id,date,price_micro,currency,source)
        SELECT 'benchmark-ftse',date,CASE WHEN date='2026-12-31' THEN 105000000 ELSE 100000000 END,'EUR','manual'
        FROM price WHERE security_id='s';
      INSERT INTO app_setting (id,value) VALUES ('portfolio.benchmark_ids','["benchmark-ftse"]');
    `);
  } finally { opened.close(); }
}

function snapshot(path: string) {
  const opened = openDatabase(path);
  try {
    return JSON.stringify({
      trades: opened.sqlite.prepare('SELECT * FROM trade ORDER BY id').all(),
      holdings: opened.sqlite.prepare('SELECT * FROM holding ORDER BY id').all(),
      settings: opened.sqlite.prepare('SELECT * FROM app_setting ORDER BY id').all(),
      audit: opened.sqlite.prepare('SELECT * FROM audit_log ORDER BY id').all(),
    });
  } finally { opened.close(); }
}

test('546 metrics share the report period and literal deposit-neutral return, flows and benchmark base', async ({ page, isolatedLedger }, info) => {
  seed(isolatedLedger.databasePath);
  const before = snapshot(isolatedLedger.databasePath);
  const response = await page.request.get('/api/portfolio?period=YTD&view=securities&history=performance&provenance=valuation-v1');
  expect(response.ok()).toBe(true);
  const { portfolio } = await response.json() as { portfolio: PortfolioSummary };
  expect(portfolio.performance).toMatchObject({ from: '2025-12-31', to: '2026-12-31', startValueCents: 10000, contributionsCents: 10000, endValueCents: 22000 });
  expect(portfolio.performance!.ttwror).toBeCloseTo(0.1, 12);
  expect(portfolio.performance!.ttwrorAnnualised).toBeCloseTo(0.1, 12);
  expect(portfolio.performance!.xirr).toBeCloseTo(0.2, 6);
  expect(portfolio.benchmarks[0]!.dailyBenchmark[0]).toMatchObject({ date: '2025-12-31', benchmark: 100 });
  expect(portfolio.benchmarks[0]!.dailyBenchmark.at(-1)).toMatchObject({ date: '2026-12-31', benchmark: 105 });

  await page.goto('/vermoegen/portfolio/kennzahlen?zeitraum=YTD');
  const metrics = page.getByRole('region', { name: 'Kennzahlen', exact: true });
  await expect(metrics.getByTestId('metrics-period-ttwror')).toHaveText('+10,0 %');
  await expect(metrics.getByTestId('metrics-annual-ttwror')).toHaveText('+10,0 %');
  await expect(metrics.getByTestId('metrics-xirr')).toHaveText('+20,0 %');
  await expect(metrics).not.toContainText('Modified Dietz');
  const comparison = metrics.getByRole('table', { name: /Kursindex, ohne Ausschüttungen/ });
  await expect(comparison).toContainText('gleicher Zeitraum und gleiche Startbasis');
  await expect(comparison.getByRole('row').nth(1)).toContainText('+5,0 %');
  await expect(comparison.getByRole('row').nth(1)).toContainText('+5,0 Pp');
  await metrics.locator('.portfolio-flow-table summary').click();
  const flows = metrics.getByRole('table', { name: 'Tatsächliche Geldflüsse nach Steuern im gewählten Zeitraum' });
  await expect(flows.getByRole('row').nth(1)).toContainText('31.12.2026');
  await expect(flows.getByRole('row').nth(1)).toContainText('+100,00 €');
  await expect(flows.getByRole('row').nth(1)).toContainText('0,00 €');
  await expect(metrics.locator('.portfolio-flow-table')).toContainText('nicht die Rendite-Zahlungsströme');
  for (const term of ['Volatilität', 'Max. Rückgang', 'Sharpe']) {
    const trigger = metrics.getByRole('button', { name: term, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="tooltip"]:popover-open')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset['theme'] = value; }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('main button, main a, main summary').all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    await metrics.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`metrics-${theme}.png`), fullPage: false });
    await compactDesktop(page, info, `metrics-open-flow-${theme}`);
    const riskValues = await metrics.locator('.portfolio-metrics-grid dd').allTextContents();
    await privacy(page, true);
    for (const id of ['metrics-period-ttwror', 'metrics-annual-ttwror', 'metrics-xirr']) {
      await expect(metrics.getByTestId(id)).toHaveText('•••');
    }
    await expect(comparison.getByRole('row').nth(1).getByRole('cell')).toHaveText(['•••', '•••']);
    await expect(metrics.locator('.portfolio-metrics-grid dd')).toHaveText(riskValues.map(value => value === '–' ? '–' : '•••'));
    await expect(flows.getByRole('row').nth(1).getByRole('cell')).toHaveText(['••• €', '••• €']);
    await expect(flows.getByRole('row').nth(1)).toContainText('31.12.2026');
    await metrics.locator('.portfolio-flow-table summary').click();
    await expect(flows).not.toBeVisible();
    await metrics.locator('.portfolio-flow-table summary').click();
    await expect(flows.getByRole('row').nth(1).getByRole('cell')).toHaveText(['••• €', '••• €']);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`metrics-private-${theme}.png`), fullPage: false });
    await privacy(page, false);
    await expect(metrics.getByTestId('metrics-period-ttwror')).toHaveText('+10,0 %');
    await expect(metrics.getByTestId('metrics-annual-ttwror')).toHaveText('+10,0 %');
    await expect(metrics.getByTestId('metrics-xirr')).toHaveText('+20,0 %');
    await expect(metrics.locator('.portfolio-metrics-grid dd')).toHaveText(riskValues);
    await expect(comparison.getByRole('row').nth(1)).toContainText('+5,0 Pp');
    await expect(flows.getByRole('row').nth(1)).toContainText('+100,00 €');
  }
  await metrics.getByRole('link', { name: 'Portfolio-Auswertung öffnen' }).click();
  await expect(page).toHaveURL(/\/reports\/prendite\?zeitraum=YTD$/);
  await expect(page.getByTestId('period-ttwror')).toHaveText('+10 %');
  await expect(page.locator('.performance-metrics dd').nth(0)).toHaveText('+10 %');
  await expect(page.locator('.performance-metrics dd').nth(1)).toHaveText(/^\+20 %\s*actual\/365$/);
  expect(snapshot(isolatedLedger.databasePath)).toBe(before);
});

test('546 representative thirteen-date cash-flow table stays within two desktop screens when open', async ({ page, isolatedLedger }, info) => {
  seed(isolatedLedger.databasePath);
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    const insert = opened.sqlite.prepare("INSERT INTO trade (id,security_id,account_id,date,kind,units_e8,amount_cents) VALUES (?,'s','depot',?,'buy',100000000,10000)");
    for (let month = 1; month <= 12; month++) insert.run(`monthly-${month}`, `2026-${String(month).padStart(2, '0')}-15`);
  } finally { opened.close(); }
  const before = snapshot(isolatedLedger.databasePath);
  await page.goto('/vermoegen/portfolio/kennzahlen?zeitraum=YTD');
  const details = page.locator('.portfolio-flow-table');
  await details.locator('summary').click();
  await expect(details.locator('tbody tr')).toHaveCount(13);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset['theme'] = value; }, theme);
    await compactDesktop(page, info, `metrics-thirteen-open-flows-${theme}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`metrics-thirteen-open-flows-${theme}.png`), fullPage: false });
  }
  expect(snapshot(isolatedLedger.databasePath)).toBe(before);
});

test('546 missing benchmark close stays unavailable and an empty saved selection stays empty', async ({ page, isolatedLedger }) => {
  seed(isolatedLedger.databasePath);
  const opened = openDatabase(isolatedLedger.databasePath);
  try { opened.sqlite.exec("DELETE FROM price WHERE security_id='benchmark-ftse' AND date='2026-12-31'"); }
  finally { opened.close(); }
  await page.goto('/vermoegen/portfolio/kennzahlen?zeitraum=YTD');
  const metrics = page.getByRole('region', { name: 'Kennzahlen', exact: true });
  await expect(metrics.getByTestId('metrics-period-ttwror')).toHaveText('+10,0 %');
  await expect(metrics.getByRole('table', { name: /Kursindex, ohne Ausschüttungen/ }).getByRole('row').nth(1).getByRole('cell')).toHaveText(['–', '–']);
  await expect(metrics).toContainText('Lücken werden nicht interpoliert');
  const db = openDatabase(isolatedLedger.databasePath);
  try { db.sqlite.exec("DELETE FROM app_setting WHERE id='portfolio.benchmark_ids'"); }
  finally { db.close(); }
  await page.reload();
  await expect(metrics).toContainText('Keine Benchmark gewählt');
  await expect(metrics.getByRole('link', { name: 'Benchmarks auswählen' })).toHaveAttribute('href', '/einstellungen/depots#benchmark-settings-title');
});
