/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers of the API are read, not typed */
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

/**
 * Vermögen › Schulden: dated rate changes (variable conditions), persisted scenarios compared with
 * the baseline, and the multi-debt strategy comparison. Synthetic loan and card on an empty ledger.
 */

async function post(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Record<string, any>;
}

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function audit(page: Page) {
  const shell = await new AxeBuilder({ page }).analyze();
  expect(shell.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
  expect((await new AxeBuilder({ page }).include('.debts-view').analyze()).violations).toEqual([]);
  expect(await noOverflow(page)).toBe(true);
}

test('rate changes, scenarios and strategies on Schulden', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  test.setTimeout(180_000);
  const origin = isolatedLedger.origin;
  await post(request, origin, '/accounts', {
    name: 'Kredit Muster',
    type: 'loan',
    openingDate: '2026-09-01',
    openingBalanceCents: -1_217_600,
    interestRateBp: 632,
    interestKind: 'variable',
    installmentCents: 41_200,
    monthlyFeeCents: 0,
  });
  await post(request, origin, '/accounts', {
    name: 'Karte Muster',
    type: 'credit_card',
    openingDate: '2026-09-01',
    openingBalanceCents: -150_000,
    interestRateBp: 1_800,
  });

  await page.goto('/vermoegen/schulden');
  await page.getByText('Rechenweg', { exact: true }).click();
  const baseline = page.getByTestId('loan-baseline');
  await expect(baseline).toContainText('Juni 2029');
  await expect(baseline).toContainText('33 Monate');
  await expect(baseline).toContainText('1.094,05');

  // Scenario: 300 € extra every month; compared in literal cents.
  await page.getByRole('button', { name: 'Szenario anlegen', exact: true }).click();
  const scenario = page.getByRole('dialog', { name: 'Szenario anlegen' });
  await scenario.getByLabel('Name des Szenarios').fill('Mehr tilgen');
  await scenario.getByLabel('Betrag je Zahlung (EUR)').fill('300');
  await scenario.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(scenario.getByTestId('loan-preview')).toContainText('März 2028');
  await expect(scenario.getByTestId('loan-preview')).toContainText('15 früher');
  expect(await noOverflow(page)).toBe(true);
  await scenario.getByRole('button', { name: 'Szenario speichern' }).click();
  await expect(toast(page)).toContainText('Szenario gespeichert.');
  const row = page.getByTestId('loan-scenario-row').filter({ hasText: 'Mehr tilgen' });
  await expect(row).toContainText('März 2028');
  await expect(row).toContainText('18 Monate');
  await expect(row).toContainText('617,26');
  await expect(row).toContainText('476,79');
  await expect(row).toContainText('15 früher');

  // Persisted: survives a reload.
  await page.reload();
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByTestId('loan-scenario-row')).toHaveCount(1);

  // Variable conditions: 0 % from 2027 changes the baseline; undo brings the old value back.
  await page.getByRole('button', { name: 'Zinsänderung erfassen', exact: true }).click();
  const rate = page.getByRole('dialog', { name: 'Zinsänderung erfassen' });
  await rate.getByLabel('Gültig ab').fill('2027-01-01');
  await rate.getByLabel('Nominaler Jahreszins (%)').fill('0');
  await rate.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(toast(page)).toContainText('Zinsänderung gespeichert.');
  await expect(page.getByRole('cell', { name: '0,00 %' })).toBeVisible();
  await expect(baseline).toContainText('186,87');
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(baseline).toContainText('1.094,05');
  await expect(page.getByText('Noch keine Zinsänderung erfasst.')).toBeVisible();
  // Redo ("Wiederholen") and keep it: the scenario is compared against the new baseline.
  await toast(page).getByRole('button', { name: 'Wiederholen' }).click();
  await expect(baseline).toContainText('186,87');
  await expect(row).toContainText('früher');

  // The same day twice is refused with a German message.
  await page.getByRole('button', { name: 'Zinsänderung erfassen', exact: true }).click();
  await rate.getByLabel('Gültig ab').fill('2027-01-01');
  await rate.getByLabel('Nominaler Jahreszins (%)').fill('2');
  await rate.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(toast(page)).toContainText('bereits eine Zinsänderung');
  await rate.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(rate).toBeHidden();

  // Strategies: the card has no minimum stored, so it is asked for explicitly.
  const strategy = page.getByRole('region', { name: /Tilgungsstrategie/ });
  await expect(strategy).toBeVisible();
  await strategy.getByRole('button', { name: 'Strategien vergleichen' }).click();
  await expect(strategy.getByRole('alert')).toContainText('ausdrücklich');
  await strategy.getByLabel('Gebühr von Kredit Muster je Monat (EUR)').fill('0');
  await strategy.getByLabel('Gebühr von Karte Muster je Monat (EUR)').fill('0');
  await strategy.getByLabel('Mindestrate von Karte Muster (EUR)').fill('50');
  await strategy.getByLabel('Zusatzbetrag pro Monat (EUR)').fill('200');
  await strategy.getByRole('button', { name: 'Strategien vergleichen' }).click();
  const result = strategy.getByTestId('strategy-result');
  await expect(result.getByTestId('strategy-avalanche')).toBeVisible();
  await expect(result.getByTestId('strategy-snowball')).toBeVisible();
  await expect(result.getByTestId('strategy-minimum')).toBeVisible();
  await expect(strategy).toContainText(/Avalanche spart|Beide Strategien|schneeball spart/i);

  // Light and dark: accessible, no horizontal page overflow.
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    await audit(page);
  }
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'light';
  });

  // Edit and delete a scenario; delete is undoable.
  await page.getByRole('button', { name: 'Szenario Mehr tilgen bearbeiten' }).click();
  const edit = page.getByRole('dialog', { name: 'Szenario bearbeiten' });
  await edit.getByLabel('Betrag je Zahlung (EUR)').fill('100');
  await edit.getByRole('button', { name: 'Maßnahme hinzufügen' }).click();
  await edit.getByLabel('Betrag (EUR)').fill('2.000');
  if (isMobile) expect(await noOverflow(page)).toBe(true);
  await edit.getByRole('button', { name: 'Szenario speichern' }).click();
  await expect(toast(page)).toContainText('Szenario gespeichert.');
  await expect(row).toContainText('Einmalig');
  await page.getByRole('button', { name: 'Szenario Mehr tilgen löschen' }).click();
  await expect(page.getByTestId('loan-scenario-row')).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByTestId('loan-scenario-row')).toHaveCount(1);
});

test('missing loan terms are named instead of guessed', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const origin = isolatedLedger.origin;
  await post(request, origin, '/accounts', {
    name: 'Kredit ohne Rate',
    type: 'loan',
    openingDate: '2026-09-01',
    openingBalanceCents: -300_000,
  });
  await page.goto('/vermoegen/schulden');
  await page.getByText('Rechenweg', { exact: true }).click();
  await expect(page.getByTestId('loan-missing')).toContainText('Zinssatz und Monatsrate');
  await expect(page.getByRole('button', { name: 'Szenario anlegen', exact: true })).toBeDisabled();
  // One debt only: no strategy comparison.
  await expect(page.getByRole('region', { name: /Tilgungsstrategie/ })).toHaveCount(0);
});
