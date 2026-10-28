import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { cents, formatEuro } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GoalView } from '../apps/web/src/budget/goals-api';
import { sampleTest } from './sample';
test.describe.configure({ timeout: 90_000 });
const goal = (patch: Partial<GoalView> = {}): GoalView => ({
  id: 'travel-goal',
  name: 'Reiseziel',
  categoryId: 'travel',
  accountId: null,
  targetCents: 300000,
  targetDate: '2027-07-31',
  note: null,
  savedCents: 85000,
  remainingCents: 215000,
  monthsLeft: 10,
  neededMonthlyCents: 21500,
  averageRateCents: 25000,
  forecastMonth: '2027-06',
  status: 'on_track',
  ...patch,
});
const account = goal({
  id: 'account-goal',
  name: 'Reserve',
  categoryId: null,
  accountId: 'reserve',
  targetCents: 100000,
  targetDate: '2027-03-31',
  savedCents: 30000,
  remainingCents: 70000,
  monthsLeft: 6,
  neededMonthlyCents: 11667,
  averageRateCents: 10000,
  forecastMonth: '2027-04',
  status: 'behind',
});
const categories = [{ id: 'travel', name: 'Reisen', class: 'want' }];
const accounts = [{ id: 'reserve', name: 'Reservekonto', currency: 'EUR' }];
async function mock(page: Page, goals: GoalView[], cats = categories, accts = accounts) {
  await page.route('**/api/goals/report', (r) =>
    r.fulfill({
      json: {
        month: '2026-09',
        reserveCents: 30000,
        coverage: { averageNeedCents: 10000, tenthsOfMonth: 30, months: 12 },
        cash: [],
        history: [],
        reserveComplete: true,
      },
    }),
  );
  await page.route(/\/api\/goals(?:\?month=.*)?$/, (r) =>
    r.fulfill({ json: { month: '2026-09', goals } }),
  );
  await page.route('**/api/categories', (r) =>
    r.fulfill({ json: { groups: [], categories: cats, targets: [] } }),
  );
  await page.route('**/api/accounts?asOf=*', (r) => r.fulfill({ json: { accounts: accts } }));
}
async function inspect(page: Page, info: TestInfo, label: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
    document.querySelector('.goals-report-scroll')?.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      })),
    ).toEqual({ width: info.project.use.viewport!.width, overflow: false });
    const dir = process.env['BUDGET_GOALS_REPORT_EVIDENCE'];
    if (dir) mkdirSync(dir, { recursive: true });
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: dir
        ? join(dir, `${label}-${theme}-${info.project.name}.png`)
        : info.outputPath(`${label}-${theme}.png`),
    });
  }
}
// Retired aggregate renderer/source-boundary checks live in goals-progress-retained-620.test.tsx.
// The live Plan detail still uses GoalDetail and the same guarded source query.
test('goal bookmark opens Plan and retains literal figures, keyboard detail and source cutoffs', async ({ page }, info) => {
  await mock(page, [goal(), account]);
  await page.goto('/reports/sparziele?monat=2026-09');
  await expect(page).toHaveURL(/\/plan\/sparziele\?monat=2026-09$/);
  const rows = page.locator('.goals tr.prow');
  const travel = rows.filter({ hasText: 'Reiseziel' });
  for (const value of ['3.000,00 €', '850,00 €', '2.150,00 €', '215,00 €']) await expect(travel).toContainText(value);
  const trigger = travel.getByRole('link', { name: 'Reiseziel', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/plan\/sparziele\/travel-goal\?monat=2026-09$/);
  const detail = page.locator('.goal-report-detail');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const value of ['3.000,00 €', '850,00 €', '2.150,00 €', '215,00 €', '250,00 €']) await expect(detail).toContainText(value);
  await expect(detail).toContainText('Prognose: Jun 2027');
  await expect(detail.getByRole('link', { name: 'Buchungen der Quelle öffnen' })).toHaveAttribute('href', /kategorie=travel.*bis=2026-09-30/);
  await expect(detail.getByRole('link', { name: 'Zuweisungen im Plan öffnen' })).toHaveAttribute('href', /monat=2026-09/);
  const back = page.getByRole('link', { name: 'Zurück zu Sparzielen', exact: true });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await page.locator('.goals').getByRole('link', { name: 'Reserve', exact: true }).click();
  await expect(detail).toContainText('116,67 €');
  await expect(detail).toContainText('Apr 2027');
  await expect(detail.getByRole('link', { name: 'Buchungen der Quelle öffnen' })).toHaveAttribute('href', /konto=reserve.*bis=2026-09-30/);
  await expect(detail).toContainText('Wertpapierbestände sind keine Quelle');
  await page.reload();
  await expect(detail).toContainText('116,67 €');
  await inspect(page, info, 'goals-literal');
});

test('live goal detail withholds ambiguous source money and metadata while refresh and retry are pending', async ({ page }) => {
  await mock(page, [goal(), goal({ id: 'second', name: 'Zweites Ziel' })]);
  await page.goto('/reports/sparziele?monat=2026-09');
  await page.locator('.goals').getByRole('link', { name: 'Reiseziel', exact: true }).click();
  const detail = page.locator('.goal-report-detail');
  await expect(detail).toContainText('Mehrere Sparziele verwenden dieselbe Quelle');
  await expect(detail).not.toContainText('€');
  // A valid source is then loaded through the same selected month query.
  await page.route(/\/api\/goals(?:\?month=.*)?$/, (r) => r.fulfill({ json: { month: '2026-09', goals: [goal()] } }));
  await page.reload();
  await expect(detail).toContainText('850,00 €');
  let mode = 'blocked';
  let release: (() => void) | undefined;
  await page.route('**/api/accounts?asOf=*', async (r) => {
    if (mode === 'blocked') await new Promise<void>((resolve) => (release = resolve));
    if (mode === 'error') await r.fulfill({ status: 503, json: { error: 'unavailable', message: 'Synthetische Quelle fehlt' } });
    else await r.fulfill({ json: { accounts } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => Boolean(release)).toBe(true);
  await expect(detail).toBeHidden();
  await expect(page.locator('.plan-panel-detail')).toContainText('werden geladen');
  mode = 'error';
  release!();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(detail).toBeHidden();
  mode = 'success';
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('850,00 €');
  await page.route(/\/api\/goals(?:\?month=.*)?$/, (r) => r.fulfill({ json: { month: '2026-09', goals: [] } }));
  await page.reload();
  await expect(page.getByText('Dieses Sparziel ist nicht vorhanden.')).toBeVisible();
  await expect(detail).toHaveCount(0);
});

sampleTest('real synthetic API drives the Plan destination with no writes', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(r.url());
  });
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/goals');
  await page.goto('/reports/sparziele?monat=2026-09');
  const data = (await (await response).json()) as { month: string; goals: GoalView[] };
  expect(data.month).toBe('2026-09');
  expect(data.goals).toHaveLength(5);
  await expect(page.getByTestId('goals-summary')).toHaveText('3 von 5 im Plan');
  for (const g of data.goals) {
    for (const toggle of await page.locator('.goals .grp-toggle[aria-expanded="false"]').all()) await toggle.click();
    const row = page.locator('.goals tr.prow').filter({ has: page.getByRole('link', { name: g.name, exact: true }) });
    await expect(row.locator('.col-target')).toHaveText(formatEuro(cents(g.targetCents)));
    await expect(row.locator('.col-saved')).toHaveText(formatEuro(cents(g.savedCents)));
    await expect(row.locator('.col-missing')).toHaveText(formatEuro(cents(g.remainingCents)));
    await row.getByRole('link', { name: g.name, exact: true }).click();
    const detail = page.locator('.goal-report-detail');
    await expect(detail).toContainText(formatEuro(cents(g.averageRateCents)));
    await expect(detail).toContainText(g.neededMonthlyCents === null ? 'ohne Zieldatum' : formatEuro(cents(g.neededMonthlyCents)));
    await page.getByRole('link', { name: 'Zurück zu Sparzielen', exact: true }).click();
  }
  expect(writes).toEqual([]);
  await inspect(page, info, 'goals-real-sample');
});
