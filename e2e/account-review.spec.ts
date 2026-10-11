import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-11' });

test('checks off-budget accounts, updates manual values with undo and prepares the running month', async ({
  page,
  isolatedLedger,
}, info) => {
  test.setTimeout(120000);
  const write = async (method: string, path: string, data: unknown) => {
    const response = await page.request.fetch(`${isolatedLedger.origin}/api${path}`, {
      method,
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const accounts = [];
  for (const type of ['checking', 'loan', 'brokerage', 'p2p', 'other_asset']) {
    const { account } = await write('POST', '/accounts', {
      name: `Muster ${type}`,
      type,
      onBudget: false,
      openingDate: '2026-09-01',
    });
    accounts.push(account);
  }
  await write('POST', `/accounts/${accounts[0].id}/reconciliation`, {
    date: '2026-09-06',
    statementBalanceCents: 0,
  });
  await write('POST', `/accounts/${accounts[1].id}/reconciliation`, {
    date: '2026-09-07',
    statementBalanceCents: 0,
  });
  await write('PUT', `/accounts/${accounts[3].id}/valuation`, {
    date: '2026-09-06',
    valueCents: 12501,
  });
  await page.goto('/konten');
  const row = (name: string) =>
    page.locator('.ktable .krow').filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(row('Muster checking').getByText('geprüft am 06.09.2026')).toHaveClass(/is-stale/);
  await expect(row('Muster loan').getByText('geprüft am 07.09.2026')).not.toHaveClass(/is-stale/);
  await expect(row('Muster p2p').getByText('Wert vom 06.09.2026')).toHaveClass(/is-stale/);
  await expect(row('Muster brokerage').getByText('nie geprüft')).toBeVisible();
  const review = async (name: string) => {
    await page.waitForLoadState('networkidle');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${scheme}.png`), fullPage: true });
    }
  };
  await review('overview');
  for (const account of accounts.slice(0, 3)) {
    await page.goto(`/konten/${account.id}`);
    const button = page.getByRole('button', { name: 'Kontostand prüfen', exact: true });
    await expect(button).toBeVisible();
    if (info.project.name === 'mobile')
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const account of accounts.slice(3)) {
    await page.goto(`/konten/${account.id}`);
    await page.getByRole('button', { name: 'Wert aktualisieren', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Wert aktualisieren · ${account.name}` });
    await expect(dialog.getByLabel('Stichtag')).toHaveValue('11.10.2026');
    await dialog.getByLabel('Wert in EUR').fill('-1');
    await expect(dialog.getByText('Der Wert darf nicht negativ sein.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Wert speichern' })).toBeDisabled();
    await dialog.getByLabel('Wert in EUR').fill('150,02');
    await review('manual-value');
    const save = dialog.getByRole('button', { name: 'Wert speichern' });
    if (info.project.name === 'mobile')
      expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Letzter Wert: 150,02 €/)).toBeVisible();
    await page
      .locator('.toast.is-open')
      .getByRole('button', { name: 'Rückgängig', exact: true })
      .click();
    await expect(
      page.getByText(account.type === 'p2p' ? /Letzter Wert: 125,01 €/ : /Letzter Wert: 0,00 €/),
    ).toBeVisible();
  }
  await write('PATCH', '/month-close/2026-10', { currentStep: 2 });
  await page.goto('/monatsabschluss/2026-10');
  for (const account of accounts)
    await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible();
  const checking = page
    .locator('.close-row')
    .filter({ has: page.getByRole('heading', { name: 'Muster checking', exact: true }) });
  await checking.getByRole('button', { name: 'Kontostand prüfen', exact: true }).click();
  await expect(checking.getByLabel('Stichtag')).toHaveValue('11.10.2026');
  await expect(checking.getByText('Stichtag liegt in der Zukunft.')).toHaveCount(0);
  await checking.getByRole('button', { name: 'Einklappen', exact: true }).click();
  const manual = page
    .locator('.close-row')
    .filter({ has: page.getByRole('heading', { name: 'Muster p2p', exact: true }) });
  await manual.getByRole('button', { name: 'Wert aktualisieren', exact: true }).click();
  await expect(manual.getByLabel('Stichtag')).toHaveValue('11.10.2026');
  await expect(manual.getByRole('button', { name: 'Wert speichern' })).toBeEnabled();
  await review('month-close');
});
