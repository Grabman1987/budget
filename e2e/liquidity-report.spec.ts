import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, type Page, type TestInfo } from '@playwright/test';
import type { LiquidityReportView } from '@budget/db';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test } from './sample';

// The forecast is rebuilt after every write; the shared test machine can be slow.
const expect = baseExpect.configure({ timeout: 15_000 });
test.beforeEach(() => test.slow());

async function api(page: Page, path: string) {
  const res = await page.request.get(path);
  expect(res.status()).toBe(200);
  return (await res.json()) as LiquidityReportView;
}

async function inspect(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: info.outputPath(`${label}-${theme}.png`),
    });
  }
}

test('figures, verdict, chart and tables agree with the forecast API', async ({ page }, info) => {
  const view = await api(page, '/api/liquidity?horizon=6m');
  const report = view.report!;
  await page.goto('/reports/liquiditaet');
  await expect(
    page.getByRole('heading', { name: 'Budget-Konten · nächste 6 Monate' }),
  ).toBeVisible();
  await expect(page.getByTestId('liq-start')).toHaveText(eur(report.startCents));
  await expect(page.getByTestId('liq-low')).toHaveText(eur(report.low!.cents));
  await expect(page.getByTestId('liq-low-buffer')).toHaveText(eur(report.lowBuffer!.cents));
  await expect(page.getByTestId('liq-low-plain')).toHaveText(eur(report.lowPlain!.cents));
  await expect(page.getByTestId('liq-verdict')).toContainText(
    report.verdict.status === 'ok'
      ? 'Geht sich aus'
      : report.verdict.status === 'warn'
        ? 'Geht sich knapp aus'
        : 'Geht sich nicht aus',
  );
  await expect(page.getByTestId('liquidity-chart')).toBeVisible();
  // the month outlook chains: each month starts where the one before ended
  const rows = page.getByTestId('liq-outlook').locator('tbody tr');
  await expect(rows).toHaveCount(report.months.length);
  await expect(rows.first().locator('td').nth(1)).toHaveText(eur(report.startCents));
  await expect(rows.last().locator('td').nth(6)).toContainText(eur(report.months.at(-1)!.endCents));
  for (const e of view.events.filter((x) => x.status === 'in_horizon'))
    await expect(page.getByTestId('liq-event').filter({ hasText: e.name })).toBeVisible();
  await inspect(page, info, 'liquidity');
});

test('horizon and levers change the forecast like the API says', async ({ page }) => {
  const plain = (await api(page, '/api/liquidity?horizon=90d')).report!;
  const trimmed = (await api(page, '/api/liquidity?horizon=90d&levers=trim-variable')).report!;
  expect(trimmed.low!.cents).toBeGreaterThan(plain.low!.cents);
  await page.goto('/reports/liquiditaet');
  await page.getByRole('button', { name: '90 Tage' }).click();
  await expect(
    page.getByRole('heading', { name: 'Budget-Konten · nächste 90 Tage' }),
  ).toBeVisible();
  await expect(page.getByTestId('liq-low')).toHaveText(eur(plain.low!.cents));
  const gain = plain.levers.find((l) => l.id === 'trim-variable')!.gainCents;
  await expect(page.getByTestId('lever-gain-trim-variable')).toContainText(
    eur(gain, { cents: false, sign: true }),
  );
  await page.getByRole('checkbox', { name: /Variable Ausgaben um 10 % senken/ }).check();
  await expect(page.getByTestId('lever-gain-trim-variable')).toHaveText('aktiv');
  await expect(page.getByTestId('liq-low')).toHaveText(eur(trimmed.low!.cents));
});

test('a planned event can be added, switched off and removed', async ({ page }, info) => {
  const name = `E2E Ereignis ${info.project.name} ${Date.now()}`;
  await page.goto('/reports/liquiditaet');
  // beyond 12 months: stored, but the shared sample forecast stays as it is
  await page.getByLabel('Ereignis', { exact: true }).fill(name);
  await page.getByLabel('Datum').fill('2028-01-15');
  await page.getByLabel('Betrag').fill('1.234,56');
  await page.getByRole('button', { name: 'Ereignis', exact: true }).click();
  const row = page.getByTestId('liq-event').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText('−1.234,56 €');
  await expect(row).toContainText('nach dem Prognosezeitraum');
  await row.getByRole('switch').click();
  await expect(row).toContainText('ausgeschaltet');
  await row.getByRole('button', { name: `${name} entfernen` }).click();
  await expect(row).toHaveCount(0);
});

test('refuses an incomplete event', async ({ page }) => {
  await page.goto('/reports/liquiditaet');
  await page.getByRole('button', { name: 'Ereignis', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'benennen' })).toBeVisible();
});
