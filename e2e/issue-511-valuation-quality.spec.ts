import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-20' });
const DAY = '2026-09-20';
function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.db
      .insert(schema.account)
      .values({
        id: 'synthetic-depot',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-09-01',
      })
      .run();
    for (const [id, cost] of [
      ['cost', 10000],
      ['missing', null],
      ['stale', null],
      ['fresh', null],
    ] as const) {
      opened.db
        .insert(schema.security)
        .values({ id, name: `Synthetic ${id}`, kind: 'stock', currency: 'EUR' })
        .run();
      opened.db
        .insert(schema.holding)
        .values({
          id: `holding-${id}`,
          accountId: 'synthetic-depot',
          securityId: id,
          asOf: '2026-09-01',
          unitsE8: 100000000,
          costBasisCents: cost,
        })
        .run();
    }
    opened.db
      .insert(schema.price)
      .values([
        {
          securityId: 'stale',
          date: '2026-09-12',
          priceMicro: 120000000,
          currency: 'EUR',
          source: 'manual',
        },
        {
          securityId: 'fresh',
          date: '2026-09-18',
          priceMicro: 120000000,
          currency: 'EUR',
          source: 'manual',
        },
      ])
      .run();
  } finally {
    opened.close();
  }
}
async function read(page: Page) {
  const response = await page.request.get('/api/heute');
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    attention: { quoteReview: { count: number; securityIds: string[] } };
  }>;
}
async function write(page: Page, origin: string, path: string, data: unknown, method = 'POST') {
  const response = await page.request.fetch(origin + '/api' + path, {
    method,
    data,
    headers: { origin },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ groupId: string }>;
}
async function currentDetail(page: Page) {
  const more = page.getByRole('button', { name: 'Mehr zum Monat', exact: true });
  await expect(more).toBeVisible();
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const hint = page.getByRole('button', {
    name: 'Bewertungsgrundlage · Nettovermögen',
    exact: true,
  });
  await hint.scrollIntoViewIfNeeded();
  return hint;
}

test('one current quote task and local disclosures follow real manual quote save and audited undo', async ({
  page,
  isolatedLedger,
}) => {
  seed(isolatedLedger.databasePath);
  await page.goto('/konten');
  const response = await page.request.get('/api/accounts');
  expect(response.status()).toBe(200);
  expect((await response.json()).netWorthEurCents).toBe(34000);
  await page.goto('/vermoegen/nettovermoegen');
  await expect(page.getByTestId('nw-figure')).toHaveText('340,00 €');
  await page.goto('/konten');
  const depotValue = page
    .locator('[data-account-id="synthetic-depot"]')
    .getByTestId('account-value');
  await expect(depotValue).toHaveText('≈ 340,00 €');
  await page.getByRole('button', { name: 'Details zu Synthetic depot', exact: true }).click();
  await expect(depotValue.getByRole('button')).toHaveCount(0);
  const hint = page.getByRole('button', {
    name: 'Bewertungsgrundlage · Synthetic depot',
    exact: true,
  });
  expect(
    await page
      .locator('.overview-detail')
      .getByRole('button', { name: 'Bewertungsgrundlage · Synthetic depot', exact: true })
      .count(),
  ).toBe(1);
  await hint.focus();
  const popup = page.locator(`[id="${await hint.getAttribute('aria-describedby')}"]`);
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('Kurs vom 12.09.2026 fortgeschrieben');
  await expect(popup).toContainText('Bewertung fehlt');
  await page.keyboard.press('Escape');
  expect((await read(page)).attention.quoteReview).toEqual({
    count: 3,
    securityIds: ['cost', 'missing', 'stale'],
  });
  await page.goto('/');
  if (page.viewportSize()!.width === 390)
    await expect(page.getByRole('button', { name: 'Mehr zum Monat', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  const kpi = page.getByRole('region', { name: 'Nettovermögen', exact: true });
  await expect(kpi.locator('[data-kennzahl="nettovermoegen"]')).toHaveText('340,00 €');
  await expect(kpi.locator('.heute-answer-value')).toHaveCount(1);
  await expect(kpi.locator('.heute-answer-value')).toHaveText('340,00 €');
  const amountLinkBox = await kpi
    .getByRole('link', { name: '340,00 €', exact: true })
    .boundingBox();
  expect(amountLinkBox).not.toBeNull();
  expect(amountLinkBox!.width).toBeGreaterThanOrEqual(44);
  expect(amountLinkBox!.height).toBeGreaterThanOrEqual(44);
  const kpiMarker = kpi.getByRole('button', {
    name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl',
    exact: true,
  });
  await kpiMarker.focus();
  await expect(
    page.locator(`[id="${await kpiMarker.getAttribute('aria-describedby')}"]`),
  ).toContainText('Einstandswert als Schätzung');
  await page.keyboard.press('Escape');
  await expect(
    page.locator('.heute-wealth-line').getByRole('button', {
      name: 'Bewertungsgrundlage · Verlauf Nettovermögen · aktueller Stand',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('3 Wertpapiere ohne aktuellen Kurs', { exact: true })).toBeVisible();
  const action = page.getByRole('link', { name: 'Kurse prüfen', exact: true });
  await action.click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio$/);
  const saved = await write(
    page,
    isolatedLedger.origin,
    `/securities/cost/prices/${DAY}`,
    { priceMicro: 120000000 },
    'PUT',
  );
  expect(typeof saved.groupId).toBe('string');
  expect((await read(page)).attention.quoteReview).toEqual({
    count: 2,
    securityIds: ['missing', 'stale'],
  });
  expect((await (await page.request.get('/api/accounts')).json()).netWorthEurCents).toBe(36000);
  await write(page, isolatedLedger.origin, '/undo', { groupId: saved.groupId });
  expect((await read(page)).attention.quoteReview).toEqual({
    count: 3,
    securityIds: ['cost', 'missing', 'stale'],
  });
  expect((await (await page.request.get('/api/accounts')).json()).netWorthEurCents).toBe(34000);
  await page.goto('/');
  const current = await currentDetail(page);
  await current.focus();
  await expect(
    page.locator(`[id="${await current.getAttribute('aria-describedby')}"]`),
  ).toContainText('Einstandswert als Schätzung');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+H');
  await expect(current).toBeVisible();
  await current.click();
  const privatePopup = page.locator(`[id="${await current.getAttribute('aria-describedby')}"]`);
  await expect(privatePopup).toBeVisible();
  expect(await privatePopup.textContent()).not.toContain('340');
  await expect(privatePopup).toContainText('12.09.2026');
  await page.keyboard.press('Escape');
  const privateKpi = page.getByRole('region', { name: 'Nettovermögen', exact: true });
  await expect(privateKpi.locator('[data-kennzahl="nettovermoegen"]')).toHaveText('••• €');
  const privateKpiMarker = privateKpi.getByRole('button', {
    name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl',
    exact: true,
  });
  await privateKpiMarker.focus();
  const privateKpiPopup = page.locator(
    `[id="${await privateKpiMarker.getAttribute('aria-describedby')}"]`,
  );
  await expect(privateKpiPopup).toBeVisible();
  await expect(privateKpiPopup).toContainText('Einstandswert als Schätzung');
  expect(await privateKpiPopup.textContent()).not.toContain('340');
  await page.keyboard.press('Escape');
  await page.goto('/vermoegen/nettovermoegen');
  await expect(page.getByTestId('nw-figure')).toHaveText('•••,••• €');
  await page.goto('/konten');
  await expect(depotValue).toHaveText('≈ ••• €');
  await page.getByRole('button', { name: 'Details zu Synthetic depot', exact: true }).click();
  const privateAccountMarker = page.getByRole('button', {
    name: 'Bewertungsgrundlage · Synthetic depot',
    exact: true,
  });
  await expect(depotValue.getByRole('button')).toHaveCount(0);
  await privateAccountMarker.focus();
  const privateAccountPopup = page.locator(
    `[id="${await privateAccountMarker.getAttribute('aria-describedby')}"]`,
  );
  await expect(privateAccountPopup).toBeVisible();
  await expect(privateAccountPopup).toContainText('Einstandswert als Schätzung');
  expect(await privateAccountPopup.textContent()).not.toContain('340');
});
async function theme(page: Page, selected: 'light' | 'dark') {
  const resolved = () =>
    page.evaluate(() => {
      const value = document.documentElement.dataset['theme'];
      return value === 'light' || value === 'dark'
        ? value
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  if ((await resolved()) === selected) return;
  if (page.viewportSize()!.width === 390) {
    const summary = page.locator('.m-profile > summary');
    await summary.click();
    await page
      .locator('.m-profile')
      .getByRole('button', {
        name: selected === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .click();
    await summary.click();
  } else
    await page
      .locator('.sidebar-foot')
      .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
      .click();
  await expect.poll(resolved).toBe(selected);
}
async function capture(page: Page, info: TestInfo, label: string) {
  for (const selected of ['light', 'dark'] as const) {
    for (const surface of ['accounts', 'today'] as const) {
      await page.goto(surface === 'accounts' ? '/konten' : '/');
      await theme(page, selected);
      if (surface === 'today') {
        const amountLink = page
          .getByRole('region', { name: 'Nettovermögen', exact: true })
          .getByRole('link', { name: '340,00 €', exact: true });
        await expect(amountLink).toBeVisible();
        const amountBox = await amountLink.boundingBox();
        expect(amountBox).not.toBeNull();
        expect(amountBox!.width).toBeGreaterThanOrEqual(44);
        expect(amountBox!.height).toBeGreaterThanOrEqual(44);
        const kpiMarker = page
          .getByRole('region', { name: 'Nettovermögen', exact: true })
          .getByRole('button', {
            name: 'Bewertungsgrundlage · Nettovermögen · Kennzahl',
            exact: true,
          });
        await kpiMarker.scrollIntoViewIfNeeded();
        await kpiMarker.focus();
        const kpiBox = (await kpiMarker.boundingBox())!;
        expect(kpiBox.width).toBeGreaterThanOrEqual(44);
        expect(kpiBox.height).toBeGreaterThanOrEqual(44);
        await expect(
          page.locator(`[id="${await kpiMarker.getAttribute('aria-describedby')}"]`),
        ).toBeVisible();
        await expect(
          page.locator(`[id="${await kpiMarker.getAttribute('aria-describedby')}"]`),
        ).toContainText('Einstandswert als Schätzung');
        await page.keyboard.press('Escape');
      }
      if (surface === 'accounts')
        await page.getByRole('button', { name: 'Details zu Synthetic depot', exact: true }).click();
      const hint =
        surface === 'today'
          ? await currentDetail(page)
          : page.getByRole('button', {
              name: 'Bewertungsgrundlage · Synthetic depot',
              exact: true,
            });
      await hint.scrollIntoViewIfNeeded();
      await hint.focus();
      const box = (await hint.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const popup = page.locator(`[id="${await hint.getAttribute('aria-describedby')}"]`);
      await expect(popup).toBeVisible();
      await expect(popup).toContainText('Bewertung fehlt');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({
        path: info.outputPath(`valuation-${label}-${surface}-${selected}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      const runtime = await page.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight },
        coarse: matchMedia('(pointer: coarse)').matches,
        deviceScaleFactor: devicePixelRatio,
        rawMaxTouchPoints: navigator.maxTouchPoints,
        theme: document.documentElement.dataset['theme'] ?? 'system',
      }));
      const path = info.outputPath(`valuation-${label}-${surface}-${selected}.json`);
      await writeFile(
        path,
        JSON.stringify(
          {
            engine: page.context().browser()!.browserType().name(),
            project: info.project.name,
            label,
            surface,
            configuredContext:
              label === 'desktop-layout'
                ? {
                    viewport: { width: 1440, height: 900 },
                    isMobile: false,
                    hasTouch: false,
                    deviceScaleFactor: 1,
                  }
                : {
                    viewport: info.project.use.viewport,
                    isMobile: info.project.use.isMobile,
                    hasTouch: info.project.use.hasTouch,
                    deviceScaleFactor: info.project.use.deviceScaleFactor,
                  },
            actions: 'Playwright click/focus; no observed touch-event claim',
            ...runtime,
          },
          null,
          2,
        ),
      );
      await info.attach(`valuation-${label}-${surface}-${selected}`, {
        path,
        contentType: 'application/json',
      });
    }
  }
}
test('local source controls are readable and keyboard accessible in real phone and desktop light/dark contexts', async ({
  page,
  browser,
  isolatedLedger,
}, info) => {
  test.setTimeout(90_000); // Eight actual surface/theme captures plus two-context accessibility checks.
  seed(isolatedLedger.databasePath);
  await capture(page, info, 'configured-profile');
  const desktop = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: await page.context().storageState(),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  try {
    const other = await desktop.newPage();
    await other.clock.setFixedTime(new Date('2026-09-20T12:00:00+02:00'));
    await capture(other, info, 'desktop-layout');
  } finally {
    await desktop.close();
  }
});
