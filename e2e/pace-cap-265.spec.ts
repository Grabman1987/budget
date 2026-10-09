import { expect } from '@playwright/test';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-15' });

test('Heute and One-Pager show under-plan actuals beside an over-cap forecast', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  test.setTimeout(90_000);
  const { origin } = isolatedLedger;
  const headers = { origin };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const response = await request.post(`${origin}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };
  const readPace = async (path: string) => {
    const response = await request.get(`${origin}/api${path}`, { headers });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as Pick<Heute, 'pace'>;
  };

  const account = await post<{ account: { id: string } }>('/accounts', {
    name: 'Musterkonto',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-09-01',
    openingBalanceCents: 100_000,
  });
  const group = await post<{ group: { id: string } }>('/categories/groups', {
    name: 'Musterbedarf',
  });
  const fixed = await post<{ category: { id: string } }>('/categories', {
    name: 'Fixkosten',
    groupId: group.group.id,
    class: 'need',
    kind: 'fixed',
    target: {
      validFrom: '2026-09',
      target: { kind: 'monthly', amountCents: 4_000, dueDay: 15 },
    },
  });
  const variable = await post<{ category: { id: string } }>('/categories', {
    name: 'Variable Ausgaben',
    groupId: group.group.id,
    class: 'need',
    kind: 'variable',
  });
  const assigned = await request.put(`${origin}/api/budget/2026-09/assigned`, {
    headers,
    data: {
      items: [
        { categoryId: fixed.category.id, assignedCents: 4_000 },
        { categoryId: variable.category.id, assignedCents: 6_000 },
      ],
    },
  });
  expect(assigned.ok(), await assigned.text()).toBe(true);
  await post<unknown>('/bookings', {
    type: 'booking',
    accountId: account.account.id,
    date: '2026-09-15',
    amountCents: -3_500,
    splits: [{ categoryId: variable.category.id, amountCents: -3_500 }],
  });

  const heute = await readPace('/heute?period=month&month=2026-09');
  const onePager = await readPace('/reports/month/onepager?month=2026-09');
  for (const { pace } of [heute, onePager]) {
    expect(pace.figures).toMatchObject({
      planToDateCents: 7_000,
      spentCents: 3_500,
      deltaCents: -3_500,
      openFixedCents: 4_000,
      forecastEndCents: 11_000,
      limitCents: 10_000,
      over: false,
    });
    expect(pace.forecast.at(-1)).toBe(11_000);
  }

  const mobile = info.project.name.toLowerCase().includes('mobile');
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 });
  await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const url of ['/?monat=2026-09', '/reports/onepager?monat=2026-09']) {
    await page.goto(url);
    if (url.startsWith('/?')) {
      await expect(page.getByText('35 € unter Plan', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Ausgegeben 35 €', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: 'Prognose Monatsende 110 € von 100 € Limit',
          exact: true,
        }),
      ).toBeVisible();
    }
    const chart = page.getByTestId('heute-pace-chart');
    await expect(chart).toBeVisible();
    const paceChart = page.locator('.heute-chart').filter({ has: chart });
    await expect(paceChart.locator('.chart-legend')).toHaveText('IstHochrechnungDeckel');
    await expect(chart.locator('.pace-plan-label')).toHaveText('Plan bis heute 70 €');
    await expect(chart.locator('.pace-cap-label')).toHaveText('Deckel 100 €');
    await expect(chart.locator('path.l-actual')).toHaveCount(1);
    await expect(chart.locator('path.l-forecast.is-over-cap')).toHaveCount(1);

    const groupChart = chart.locator('..');
    await groupChart.focus();
    for (let day = 0; day < 15; day++) await page.keyboard.press('ArrowRight');
    const tooltip = page.locator('.chart-tooltip');
    for (const [name, value] of [
      ['Ist', 3_500],
      ['Hochrechnung', 3_500],
      ['Deckel', 10_000],
      ['Plan bis heute', 7_000],
    ] as const) {
      await expect(
        tooltip
          .locator('.chart-tooltip-row')
          .filter({ has: page.getByText(name, { exact: true }) }),
      ).toContainText(eur(value));
    }
    await expect(tooltip).toContainText('offene Fixkosten');
    for (let day = 15; day < 30; day++) await page.keyboard.press('ArrowRight');
    await expect(
      tooltip
        .locator('.chart-tooltip-row')
        .filter({ has: page.getByText('Hochrechnung', { exact: true }) }),
    ).toContainText(eur(11_000));
    await page.keyboard.press('Escape');
    await page.evaluate(async () => document.fonts.ready);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const label = url.startsWith('/reports') ? 'onepager' : 'heute';
      await page.screenshot({
        path: info.outputPath(`${label}-${mobile ? 'mobile' : 'desktop'}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
});
