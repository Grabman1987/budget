import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX } from './ledger-helpers';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';
import type { FinancialHealthAssessment } from '@budget/domain';

test.use({ ledgerToday: '2026-04-15', reducedMotion: 'reduce' });

async function fixture(request: APIRequestContext, origin: string, zero = false) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { data, headers: { origin } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const cash = (
    await post('/accounts', {
      name: 'Synthetic cash',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 1000000,
    })
  ).account;
  await post('/accounts', {
    name: 'Synthetic reserve',
    type: 'savings',
    role: 'reserve',
    onBudget: false,
    openingDate: '2026-01-01',
    openingBalanceCents: zero ? 0 : 270000,
  });
  const group = (await post('/categories/groups', { name: 'Synthetic needs' })).group;
  const need = (
    await post('/categories', { name: 'Synthetic cost', groupId: group.id, class: 'need' })
  ).category;
  for (const month of ['2026-01', '2026-02', '2026-03']) {
    await post('/bookings', {
      type: 'booking',
      accountId: cash.id,
      date: `${month}-02`,
      amountCents: 100000,
      splits: [{ incomeTypeId: 'income-salary', amountCents: 100000 }],
    });
    const cost = zero ? 100000 : 90000;
    await post('/bookings', {
      type: 'booking',
      accountId: cash.id,
      date: `${month}-03`,
      amountCents: -cost,
      splits: [{ categoryId: need.id, amountCents: -cost }],
    });
  }
  return post;
}
const reportPath = '/reports/onepager?darstellung=finanzcheck';

test('814 current scores: literal 71, shared day/basis, privacy, source links, keyboard and both themes', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  await fixture(request, isolatedLedger.origin);
  const response = await request.get('/api/rules/health');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as FinancialHealthAssessment;
  // 10%/20%=50 capacity; 3/6 months=50 reserve; cashflow50, debt100, portfolio N/A.
  // (50*40+100*30)/70=71.428... =>71, independently specified in the method.
  expect(data.score).toBe(71);
  expect(data.categories.map((c) => c.score)).toEqual([50, 100, null]);
  const writes: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (
      path.startsWith('/api/') &&
      !['GET', 'HEAD'].includes(r.method()) &&
      path !== '/api/rules/evaluate'
    )
      writes.push(path);
  });
  await page.goto('/reports/finanzcheck');
  if (!(await redesignReportsOn(page))) {
    await expect(page.getByTestId('health-assessment')).toHaveCount(0);
    return;
  }
  await expect(page).toHaveURL(/darstellung=finanzcheck/);
  const report = page.getByRole('region', { name: 'Financial Health Scores', exact: true });
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  await expect(report.getByTestId('health-score-cashflow')).toHaveText('50 von 100');
  await expect(report.getByTestId('health-score-debt')).toHaveText('100 von 100');
  await expect(report.getByTestId('health-score-portfolio')).toHaveText('Nicht anwendbar');
  await expect(report.getByTestId('health-assessment')).toHaveAttribute(
    'data-health-asof',
    '2026-04-15',
  );
  await expect(report).toContainText('budget-health-v1');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await report.screenshot({
      path: info.outputPath(`health-overview-${theme}.png`),
      animations: 'disabled',
    });
  }
  for (const summary of await report.locator('summary').all()) {
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(summary.locator('..')).toHaveAttribute('open');
    const box = (await summary.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  await expect(report).toContainText('Quellfenster 01.01.2026 bis 31.03.2026');
  await expect(report).toContainText('3.000,00 €');
  const links = [
    ['Sparquote und Geldalter öffnen', '/reports/sparquote'],
    ['Notgroschen im Regelwerk öffnen', '/einstellungen/regelwerk#rule-result-R02'],
    ['Schulden und Konditionen öffnen', '/vermoegen/schulden'],
    ['Allokation und Risikogrenzen öffnen', '/vermoegen/portfolio/allokation'],
  ];
  for (const [name, href] of links) {
    const link = report.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('href', href!);
    await link.focus();
    await expect(link).toBeFocused();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(
      (await new AxeBuilder({ page }).include('.health-assessment').analyze()).violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await report.screenshot({
      path: info.outputPath(`health-${theme}.png`),
      animations: 'disabled',
    });
  }
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await expect(report.getByTestId('health-overall-score')).toHaveText('••• von 100');
  await expect(report).not.toContainText('3.000,00 €');
  await expect(report).not.toContainText('2.700,00 €');
  await withShellControls(page, async ({ privacy }) => privacy.click());
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  const debtSource = report.getByRole('link', { name: 'Schulden und Konditionen öffnen' });
  await debtSource.click();
  await expect(page).toHaveURL(/\/vermoegen\/schulden/);
  await page.goBack();
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  await page.goto(`${reportPath}&monat=2026-02`);
  await expect(report.getByTestId('health-assessment')).toHaveAttribute(
    'data-health-asof',
    '2026-04-15',
  );
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  expect(writes).toEqual([]);
});

test('814 distinguishes empty/unusable data from real zero scores', async ({
  page,
  request,
  isolatedLedger,
}) => {
  await page.goto(reportPath);
  if (!(await redesignReportsOn(page))) return;
  const report = page.getByRole('region', { name: 'Financial Health Scores', exact: true });
  await expect(report.getByTestId('health-overall-score')).toHaveText('Nicht bewertbar');
  await expect(report.getByTestId('health-coverage')).toHaveText('0,0 %');
  const post = await fixture(request, isolatedLedger.origin, true);
  await page.reload();
  await expect(report.getByTestId('health-score-cashflow')).toHaveText('0 von 100');
  await expect(report.getByTestId('health-overall-score')).toHaveText('43 von 100');
  await post('/accounts', {
    name: 'Synthetic unknown reserve FX',
    type: 'savings',
    role: 'reserve',
    onBudget: false,
    currency: 'CHF',
    openingDate: '2026-01-01',
    openingBalanceCents: 10000,
  });
  await page.reload();
  await expect(report.getByTestId('health-score-cashflow')).toHaveText('Nicht bewertbar');
  await expect(report.getByTestId('health-overall-score')).toHaveText('Nicht bewertbar');
  await expect(report).toContainText('unvollständig');
});

test('814 loading, source error and retry preserve the real known assessment', async ({
  page,
  request,
  isolatedLedger,
}) => {
  await fixture(request, isolatedLedger.origin);
  let checkReads = 0;
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/rules/check') checkReads++;
  });
  let release!: () => void;
  const hold = new Promise<void>((done) => {
    release = done;
  });
  await page.route('**/api/rules/health', async (route) => {
    await hold;
    await route.fulfill({ status: 503, json: { error: 'unavailable' } });
  });
  await page.goto(reportPath);
  if (!(await redesignReportsOn(page))) {
    release();
    return;
  }
  const report = page.getByRole('region', { name: 'Financial Health Scores', exact: true });
  await expect(report.getByRole('status')).toContainText('werden geladen');
  // The existing report derives rule history once, then invalidates ledger queries. Let that
  // refresh start while the first health read is pending, so it cannot race the retry click.
  await expect.poll(() => checkReads).toBe(2);
  release();
  await expect(report.getByRole('alert')).toContainText('konnten nicht geladen');
  await expect(report.getByTestId('health-overall-score')).toHaveCount(0);
  await page.unroute('**/api/rules/health');
  await report.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  await expect(report.getByRole('alert')).toHaveCount(0);
});

test('814 a failed refetch labels cached scores stale; offline never presents current health', async ({
  page,
  request,
  context,
  isolatedLedger,
}) => {
  await fixture(request, isolatedLedger.origin);
  await page.goto(reportPath);
  if (!(await redesignReportsOn(page))) return;
  const report = page.getByRole('region', { name: 'Financial Health Scores', exact: true });
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  await page.route('**/api/rules/health', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await report.getByRole('button', { name: 'Bewertung aktualisieren' }).click();
  await expect(report.getByRole('alert')).toBeVisible();
  await expect(report.getByRole('status')).toContainText('nicht aktuell bestätigt');
  await expect(report).toContainText('Gesamtbewertung · letzter Stand');
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toBeVisible();
  await expect(page.getByText('Für diese Seite brauchst du eine Verbindung.')).toBeVisible();
  await expect(page.getByTestId('health-assessment')).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Financial Health Scores', exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/rules/health');
  await context.setOffline(false);
  await expect(report.getByTestId('health-overall-score')).toHaveText('71 von 100');
  await expect(report.getByRole('alert')).toHaveCount(0);
});
