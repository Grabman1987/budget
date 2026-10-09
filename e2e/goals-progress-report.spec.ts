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
    ).toEqual({ width: info.project.name === 'mobile' ? 390 : 1440, overflow: false });
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
test('literal goal figures agree in bars, source table and keyboard details', async ({
  page,
}, info) => {
  await mock(page, [goal(), account]);
  await page.goto('/reports/sparziele');
  const boundary = page.locator('.titleblock .tb-field').filter({ hasText: 'Stichtag' });
  await expect(boundary.locator('.tb-value')).toHaveText('30.09.2026 · Monatsende');
  await expect(boundary).not.toContainText('noch nie');
  await expect(page.getByTestId('goal-report-summary')).toHaveText(
    '1 von 2 im Plan · geprüfte Ziele',
  );
  const rows = page.locator('.goals-report-table tbody tr');
  await expect(rows.nth(0)).toContainText('3.000,00 €');
  await expect(rows.nth(0)).toContainText('850,00 €');
  await expect(rows.nth(0)).toContainText('2.150,00 €');
  await expect(rows.nth(0)).toContainText('215,00 €');
  await expect(rows.nth(0)).toContainText('Jun 2027');
  await expect(rows.nth(1)).toContainText('116,67 €');
  await expect(rows.nth(1)).toContainText('Apr 2027');
  const trigger = page
    .locator('.goals-report-list')
    .getByRole('link', { name: 'Reiseziel', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/plan\/sparziele\/travel-goal\?.*quelle=report/);
  const detail = page.locator('main');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const value of ['3.000,00 €', '850,00 €', '2.150,00 €', '215,00 €', '250,00 €'])
    await expect(detail).toContainText(value);
  await expect(detail).toContainText('Prognose: Jun 2027');
  await expect(detail.getByRole('link', { name: 'Buchungen der Quelle öffnen' })).toHaveAttribute(
    'href',
    /kategorie=travel.*bis=2026-09-30/,
  );
  await expect(detail.getByRole('link', { name: 'Zuweisungen im Plan öffnen' })).toHaveAttribute(
    'href',
    /monat=2026-09/,
  );
  await page.getByRole('link', { name: 'Zurück zum Sparzielreport' }).click();
  await page
    .locator('.goals-report-list')
    .getByRole('link', { name: 'Reserve', exact: true })
    .click();
  await expect(detail.getByRole('link', { name: 'Buchungen der Quelle öffnen' })).toHaveAttribute(
    'href',
    /konto=reserve.*bis=2026-09-30/,
  );
  await expect(detail).toContainText('Wertpapierbestände sind keine Quelle');
  await page.goBack();
  const region = page.getByRole('region', { name: 'Zielstände, seitlich scrollbar' });
  await region.focus();
  if (await region.evaluate((el) => el.scrollWidth > el.clientWidth)) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  }
  await inspect(page, info, 'goals-literal');
});
test('source uncertainty, exact large cents, reached, no date, overdue and zero-rate figures stay distinct', async ({
  page,
}, info) => {
  const goals = [
    goal({ id: 'duplicate1', name: 'Gemeinsames Ziel A' }),
    goal({ id: 'duplicate2', name: 'Gemeinsames Ziel B' }),
    goal({ id: 'missing', name: 'Gelöschte Quelle', categoryId: 'gone' }),
    goal({ id: 'none', name: 'Ohne Quelle', categoryId: null }),
    goal({ id: 'usd-goal', name: 'Fremdwährung', categoryId: null, accountId: 'usd' }),
    goal({
      id: 'large',
      name: 'Sehr langes Sparziel für eine spätere Anschaffung ohne verkürzte Finanzwerte',
      categoryId: 'large',
      targetCents: 9007199254740990,
      savedCents: 9007199254740990,
      remainingCents: 0,
      monthsLeft: null,
      neededMonthlyCents: 0,
      forecastMonth: null,
      status: 'reached',
    }),
    goal({
      id: 'nodate',
      name: 'Ohne Zieldatum',
      categoryId: 'nodate',
      targetDate: null,
      monthsLeft: null,
      neededMonthlyCents: null,
      forecastMonth: null,
      averageRateCents: -100,
      status: 'behind',
      savedCents: 0,
      remainingCents: 300000,
    }),
    goal({
      id: 'overdue',
      name: 'Überfälliges Ziel',
      categoryId: 'overdue',
      targetDate: '2026-08-31',
      monthsLeft: 1,
      neededMonthlyCents: 215000,
      status: 'behind',
    }),
  ];
  await mock(
    page,
    goals,
    [
      ...categories,
      ...['large', 'nodate', 'overdue'].map((id) => ({ id, name: id, class: 'future' })),
    ],
    [...accounts, { id: 'usd', name: 'Fremdkonto', currency: 'USD' }],
  );
  await page.goto('/reports/sparziele');
  await expect(page.getByTestId('goal-report-summary')).toHaveText(
    '1 von 3 im Plan · geprüfte Ziele · 5 ungeklärt',
  );
  const rows = page.locator('.goals-report-table tbody tr');
  for (let i = 0; i < 5; i++) {
    await expect(rows.nth(i).locator('td').nth(1)).toHaveText('nicht verfügbar');
    await expect(rows.nth(i)).toContainText('Status ungeklärt');
    await expect(rows.nth(i)).not.toContainText('€');
  }
  await expect(rows.nth(5)).toContainText('90.071.992.547.409,90 €');
  await expect(rows.nth(5)).toContainText('erreicht');
  await expect(rows.nth(6)).toContainText('0,00 €');
  await expect(rows.nth(6)).toContainText('−1,00 €');
  await expect(rows.nth(6)).toContainText('ohne Zieldatum');
  await expect(rows.nth(6)).toContainText('kein Termin aus aktueller Rate');
  await expect(rows.nth(7)).toContainText('Zieldatum erreicht, Rest offen');
  await page
    .locator('.goals-report-list')
    .getByRole('link', { name: 'Gemeinsames Ziel A' })
    .click();
  await expect(page.locator('main')).toContainText('Mehrere Sparziele verwenden dieselbe Quelle');
  await expect(page.locator('main')).not.toContainText('€');
  await page.goBack();
  await inspect(page, info, 'goals-boundaries');
});
test('metadata refresh hides cached values while loading, on failure and through retry; empty is explicit', async ({
  page,
}) => {
  await mock(page, [goal()]);
  let mode = 'success';
  let release: (() => void) | undefined;
  await page.route('**/api/accounts?asOf=*', async (r) => {
    if (mode === 'blocked') await new Promise<void>((resolve) => (release = resolve));
    if (mode === 'error')
      await r.fulfill({
        status: 503,
        json: { error: 'unavailable', message: 'Synthetische Quelle fehlt' },
      });
    else await r.fulfill({ json: { accounts } });
  });
  await page.goto('/reports/sparziele');
  await expect(page.getByTestId('goal-report-summary')).toBeVisible();
  mode = 'blocked';
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => Boolean(release)).toBe(true);
  const boundary = page.locator('.titleblock .tb-field').filter({ hasText: 'Stichtag' });
  await expect(boundary.locator('.tb-value')).toHaveText('wird geladen');
  await expect(page.getByTestId('goal-report-summary')).toHaveCount(0);
  await expect(page.locator('.goals-report-table')).toHaveCount(0);
  mode = 'error';
  release!();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(boundary.locator('.tb-value')).toHaveText('nicht verfügbar');
  await expect(boundary).not.toContainText('noch nie');
  await expect(page.getByTestId('goal-report-summary')).toHaveCount(0);
  await expect(page.locator('.goal-report-bar')).toHaveCount(0);
  mode = 'success';
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByTestId('goal-report-summary')).toHaveText(
    '1 von 1 im Plan · geprüfte Ziele',
  );
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
  await page.route('**/api/goals', (r) => r.fulfill({ json: { month: '2026-09', goals: [] } }));
  await page.reload();
  await expect(
    page.getByText('Noch keine gespeicherten Sparziele.', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.goals-report-table')).toHaveCount(0);
});
sampleTest('real synthetic API drives the report with no writes', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(r.url());
  });
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/goals');
  await page.goto('/reports/sparziele');
  const data = (await (await response).json()) as { month: string; goals: GoalView[] };
  expect(data.month).toBe('2026-09');
  expect(data.goals).toHaveLength(5);
  await expect(page.getByTestId('goal-report-summary')).toHaveText(
    '3 von 5 im Plan · geprüfte Ziele',
  );
  const rows = page.locator('.goals-report-table tbody tr');
  await expect(rows).toHaveCount(5);
  for (let i = 0; i < data.goals.length; i++) {
    const g = data.goals[i]!;
    const values = [
      g.targetCents,
      g.savedCents,
      g.remainingCents,
      g.averageRateCents,
      g.neededMonthlyCents,
    ];
    await expect(rows.nth(i).locator('th')).toHaveText(g.name);
    for (let j = 0; j < values.length; j++)
      await expect(
        rows
          .nth(i)
          .locator('td')
          .nth(j + 1),
      ).toHaveText(values[j] === null ? 'ohne Zieldatum' : formatEuro(cents(values[j]!)));
  }
  expect(writes).toEqual([]);
  await inspect(page, info, 'goals-real-sample');
});
