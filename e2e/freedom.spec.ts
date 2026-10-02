import AxeBuilder from '@axe-core/playwright';
import { test as ledgerTest, expect } from '@playwright/test';
import { sampleTest as test } from './sample';
import { MAIN_URL } from '../playwright.config';
import { join } from 'node:path';
import type { FreedomView } from '@budget/db';
import { addMonths } from '@budget/domain';
import { pickCategory, toast } from './ledger-helpers';
import { eur } from '../apps/web/src/ledger/format';

test('live sources, explicit scenario, original design and native drill-down links', async ({
  page,
}, info) => {
  await page.goto('/vermoegen/freiheit');
  const data: FreedomView = await (await page.request.get('/api/wealth/freedom')).json();
  expect(data.investedCents).not.toBeNull();
  await expect(page.getByTestId('freedom-figure')).not.toContainText('—');
  await expect(page.getByLabel('Sparrate pro Monat', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Rendite nach Inflation')).toHaveValue('500');
  await expect(page.getByTestId('freedom-chart')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Zeitraum', exact: true })).toHaveCount(0);
  await page.getByLabel('Sparrate pro Monat', { exact: true }).fill('400+300');
  await expect(page.getByTestId('freedom-chart')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished),
      );
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      scrollTo(0, 0);
    });
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const input = await page.getByLabel('Sparrate pro Monat', { exact: true }).boundingBox();
    const currency = await page.locator('.amount-field .amount-cur').boundingBox();
    expect(currency!.x).toBeGreaterThan(input!.x + input!.width - 1);
    const base = process.env['BUDGET_FREEDOM_EVIDENCE'];
    await page.screenshot({
      path: base
        ? join(base, `freedom-${colorScheme}-${info.project.name}.png`)
        : info.outputPath(`freedom-${colorScheme}.png`),
      fullPage: true,
      animations: 'allow',
    });
    await page.screenshot({
      path: base
        ? join(base, `freedom-${colorScheme}-${info.project.name}-top.png`)
        : info.outputPath(`freedom-${colorScheme}-top.png`),
      animations: 'allow',
    });
    await page.locator('.freedom-chart').screenshot({
      path: base
        ? join(base, `freedom-${colorScheme}-${info.project.name}-chart.png`)
        : info.outputPath(`freedom-${colorScheme}-chart.png`),
      animations: 'allow',
    });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: /^Investiert/ }).click();
  await expect(page).toHaveURL(/#freedom-accounts$/);
  const source = page.locator('#freedom-accounts').getByRole('link').first();
  const href = await source.getAttribute('href');
  await source.click();
  await expect(page).toHaveURL(new RegExp(href!.split('?')[0]!));
  await page.goBack();
  await page.reload();
  await expect(page.getByLabel('Sparrate pro Monat', { exact: true })).toHaveValue(''); // reload does not restore unsaved assumptions
  await page
    .locator('#freedom-expenses')
    .getByRole('link', { name: 'Buchungen öffnen' })
    .last()
    .click();
  await expect(page).toHaveURL(/\/konten\/buchungen\?.*bis=2026-08-31/);
  await page.goto('/vermoegen/schulden');
  await expect(page.getByRole('group', { name: 'Zeitraum', exact: true })).toHaveCount(0);
  for (const path of ['/vermoegen/nettovermoegen', '/vermoegen/portfolio']) {
    await page.goto(path);
    await expect(page.getByRole('group', { name: 'Zeitraum', exact: true })).toBeVisible();
  }
});

const literal: FreedomView = {
  asOf: '2026-10-01',
  refMonth: '2026-09',
  months: Array.from({ length: 12 }, (_, i) => ({
    month: addMonths('2025-10', i),
    consumptionCents: i === 11 ? 4000 : 0,
  })),
  annualSpendCents: 4_000,
  multiple: 25,
  targetCents: 100_000,
  investedCents: 0,
  progressBp: 0,
  defaultRealReturnBp: 500,
  expensesUnsafe: false,
  accounts: [],
};
test('literal scenario boundaries, missing valuation and controlled retry', async ({ page }) => {
  let view = literal;
  let failing = true;
  await page.route('**/api/wealth/freedom', (route) =>
    failing
      ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
      : route.fulfill({ json: view }),
  );
  await page.goto('/vermoegen/freiheit');
  await expect(page.getByRole('alert')).toContainText('Freiheitszahl konnten nicht geladen');
  failing = false;
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  const saving = page.getByLabel('Sparrate pro Monat', { exact: true });
  await saving.fill('-1');
  await expect(page.getByRole('alert')).toContainText('Betrag ab 0');
  await saving.fill('50+50');
  await page.getByLabel('Rendite nach Inflation').selectOption('0');
  await expect(page.getByTestId('freedom-done')).toContainText('Aug. 2027');
  await expect(page.getByText('5 Monate früher', { exact: true })).toBeVisible();
  await saving.fill('0');
  await expect(page.getByTestId('freedom-done')).toHaveText('Nicht innerhalb von 60 Jahren');
  await saving.fill('90071992547409,91');
  await expect(page.getByRole('alert')).toContainText('Rechenbereich');
  await expect(page.getByTestId('freedom-chart')).toHaveCount(0);
  view = { ...literal, investedCents: 100_000, progressBp: 10000 };
  await page.reload();
  await page.getByLabel('Sparrate pro Monat', { exact: true }).fill('0');
  await expect(page.getByText('0 Monaten', { exact: true })).toBeVisible();
  view = {
    ...literal,
    investedCents: null,
    progressBp: null,
    accounts: [
      {
        id: 'unknown',
        name: 'Testanlage',
        valueCents: null,
        missingPrice: true,
        missingFxCurrencies: [],
      },
    ],
  };
  await page.reload();
  await expect(page.getByTestId('freedom-figure')).toContainText('—');
  await expect(page.locator('#freedom-expenses')).toContainText('40,00 €');
  await expect(page.locator('#freedom-accounts')).toContainText('Kurs fehlt');
  await page.getByLabel('Sparrate pro Monat', { exact: true }).fill('100');
  await expect(page.getByTestId('freedom-chart')).toHaveCount(0);
  view = { ...literal, months: [], annualSpendCents: 0, targetCents: 0, progressBp: null };
  await page.reload();
  await expect(page.locator('.vnw')).toContainText('Noch keine abgeschlossenen Budgetmonate');
  view = { ...literal, investedCents: -100, progressBp: -1 };
  await page.reload();
  await expect(page.getByTestId('freedom-figure')).toContainText('−0,0');
  const largeAnnual = Math.floor(Number.MAX_SAFE_INTEGER / 25);
  view = {
    ...literal,
    annualSpendCents: largeAnnual,
    months: literal.months.map((m, i) => ({ ...m, consumptionCents: i === 11 ? largeAnnual : 0 })),
    investedCents: largeAnnual * 25,
    targetCents: largeAnnual * 25,
    progressBp: 10000,
  };

  await page.reload();
  await expect(page.getByTestId('freedom-figure')).toContainText('100,0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

ledgerTest(
  'actual capture refreshes the shared expense basis and undo without reloading',
  async ({ page }, info) => {
    ledgerTest.skip(
      info.project.name !== 'desktop',
      'One writer to the aggregate main ledger; both viewports cover source/scenario rendering.',
    );
    const headers = { origin: MAIN_URL };
    const post = async (path: string, data: unknown) => {
      const response = await page.request.post(`/api${path}`, { headers, data });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const today = (await (await page.request.get('/api/accounts')).json()).asOf as string;
    const previous = addMonths(today.slice(0, 7), -1);
    const name = `Freiheit ${info.retry}`;
    const { account } = await post('/accounts', {
      name,
      type: 'checking',
      openingDate: `${previous}-01`,
      openingBalanceCents: 100_000,
    });
    await page.goto('/vermoegen/freiheit');
    await expect(page.getByRole('heading', { name: 'Freiheitszahl', exact: true })).toBeVisible();
    const before: FreedomView = await (await page.request.get('/api/wealth/freedom')).json();
    await page.keyboard.press('n');
    const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await panel.getByLabel('Konto', { exact: true }).selectOption(account.id);
    await panel.getByLabel('Datum', { exact: true }).fill(`${previous}-15`);
    await panel.getByLabel('Betrag', { exact: true }).fill('100');
    await pickCategory(panel, 'Essen');
    const refresh = () =>
      page.waitForResponse((r) => r.url().endsWith('/api/wealth/freedom') && r.ok());
    let response = refresh();
    const written = page.waitForResponse(
      (r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST' && r.ok(),
    );
    await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
    const groupId = (await (await written).json()).groupId;
    let ruleGroup: string | undefined;
    try {
      const updated: FreedomView = await (await response).json();
      expect(updated.annualSpendCents).not.toBeNull();
      await expect(page.getByTestId('freedom-annual-spend')).toContainText(
        eur(updated.annualSpendCents!),
      );
      expect(updated.months.some((m) => m.month === previous && m.consumptionCents !== null)).toBe(
        true,
      );
      response = refresh();
      await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
      const restored: FreedomView = await (await response).json();
      expect(restored.annualSpendCents).not.toBeNull();
      await expect(page.getByTestId('freedom-annual-spend')).toContainText(
        eur(restored.annualSpendCents!),
      );
      expect(restored.months.map((m) => m.month)).toEqual(before.months.map((m) => m.month));
      // Keep the cached Freedom query alive through native navigation; MAIN is isolated.
      await page.getByRole('link', { name: 'Einstellungen', exact: true }).click();
      await page.getByRole('link', { name: 'Regelwerk', exact: true }).click();
      await page.getByRole('button', { name: 'Schwelle R16 Freiheitszahl' }).click();
      const rulePanel = page.getByRole('dialog', { name: 'R16 Freiheitszahl', exact: true });
      const multiple = before.multiple === 20 ? 21 : 20;
      await rulePanel.getByLabel('Jahresausgaben mal').fill(String(multiple));
      const patched = page.waitForResponse(
        (r) => r.url().endsWith('/api/rules/R16') && r.request().method() === 'PATCH' && r.ok(),
      );
      await rulePanel.getByRole('button', { name: 'Speichern', exact: true }).click();
      ruleGroup = (await (await patched).json()).groupId;
      await expect(rulePanel.getByLabel('Jahresausgaben mal')).toHaveValue(String(multiple));
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'Vermögen', exact: true }).click();
      await page.getByRole('link', { name: 'Freiheitszahl', exact: true }).click();
      await expect(
        page.getByRole('link', { name: new RegExp(`^${multiple} Jahresausgaben`) }),
      ).toBeVisible();
      response = refresh();
      await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
      const reverted: FreedomView = await (await response).json();
      ruleGroup = undefined;
      expect(reverted.multiple).toBe(before.multiple);
      await expect(
        page.getByRole('link', { name: new RegExp(`^${before.multiple} Jahresausgaben`) }),
      ).toBeVisible();
    } finally {
      if (ruleGroup)
        await page.request.post('/api/undo', { headers, data: { groupId: ruleGroup } });
      // A failed assertion still restores this one aggregate-affecting test write.
      const history = await page.request.post('/api/undo', { headers, data: { groupId } });
      expect([200, 409]).toContain(history.status());
    }
  },
);
