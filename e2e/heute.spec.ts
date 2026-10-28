import { test as isolatedTest } from './isolated-ledger';
import { sampleTest as test, expect as baseExpect } from './sample';
import AxeBuilder from '@axe-core/playwright';
import { test as ledgerTest, type Page } from '@playwright/test';
import type { LiquidityReportView } from '../apps/web/src/reports/liquidity-api';
import type { Heute } from '../apps/web/src/heute/api';
import { MAIN_URL } from '../playwright.config';
import { pickCategory, toast } from './ledger-helpers';
import { addDays, daysBetween } from '@budget/domain';
import { eur, shortDay } from '../apps/web/src/ledger/format';

const expect = baseExpect.configure({ timeout: 15_000 });

/** The retired R07 bookmark now opens the independently sourced stand-today card. */
async function currentForecast(page: Page, month = '2026-09') {
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('monat') === month);
  const response = await page.request.get('/api/liquidity?horizon=35d');
  expect(response.ok()).toBe(true);
  const source = (await response.json()) as LiquidityReportView;
  if (!source.available || !source.report?.low) throw new Error('Synthetic current forecast must be available');
  const card = page.getByRole('region', { name: 'Kontoprognose · 35 Tage' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Stand heute · 17.09.2026 · ohne Stellschrauben');
  await expect(card.locator('.heute-forecast-low')).toHaveAttribute('data-day', source.report.low.day);
  await expect(card.locator('.heute-forecast-low')).toHaveAttribute('data-cents', String(source.report.low.cents));
  await expect(card.locator('.heute-forecast-low')).toContainText(eur(source.report.low.cents));
  const chart = card.getByTestId('liquidity-chart');
  await expect(chart).toBeVisible();
  return { card, chart, report: source.report };
}

test('daily budget uses the live lead and next payday, wraps and explains the formula in both themes', async ({
  page,
}, info) => {
  await page.goto('/?monat=2026-09&period=payday');
  const data: Heute = await (await page.request.get('/api/heute?period=payday')).json();
  expect(data.lead.freeCents).toBeGreaterThan(0);
  expect(data.dailyBudget.remainingDays).toBe(data.lead.daysToPayday);
  expect(data.dailyBudget.perDayCents).toBe(
    Math.round(data.lead.freeCents / data.dailyBudget.remainingDays),
  );
  const line = page.getByTestId('heute-daily-budget');
  await expect(line).toContainText(
    `≈ ${eur(data.dailyBudget.perDayCents!, { cents: false })} pro Tag · noch ${data.dailyBudget.remainingDays} Tage bis zum Gehalt`,
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Tagesbudget erklären' }).focus();
    await expect(page.getByRole('tooltip')).toContainText(
      'geteilt durch die verbleibenden Tage einschließlich heute',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByRole('button', { name: 'Herleitung zeigen', exact: true }).focus();
    const figure = await page.getByTestId('heute-lead-value').boundingBox();
    const box = await line.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(figure!.y + figure!.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`daily-budget-${colorScheme}.png`) });
  }
  await page.route('**/api/heute?**', async (route) => {
    const response = await route.fetch();
    const json: Heute = await response.json();
    json.lead.freeCents = 0;
    json.dailyBudget.perDayCents = null;
    await route.fulfill({ response, json });
  });
  await page.reload();
  await expect(line).toContainText(
    `Kein Spielraum bis zum Gehalt am ${shortDay(data.stand.payday.day)}`,
  );
  await expect(line).not.toContainText('pro Tag');
});

// Existing detailed flows explicitly unfold their moved figures. UX-2 tests cover the device default.
test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    localStorage.setItem('budget-heute-more-phone', '1');
  });
});

test('Heute month forecast ends two days after month end and names payments in the shared tooltip', async ({ page }) => {
  await page.goto('/?monat=2026-09&period=month');
  const response = await page.request.get('/api/heute?period=month');
  const data = (await response.json()) as Heute;
  expect(data.balance.forecast.at(-1)!.day).toBe('2026-10-02');
  expect(data.balance.actual[0]!.day).toBe(addDays(data.stand.today, -14));
  expect(data.balance.low!.cents).toBe(Math.min(...[...data.balance.actual, ...data.balance.forecast].map((d) => d.balanceCents)));
  await expect(page.getByTestId('liquidity-chart')).toBeVisible();
  await page.goto('/reports/finanzcheck?monat=2026-09');
  const current = await currentForecast(page);
  await expect(page.getByRole('button', { name: 'Monat', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(data.stand.to).toBe('2026-10-02');
  expect(daysBetween(data.stand.today, data.stand.to)).toBe(15);
  const payments = data.balance.forecast.flatMap((point) => point.items);
  expect(payments.map((item) => item.label)).toEqual(expect.arrayContaining(['Gehalt', 'Miete']));
  expect(payments.some((item) => item.label === 'Kreditrate')).toBe(false);
  const salary = data.balance.forecast.find((point) => point.day === '2026-09-30')!;
  expect(salary.items.map((item) => item.label)).toEqual(expect.arrayContaining(['Gehalt', 'Kontoführung']));
  expect(data.balance.actual.at(-1)!.balanceCents).toBe(data.balance.forecast[0]!.balanceCents);
  const group = current.chart.locator('..');
  await group.focus();
  const index = current.report.points.findIndex((point) => point.day === '2026-09-30');
  expect(index).toBeGreaterThan(0);
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText('30.09.2026');
  await expect(page.locator('.chart-tooltip')).toContainText('Mit Ereignissen');
  await expect(page.locator('.chart-tooltip')).toContainText(eur(current.report.points[index]!.balanceCents));
});

test('Heute payday forecast follows the bracket and last axis label', async ({ page }) => {
  await page.goto('/?monat=2026-09&period=payday');
  await expect(page.getByTestId('liquidity-chart')).toBeVisible();
  await expect(page.getByText('Budget-Konten; Kreditkarten im Budget eingeschlossen, Reservekonten ausgeschlossen.', { exact: false })).toBeVisible();
  await page.goto('/reports/finanzcheck?monat=2026-09');
  await currentForecast(page);
  await expect(page.getByRole('button', { name: 'Bis Gehalt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const data = (await (await page.request.get('/api/heute?period=payday')).json()) as Heute;
  expect(data.stand.payday.day).toBe('2026-10-15');
  expect(daysBetween(data.stand.today, data.stand.payday.day)).toBe(28);
  expect(data.stand.to).toBe('2026-10-17');
  expect(data.balance.forecast.at(-1)!.day).toBe('2026-10-17');
  expect(data.balance.actual[0]!.day).toBe(addDays(data.stand.today, -14));
  expect(data.balance.actual.at(-1)!.balanceCents).toBe(data.balance.forecast[0]!.balanceCents);
  expect(data.balance.forecast.flatMap((point) => point.items).some((item) => item.label === 'Kreditrate')).toBe(true);
});

test('a direct R07 visit falls back to Bis Gehalt without a stored choice', async ({ page }) => {
  await page.goto('/reports/finanzcheck?monat=2026-09');
  await expect(page.getByRole('button', { name: 'Bis Gehalt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await currentForecast(page);
  const data = (await (await page.request.get('/api/heute')).json()) as Heute;
  expect(data.stand.period).toBe('payday');
  expect(data.stand.payday.day).toBe('2026-10-15');
  expect(data.stand.to).toBe('2026-10-17');
  expect(data.balance.forecast.at(-1)!.day).toBe('2026-10-17');
});

test('R07 remembers Heute period and retains its API forecast and low point in either mode', async ({ page }, info) => {
  for (const period of ['month', 'payday'] as const) {
    await page.goto(`/?monat=2026-09&period=${period}`);
    await expect(page.getByTestId('liquidity-chart')).toBeVisible();
    const data: Heute = await (await page.request.get(`/api/heute?month=2026-09&period=${period}`)).json();
    expect(data.stand.period).toBe(period);
    expect(data.stand.to).toBe(period === 'month' ? '2026-10-02' : '2026-10-17');
    expect(data.balance.forecast.at(-1)!.day).toBe(data.stand.to);
    expect(data.balance.actual.at(-1)!.balanceCents).toBe(data.balance.forecast[0]!.balanceCents);
    expect(data.balance.low!.cents).toBe(Math.min(...[...data.balance.actual, ...data.balance.forecast].map((point) => point.balanceCents)));
    expect([...data.balance.actual, ...data.balance.forecast].some((point) => point.day === data.balance.low!.day && point.balanceCents === data.balance.low!.cents)).toBe(true);
    await page.goto('/reports/finanzcheck?monat=2026-09');
    await expect(page.getByRole('button', { name: period === 'month' ? 'Monat' : 'Bis Gehalt', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await currentForecast(page);
    const retained: Heute = await (await page.request.get(`/api/heute?month=2026-09&period=${period}`)).json();
    expect(retained.balance).toEqual(data.balance);
    expect(retained.stand.to).toBe(data.stand.to);
    await page.screenshot({ path: `test-results/r07-${period}-${info.project.name}.png`, fullPage: true });
    await page.getByRole('button', { name: period === 'month' ? 'Bis Gehalt' : 'Monat', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`period=${period === 'month' ? 'payday' : 'month'}`));
  }
});
test('Heute uses live API data and period, expands the lead chain, and links to source views', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const requests: string[] = [];
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/heute?')) requests.push(request.url());
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });

  await page.goto('/?monat=2026-09&period=month');
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  expect(response.ok()).toBe(true);
  const initial: Heute = await response.json();
  expect(initial.lead.freeCents).toBe(98_826);
  const badRules =
    'unavailable' in initial.financeCheck
      ? []
      : initial.financeCheck.actionRules.filter((rule) => rule.status === 'bad');
  expect(badRules.length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  // #571: Monat shows Zu verteilen / Verfügbar im Budget / Nettovermögen; the lead figure belongs to Bis Gehalt.
  await expect(page.getByTestId('heute-kennzahlen').getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Verfügbar im Budget',
    'Nettovermögen',
  ]);
  await expect(page.getByTestId('heute-lead-value')).toHaveCount(0);
  await expect(page.getByTestId('heute-pace-chart')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('heute-pace-chart')).toBeVisible();
  await expect(page.getByTestId('heute-networth-chart')).toBeVisible({ timeout: 15_000 });
  expect(
    requests.some((url) => url.includes('period=month') && url.includes('month=2026-09')),
  ).toBe(true);

  await page.getByRole('button', { name: 'Bis Gehalt', exact: true }).click();
  await expect.poll(() => requests.some((url) => url.includes('period=payday'))).toBe(true);
  await expect(page).toHaveURL(/monat=2026-09.*period=payday|period=payday.*monat=2026-09/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bis Gehalt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await expect(page.getByTestId('heute-kennzahlen').getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Frei bis Gehalt',
    'Nettovermögen',
  ]);
  await expect(page.getByTestId('heute-lead-value')).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toContainText('988');
  await expect(page.getByTestId('heute-lead-value')).toContainText(',26 €');
  await page.getByTestId('heute-lead-value').click();
  await expect(
    page.getByRole('button', { name: 'Herleitung ausblenden', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('group', { name: /Maßkette: Bedarf/ })).toBeVisible();
  await page.getByRole('button', { name: /^Bedarf/ }).click();
  await expect(page.getByRole('heading', { name: 'Envelopes Bedarf' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toHaveCount(0);
  await page.getByText('Ansicht anpassen', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Angepinnte Kategorien anzeigen' }).check();
  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toBeVisible();
  expect(writes).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Fällig 14 Tage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Finanz-Check', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Zu tun' })).toContainText(
    `${badRules.length} ${badRules.length === 1 ? 'Regelbefund' : 'Regelbefunde'} zum Handeln`,
  );
  await expect(page.getByRole('heading', { name: 'Nettovermögen · 12 Monate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Letzte Buchungen' })).toBeVisible();
  const ordered = [
    'heute-wealth-title',
    'attention-title',
    'heute-upcoming-title',
    'heute-bookings-title',
  ];
  expect(
    await page
      .locator(ordered.map((id) => `#${id}`).join(','))
      .evaluateAll((els) => els.map((el) => el.id)),
  ).toEqual(ordered);
  const forecastPath = await page
    .locator('[data-testid="heute-pace-chart"] .l-forecast')
    .getAttribute('d');
  const todayX = Number(
    await page.locator('[data-testid="heute-pace-chart"] .l-today').getAttribute('x1'),
  );
  const forecastStart = Number(forecastPath?.match(/^M([\d.]+)/)?.[1]);
  expect(Math.abs(forecastStart - todayX)).toBeLessThan(0.01);
  // #570: the section heads carry no circle numbers any more.
  await expect(page.locator('.heute-detail-grid .circle-no')).toHaveCount(0);
  const ruleRow = page.locator('.attention-row').filter({ hasText: 'Regelbefund' });
  const nonAcuteStates = await ruleRow.evaluateAll((elements) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--red)';
    document.body.append(probe);
    const red = getComputedStyle(probe).color;
    probe.remove();
    return elements.map((element) => getComputedStyle(element).color === red);
  });
  expect(nonAcuteStates).toHaveLength(1);
  expect(nonAcuteStates).not.toContain(true);
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  await page
    .getByRole('group', { name: 'Maßkette Nettovermögen' })
    .evaluate((svg) => svg.scrollIntoView({ block: 'center' }));
  for (const [name, account, total] of [
    ['Liquidität', 'Girokonto', '9.356,00 €'],
    ['Investiert', 'Depot', '88.000,00 €'],
    ['Schulden', 'Kredit', '−12.626,00 €'],
  ]) {
    const segment = page
      .getByRole('group', { name: 'Maßkette Nettovermögen' })
      .getByRole('button', { name: new RegExp(`^${name}`) });
    await segment.locator('.seg-fill').click();
    const panel = page.getByRole('region', { name, exact: true });
    await expect(page).toHaveURL(/\/heute\/details\//);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel.getByRole('link', { name: account, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel).toContainText(total);
    await page.goBack();
    await expect(page).toHaveURL(/\/\?monat=2026-09/);
  }
  await page
    .getByRole('group', { name: 'Maßkette Nettovermögen' })
    .getByRole('button', { name: /^Schulden/ })
    .press('Enter');
  const source = page
    .getByRole('region', { name: 'Schulden', exact: true })
    .getByRole('link', { name: 'Kredit', exact: true });
  const target = await source.getAttribute('href');
  await source.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(target);
  await expect(
    page.locator('.kacct-head').getByRole('heading', { name: 'Kredit', exact: true }),
  ).toBeVisible();
});

test('a debt account in credit adds to the composition and opens the matching detail', async ({
  page,
}) => {
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  const data: Heute = await response.json();
  await page.route('**/api/heute?*', (route) =>
    route.fulfill({
      json: {
        ...data,
        netWorth: {
          ...data.netWorth,
          liquidCents: 10_000,
          investedCents: 0,
          receivableCents: 0,
          debtCents: 2_000,
          totalCents: 12_000,
        },
      },
    }),
  );
  await page.route('**/api/accounts?asOf=*', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-09-17',
        accounts: [
          {
            id: 'synthetic-credit-loan',
            name: 'Schuldkonto im Guthaben',
            role: 'debt',
            valueEurCents: 2_000,
          },
        ],
      },
    }),
  );
  await page.goto('/?monat=2026-09');
  const composition = page.getByRole('group', { name: 'Maßkette Nettovermögen' });
  await expect(composition).toBeVisible();
  await expect(composition.locator('.chain-minus')).toHaveCount(0);
  await expect(composition.locator('text').last()).toContainText('120');
  await expect(composition.getByRole('button', { name: /^Liquidität/ })).toHaveAttribute(
    'aria-label',
    /100,00/,
  );
  const credit = composition.getByRole('button', { name: /^Guthaben auf Schuldkonten/ });
  await expect(credit).toHaveAttribute('aria-label', /20,00/);
  await credit.press('Enter');
  const panel = page.getByRole('region', { name: 'Guthaben auf Schuldkonten', exact: true });
  await expect(panel.getByRole('link', { name: 'Schuldkonto im Guthaben' })).toBeVisible();
  await expect(panel).toContainText('20,00 €');
  await page.goBack();
  await expect(page).toHaveURL(/\/\?monat=2026-09/);
});

test('a past month has no out-of-range today marker in the balance or pace chart', async ({
  page,
}) => {
  await page.goto('/?monat=2026-08&period=month');
  await expect(
    page.getByRole('heading', { name: 'August 2026', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId('heute-pace-chart')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('liquidity-chart').getByTestId('liquidity-mark-heute')).toHaveText(
    'HEUTE',
  );
  await page.goto('/reports/finanzcheck?monat=2026-08&period=month');
  const historical: Heute = await (
    await page.request.get('/api/heute?period=month&month=2026-08')
  ).json();
  if (historical.balance.actual.length + historical.balance.forecast.length === 0) {
    expect(historical.balance.actual).toEqual([]);
    expect(historical.balance.forecast).toEqual([]);
  } else {
    expect([...historical.balance.actual, ...historical.balance.forecast].every((point) => point.day < historical.stand.today)).toBe(true);
  }
  expect(historical.stand.period).toBe('month');
  expect(historical.stand.month).toBe('2026-08');
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.searchParams.get('monat') === '2026-08' && url.searchParams.get('period') === 'month');
  await currentForecast(page, '2026-08');
  await page.goto('/?monat=2026-08&period=month');
  await expect(page.locator('[data-testid="heute-pace-chart"] .l-today')).toHaveCount(0);
  await expect(page.getByTestId('liquidity-chart').getByTestId('liquidity-mark-heute')).toHaveText(
    'HEUTE',
  );
  const response = await page.request.get('/api/heute?period=month&month=2026-08');
  expect((await response.json()).stand.period).toBe('month');
});

test('empty due and next-step blocks disappear while data-list empty states stay explicit', async ({
  page,
}) => {
  const response = await page.request.get('/api/heute?period=month&month=2026-09');
  const data: Heute = await response.json();
  if ('unavailable' in data.financeCheck)
    throw new Error('The quiet fixture needs evaluated rules');
  const empty = {
    ...data,
    pinned: [],
    upcoming14: [],
    upcomingEvents: [],
    lastBookings: [],
    nextSteps: { items: [], count: 0 },
    attention: {
      ...data.attention,
      inboxCount: 0,
      pendingCount: 0,
      loanTermsMissing: false,
      quoteReview: { count: 0, securityIds: [] },
      monthCloseTasks: { tasks: [], unavailable: [] },
    },
    accountReminders: [],
    financeCheck: {
      ...data.financeCheck,
      actionRules: [],
      counts: {
        ...data.financeCheck.counts,
        ok: data.financeCheck.counts.total,
        bad: 0,
        warn: 0,
        notEvaluated: 0,
      },
    },
  };
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: empty }));
  await page.goto('/?monat=2026-09');
  await expect(page.getByRole('heading', { name: 'Angepinnte Kategorien' })).toHaveCount(0);
  await page.getByText('Ansicht anpassen', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Angepinnte Kategorien anzeigen' }).check();
  await expect(page.getByText('Keine Kategorien angepinnt.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fällig 14 Tage' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nächste Schritte' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Zu tun' })).toHaveCount(0);
  await expect(page.getByText('Noch keine Buchungen vorhanden.')).toBeVisible();
});

test('attention leaves overspending to the top-bar chip and links to the inbox', async ({
  page,
}) => {
  const data: Heute = await (
    await page.request.get('/api/heute?period=month&month=2026-08')
  ).json();
  await page.route('**/api/heute?*', (route) =>
    route.fulfill({
      json: {
        ...data,
        attention: { ...data.attention, inboxCount: 2 },
        nextSteps: {
          count: 3,
          items: [
            {
              kind: 'overspent',
              urgent: true,
              categoryId: 'test',
              categoryName: 'Test-Envelope',
              cents: 1234,
              count: 1,
            },
            {
              kind: 'uncategorized',
              urgent: false,
              categoryId: null,
              categoryName: null,
              cents: -5678,
              count: 2,
            },
          ],
        },
      },
    }),
  );
  await page.goto('/?monat=2026-08');
  const attention = page.getByRole('region', { name: 'Zu tun' });
  await expect(attention).not.toContainText('zu decken');
  await expect(page.locator('[data-overspent="test"]')).toHaveCount(0);
  await expect(attention).not.toContainText('Test-Envelope');
  await expect(page.locator('.heute-mobile-next')).toHaveCount(0);
  await attention.getByRole('link', { name: 'Zuordnen' }).click();
  await expect(page).toHaveURL(/\/konten\/pruefen/);
});

test('source-view links open the corresponding live pages', async ({ page }) => {
  for (const [heading, link, target] of [
    ['Angepinnte Kategorien', 'Plan öffnen', '/plan/monat'],
    ['Fällig 14 Tage', 'Alle', '/plan/erwartet'],
    ['Vermögensaufteilung', 'Details', '/vermoegen/nettovermoegen'],
    ['Letzte Buchungen', 'Alle', '/konten/buchungen'],
  ]) {
    await page.goto('/?monat=2026-09');
    if (heading === 'Angepinnte Kategorien') {
      await page.getByText('Ansicht anpassen', { exact: true }).click();
      await page.getByRole('checkbox', { name: 'Angepinnte Kategorien anzeigen' }).check();
    }
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
      .getByRole('link', { name: link, exact: true })
      .click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(target);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await page.goto('/?monat=2026-09');
  await page.getByRole('region', { name: 'Zu tun' }).getByRole('link', { name: 'Handeln' }).click();
  await expect(page).toHaveURL(/\/einstellungen\/regelwerk#rule-result-/);
});

test('negative lead uses the action colour and attention precedes the month fold', async ({
  page,
}, info) => {
  const response = await page.request.get('/api/heute?period=payday&month=2026-09');
  const data: Heute = await response.json();
  await page.route('**/api/heute?*', (route) =>
    route.fulfill({
      json: {
        ...data,
        lead: { ...data.lead, freeCents: -12345 },
        dailyBudget: { ...data.dailyBudget, perDayCents: null },
      },
    }),
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/?monat=2026-09&period=payday');
    const figure = page.getByTestId('heute-lead-value');
    await expect(figure).toContainText('−123');
    await expect(figure).toContainText(',45 €');
    const colours = await figure.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--red)';
      el.append(probe);
      const red = getComputedStyle(probe).color;
      probe.remove();
      return {
        red,
        whole: getComputedStyle(el).color,
        cents: getComputedStyle(el).color,
      };
    });
    expect(colours.whole).toBe(colours.red);
    expect(colours.cents).toBe(colours.red);
    const attention = page.getByRole('region', { name: 'Zu tun' });
    await expect(attention).toBeVisible();
    const upcomingBox = await page.locator('#heute-upcoming-title').boundingBox();
    const attentionBox = await attention.boundingBox();
    const moreBox = await page.getByRole('button', { name: 'Mehr zum Monat' }).boundingBox();
    expect(attentionBox!.y).toBeLessThan(upcomingBox!.y);
    expect(moreBox!.y).toBeGreaterThan(attentionBox!.y);
    if (info.project.name === 'mobile') {
      await expect(figure).toHaveCSS('font-size', '22px');
      expect((await page.getByTestId('liquidity-chart').boundingBox())!.height).toBe(220);
    }
  }
});

test('a failed Heute request offers a working retry', async ({ page }) => {
  test.setTimeout(60_000);
  let fail = true;
  await page.route('**/api/heute?*', (route) =>
    fail ? route.fulfill({ status: 503, json: { error: 'unavailable' } }) : route.continue(),
  );
  await page.goto('/?monat=2026-09');
  await expect(page.getByRole('alert')).toContainText('Heute konnten nicht geladen werden.', {
    timeout: 15_000,
  });
  fail = false;
  const retried = page.waitForResponse(
    (response) => response.url().includes('/api/heute?') && response.ok(),
  );
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await retried;
  await expect(page.getByTestId('heute-lead-value')).toContainText('988');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('settled balance reaches the forecast and the composition measures its parts in both motion modes', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  for (const [colorScheme, reducedMotion] of [
    ['light', 'reduce'],
    ['dark', 'reduce'],
    ['light', 'no-preference'],
    ['dark', 'no-preference'],
  ] as const) {
    await page.emulateMedia({ reducedMotion, colorScheme });
    await page.goto('/?monat=2026-09');
    await expect(page.getByTestId('heute-networth-chart')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    await expect(page.getByTestId('liquidity-chart')).toBeVisible();
    await page.goto('/reports/finanzcheck?monat=2026-09');
    const current = await currentForecast(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    // Old report-mode segment join is retained in charts.test.tsx; the real source opening
    // equality remains exact here. The active card has forecast only, with current markers.
    const data: Heute = await (await page.request.get('/api/heute?month=2026-09&period=payday')).json();
    expect(data.balance.actual.at(-1)!.balanceCents).toBe(data.balance.forecast[0]!.balanceCents);
    expect(data.balance.actual.at(-1)!.day).toBe(data.balance.forecast[0]!.day);
    await expect(page.getByTestId('heute-wealth-history').locator('path.l-actual').first()).toHaveCSS('stroke-dashoffset', '0px');
    const geometry = await current.chart.evaluate((svg) => {
      const rect = (element: Element) => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height }; };
      return { svg: rect(svg), low: Array.from(svg.querySelectorAll('[data-testid="liquidity-lowpoint"] text'), rect), plot: rect(svg.querySelector('.l-forecast')!), markers: Array.from(svg.querySelectorAll('[data-testid="liquidity-mark-heute"], [data-testid="liquidity-mark-gehalt"]'), rect) };
    });
    expect(geometry.low).toHaveLength(2);
    expect(geometry.markers).toHaveLength(2);
    for (const box of [...geometry.low, ...geometry.markers]) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(geometry.svg.left);
      expect(box.right).toBeLessThanOrEqual(geometry.svg.right);
    }
    expect(geometry.low[0]!.top).toBeGreaterThanOrEqual(geometry.plot.bottom);
    expect(geometry.low[0]!.bottom).toBeLessThanOrEqual(geometry.low[1]!.top);
    for (const marker of geometry.markers) expect(marker.bottom).toBeLessThanOrEqual(geometry.plot.top);
    await page.goto('/?monat=2026-09');
    await expect(page.getByTestId('heute-networth-chart')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    const composition = page.getByRole('group', { name: 'Maßkette Nettovermögen' });
    await expect(composition.getByRole('button', { name: /^Liquidität/ })).toBeVisible();
    await expect(composition.getByRole('button', { name: /^Investiert/ })).toBeVisible();
    await expect(composition.getByRole('button', { name: /^Schulden/ })).toBeVisible();
    await expect(composition.locator('.chain-minus .seg-outline')).toHaveAttribute(
      'stroke-dasharray',
      'var(--dash-debt)',
    );
    await expect(composition.locator('.chain-minus .seg-fill')).toHaveAttribute(
      'fill',
      'transparent',
    );
    await expect(composition.locator('text').last()).toContainText('Nettovermögen');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const capture = info.outputPath(`heute-${colorScheme}-${reducedMotion}.png`);
    await page.screenshot({ path: capture, fullPage: true, animations: 'allow' });
    await info.attach(`Heute ${colorScheme} ${reducedMotion}`, {
      path: capture,
      contentType: 'image/png',
    });
  }
});

ledgerTest(
  'Today refreshes after capture, undo and redo without reloading',
  async ({ page }, info) => {
    ledgerTest.skip(
      info.project.name !== 'desktop',
      'One capture writer on the shared main ledger; both viewports read the sample ledger.',
    );
    const headers = { origin: MAIN_URL };
    const current: Heute = await (await page.request.get('/api/heute')).json();
    const day = current.stand.today;
    const month = day.slice(0, 7);
    const cleanup: string[] = [];
    let liveBookingGroup: string | undefined;
    const categoryName = `Heute Capture ${Date.now()}`;
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(path, { headers, data });
      expect(response.ok(), await response.text()).toBe(true);
      const body = await response.json();
      cleanup.push(body.groupId);
      return body;
    };
    try {
      const { account } = await post('/api/accounts', {
        name: categoryName,
        type: 'checking',
        openingDate: `${Number(day.slice(0, 4)) - 1}-01-01`,
        openingBalanceCents: 10_000,
      });
      const { category } = await post('/api/categories', {
        name: categoryName,
        groupId: 'e2e-g',
        class: 'need',
        kind: 'variable',
      });
      const assigned = await page.request.put(`/api/budget/${month}/assigned`, {
        headers,
        data: { items: [{ categoryId: category.id, assignedCents: 10_000 }] },
      });
      expect(assigned.ok()).toBe(true);
      cleanup.push((await assigned.json()).groupId);
      // Other specs share this ledger. Keep an unrelated overspent envelope here so this
      // regression cannot accidentally rely on the whole household starting at 100 EUR.
      const { category: other } = await post('/api/categories', {
        name: `Heute Begleitprüfung ${Date.now()}`,
        groupId: 'e2e-g',
        class: 'want',
        kind: 'variable',
      });
      await post('/api/bookings', {
        type: 'booking',
        accountId: account.id,
        date: day,
        amountCents: -20_570,
        categoryId: other.id,
      });
      await page.goto(`/?monat=${month}`);
      await expect(page.getByTestId('heute-lead-value')).toBeVisible();
      await page.getByRole('button', { name: 'Herleitung zeigen', exact: true }).click();
      await page.getByRole('button', { name: /^Bedarf/ }).click();
      const envelope = page.locator('.heute-breakdown li').filter({ hasText: categoryName });
      await expect(envelope.locator('strong')).toHaveText('100,00 €');
      const assertFresh = async (data: Heute, availableCents: number, text: string) => {
        expect(data.lead.items.need.find((item) => item.id === category.id)?.availableCents).toBe(
          availableCents,
        );
        await expect(envelope.locator('strong')).toHaveText(text);
        await expect(page.getByTestId('heute-lead-value')).toHaveText(eur(data.lead.freeCents));
      };
      const refreshed = () =>
        page.waitForResponse((response) => response.url().includes('/api/heute?') && response.ok());
      await page.keyboard.press('n');
      const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
      await panel.getByLabel('Bezahlt von', { exact: true }).selectOption(account.id);
      await panel.getByLabel('Datum', { exact: true }).fill(day);
      await panel.getByLabel('Betrag', { exact: true }).fill('20,70');
      await pickCategory(panel, categoryName);
      const written = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/bookings') && response.request().method() === 'POST',
      );
      let refresh = refreshed();
      await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
      liveBookingGroup = (await (await written).json()).groupId;
      let data: Heute = await (await refresh).json();
      await assertFresh(data, 7930, '79,30 €');
      refresh = refreshed();
      await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
      liveBookingGroup = undefined;
      data = await (await refresh).json();
      await assertFresh(data, 10_000, '100,00 €');
      refresh = refreshed();
      const redone = page.waitForResponse(
        (response) => response.url().endsWith('/api/undo') && response.ok(),
      );
      await toast(page).getByRole('button', { name: 'Wiederholen' }).click();
      liveBookingGroup = (await (await redone).json()).groupId;
      data = await (await refresh).json();
      await assertFresh(data, 7930, '79,30 €');
      // A prior-month uncategorized entry remains actionable; tomorrow's entry stays outside
      // the Today count and the linked view. The categorised capture is filtered out there.
      const priorMemo = `${categoryName} vorheriger Monat`;
      const futureMemo = `${categoryName} morgen`;
      await post('/api/bookings', {
        type: 'booking',
        accountId: account.id,
        date: addDays(`${month}-01`, -1),
        amountCents: -123,
        categoryId: null,
        memo: priorMemo,
      });
      await post('/api/bookings', {
        type: 'booking',
        accountId: account.id,
        date: addDays(day, 1),
        amountCents: -456,
        categoryId: null,
        memo: futureMemo,
      });
      await page.goto(`/?monat=${month}`);
      const attention = page.getByRole('region', { name: 'Zu tun' });
      await expect(attention).toContainText('ohne Kategorie');
      await attention.getByRole('link', { name: 'Zuordnen' }).click();
      await expect(page).toHaveURL(/\/konten\/pruefen/);
      await expect(page.getByText(priorMemo, { exact: false })).toBeVisible();
      await expect(page.getByText(futureMemo, { exact: false })).toHaveCount(0);
    } finally {
      if (liveBookingGroup) cleanup.push(liveBookingGroup);
      for (const groupId of cleanup.reverse()) {
        const response = await page.request.post('/api/undo', { headers, data: { groupId } });
        expect(response.ok()).toBe(true);
      }
    }
  },
);

test('mobile attention remains reachable above the floating capture button in both themes', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  const attention = page.locator('.heute-attention');
  await expect(attention).toBeVisible();
  // The FAB is fixed and hides while scrolling down (#468), so measure its slot once at the top.
  const fab = (await page.locator('.fab').boundingBox())!;
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    for (const action of await attention.locator('a, button').all()) {
      await action.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      const box = (await action.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(fab.y);
    }
    const capture = info.outputPath(`heute-attention-${theme}.png`);
    await page.screenshot({ path: capture });
    await info.attach(`Attention ${theme}`, { path: capture, contentType: 'image/png' });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const finalRow = (await page.locator('#heute-more-content a').last().boundingBox())!;
    expect(finalRow.y).toBeGreaterThanOrEqual(0);
    expect(finalRow.y + finalRow.height).toBeLessThan(fab.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

isolatedTest(
  'early fixed spending gets a provisional forecast from the first day',
  async ({ page, request, baseURL }) => {
    const post = async (path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const a = await post('/accounts', {
      name: 'Synthetisches Pacekonto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: 100_000,
    });
    const g = await post('/categories/groups', { name: 'Synthetische Fixkosten' });
    const c = await post('/categories', {
      name: 'Synthetische Miete',
      groupId: g.group.id,
      class: 'need',
      kind: 'fixed',
    });
    const assigned = await request.put('/api/budget/2026-10/assigned', {
      data: { items: [{ categoryId: c.category.id, assignedCents: 90000 }] },
      headers: { origin: baseURL! },
    });
    expect(assigned.ok()).toBe(true);
    await post('/bookings', {
      type: 'booking',
      accountId: a.account.id,
      date: '2026-10-01',
      amountCents: -90000,
      splits: [{ categoryId: c.category.id, amountCents: -90000 }],
    });
    await page.goto('/?monat=2026-10');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await expect(page.getByRole('button', { name: /Prognose Monatsende/ })).toContainText(
        '900 €',
      );
      await expect(page.locator('.heute-pace')).toContainText('vorläufig');
      await expect(page.locator('.heute-pace')).toContainText('verbleibender variabler Plan');
    }
  },
);
