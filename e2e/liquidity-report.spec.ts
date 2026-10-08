import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, type Page, type TestInfo } from '@playwright/test';
import type { LiquidityReportView } from '@budget/db';
import { eur } from '../apps/web/src/ledger/format';
import { sampleTest as test } from './sample';
import { test as isolatedTest } from './isolated-ledger';

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

isolatedTest(
  'liquidity forecast labels the assumptions-only baseline and keeps later events out of scope',
  async ({ page, baseURL }, info) => {
    const origin = baseURL!;
    const accountResponse = await page.request.post('/api/accounts', {
      headers: { origin },
      data: {
        name: `Synthetic budget ${info.project.name}`,
        type: 'checking',
        openingDate: '2026-10-02',
        openingBalanceCents: 100_000,
      },
    });
    const accountBody = (await accountResponse.json()) as { account: { id: string } };
    expect(accountResponse.status()).toBe(201);
    const groupResponse = await page.request.post('/api/categories/groups', {
      headers: { origin },
      data: { name: `Synthetic variable group ${info.project.name}` },
    });
    const groupBody = (await groupResponse.json()) as { group: { id: string } };
    expect(groupResponse.status()).toBe(201);
    const categoryResponse = await page.request.post('/api/categories', {
      headers: { origin },
      data: {
        name: `Synthetic variable spending ${info.project.name}`,
        groupId: groupBody.group.id,
        class: 'need',
        kind: 'variable',
        stage: 2,
      },
    });
    const categoryBody = (await categoryResponse.json()) as { category: { id: string } };
    expect(categoryResponse.status()).toBe(201);
    const targetResponse = await page.request.put(
      `/api/categories/${categoryBody.category.id}/target`,
      {
        headers: { origin },
        data: { validFrom: '2026-10', target: { kind: 'monthly', amountCents: 30_000 } },
      },
    );
    expect(targetResponse.status(), await targetResponse.text()).toBe(200);
    const baseline = await api(page, '/api/liquidity?horizon=6m');
    expect(baseline.events).toEqual([]);
    expect(baseline.report?.eventMarks).toEqual([]);
    expect(baseline.report?.levers.find((lever) => lever.id === 'trim-variable')).toMatchObject({
      available: true,
      active: false,
    });

    await page.goto('/reports/liquiditaet');
    const forecastCard = page.locator('section[aria-labelledby="liq-title"]');
    const basis = forecastCard.locator('p.vnote').first();
    await expect(forecastCard).toHaveCount(1);
    await expect(forecastCard.getByText('Tiefpunkt im Grundplan', { exact: true })).toBeVisible();
    await expect(basis).toContainText('Grundplan');
    await expect(basis).toContainText('Noch keine geplanten Ereignisse eingerichtet');
    const trimLever = page.getByRole('checkbox', { name: /Variable Ausgaben um 10 % senken/ });
    await expect(trimLever).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
      const axe = await new AxeBuilder({ page })
        .include('section[aria-labelledby="liq-title"]')
        .analyze();
      expect(axe.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        fullPage: true,
        animations: 'disabled',
        path: info.outputPath(`liquidity-baseline-${page.viewportSize()!.width}-${theme}.png`),
      });
    }

    await trimLever.check();
    await expect(basis).toContainText('Grundplan');
    await expect(basis).toContainText('Vorschau');
    await expect(basis).toContainText('Stellschraube');
    await expect(basis).toContainText('aktiv');
    await expect(basis).toContainText('Variable Ausgaben um 10 % senken');
    await trimLever.uncheck();
    await expect(basis).not.toContainText('Variable Ausgaben um 10 % senken');

    const eventResponse = await page.request.post('/api/liquidity/events', {
      headers: { origin },
      data: {
        name: `Later synthetic event ${info.project.name}`,
        date: '2027-08-15',
        amountCents: 12_345,
        accountId: accountBody.account.id,
      },
    });
    expect(eventResponse.status(), await eventResponse.text()).toBe(201);
    const later = await api(page, '/api/liquidity?horizon=6m');
    expect(later.report?.eventMarks).toEqual([]);
    expect(later.events).toHaveLength(1);
    expect(['in_horizon', 'later']).toContain(later.events[0]?.status);
    await page.reload();
    await expect(basis).toContainText(
      'Geplante Ereignisse liegen außerhalb des gewählten Prognosezeitraums',
    );
    await expect(basis).not.toContainText('Noch keine geplanten Ereignisse eingerichtet');

    const recurringResponse = await page.request.post('/api/liquidity/events', {
      headers: { origin },
      data: {
        name: `Recurring synthetic event ${info.project.name}`,
        date: '2026-06-15',
        amountCents: 5_000,
        accountId: accountBody.account.id,
        recurrence: 'monthly',
      },
    });
    expect(recurringResponse.status(), await recurringResponse.text()).toBe(201);
    const recurring = await api(page, '/api/liquidity?horizon=6m');
    expect(
      recurring.report?.eventMarks.filter(
        (mark) => mark.label === `Recurring synthetic event ${info.project.name}`,
      ).length,
    ).toBeGreaterThan(1);
    await page.reload();
    await expect(page.getByTestId('liq-verdict')).toContainText('mit 1 geplantem Ereignis');
  },
);

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
  await expect(page.getByTestId('liq-scenario-basis')).toContainText(
    'Vorschau mit aktiver Stellschraube: Variable Ausgaben um 10 % senken',
  );
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
