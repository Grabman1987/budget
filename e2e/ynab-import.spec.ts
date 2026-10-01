import AxeBuilder from '@axe-core/playwright';
import { ynabExport, YNAB_FILE_NAMES } from '@budget/fixtures/ynab';
import { expect, test, type Page } from '@playwright/test';
import { IMPORT_URLS } from '../playwright.config';
import { bootstrapPasskey } from './bootstrap';

/**
 * YNAB import end to end with the synthetic export (never the real one): upload, wizard, dry run,
 * commit, the Gate 2 report, a re-import of the same export without changes and the undo of both
 * runs. Each viewport has its own empty server; the first passkey is registered through the API,
 * which also counts as the step-up the upload and the commit need.
 */

const it = test.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern
  baseURL: async ({}, use, info) =>
    use(info.project.name === 'mobile' ? IMPORT_URLS.mobile : IMPORT_URLS.desktop),
  storageState: { cookies: [], origins: [] },
});

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}

async function upload(page: Page) {
  const files = ynabExport(1);
  await page.goto('/einstellungen/datenquellen');
  await page.getByLabel('Exportdateien').setInputFiles([
    {
      name: YNAB_FILE_NAMES.register,
      mimeType: 'text/tab-separated-values',
      buffer: Buffer.from(files.register),
    },
    {
      name: YNAB_FILE_NAMES.plan,
      mimeType: 'text/tab-separated-values',
      buffer: Buffer.from(files.plan),
    },
  ]);
  await page.getByRole('button', { name: 'Hochladen' }).click();
  await expect(page.getByRole('heading', { name: 'Konten', level: 2 })).toBeVisible({
    timeout: 30_000,
  });
}

async function dryRunAndCommit(page: Page) {
  await page
    .getByRole('button', { name: /Probelauf/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Probelauf starten' }).click();
  await expect(page.getByText('ohne Differenz')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Import übernehmen' }).click();
  await expect(page.getByRole('heading', { name: 'Importläufe' })).toBeVisible({ timeout: 60_000 });
}

it('YNAB import: full import, re-import without changes, undo of the runs', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await bootstrapPasskey(page.request, baseURL as string, test.info().outputPath('state.json'));
  const go = (path: string) => page.goto(path);

  await test.step('upload and walk through the wizard', async () => {
    await go('/einstellungen/datenquellen');
    await expect(page.getByText('Noch kein Import.')).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await upload(page);
    // Accounts: proposals from the rows; one closed account is left out.
    await expect(page.getByRole('switch', { name: /übernehmen$/ }).first()).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Speichern und weiter: Kategorien' }).click();
    await expect(page.getByRole('heading', { name: 'Zielstruktur' })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Speichern und weiter: Regeln' }).click();
    await page.getByRole('button', { name: 'Speichern und weiter: Empfänger' }).click();
    await expect(page.getByRole('table', { name: 'Empfänger aus YNAB' })).toBeVisible();
    await page.getByRole('button', { name: 'Speichern und weiter: Startmonat' }).click();
    await expect(page.getByLabel('Startmonat', { exact: true })).toHaveValue('2023-10');
    expect(await axe(page)).toEqual([]);
  });

  await test.step('dry run without difference, then commit', async () => {
    await dryRunAndCommit(page);
    await expect(page.getByRole('cell', { name: 'übernommen' })).toBeVisible();
    await go('/konten');
    await expect(page.getByText('Girokonto').first()).toBeVisible();
  });

  await test.step('the Gate 2 report lists no difference and prints', async () => {
    await go('/einstellungen/datenquellen');
    await page.getByRole('link', { name: 'Abgleich', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Abgleich mit YNAB' })).toBeVisible();
    await expect(page.getByText('ohne Differenz')).toBeVisible();
    await expect(page.getByText(/Keine Differenz: das Budget der App/)).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });

  await test.step('the same export again changes nothing', async () => {
    await upload(page);
    await page
      .getByRole('button', { name: /Probelauf/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Probelauf starten' }).click();
    await expect(page.getByText(/^0 neu · \d+ unverändert · 0 mit neuem Status/)).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Import übernehmen' }).click();
    await expect(page.getByRole('heading', { name: 'Importläufe' })).toBeVisible({
      timeout: 60_000,
    });
  });

  await test.step('undo: the newer run first, then the first import as a whole', async () => {
    const undo = page.getByRole('button', { name: 'Rückgängig', exact: true });
    const reverted = page.getByRole('cell', { name: /rückgängig gemacht$/ });
    await expect(undo).toHaveCount(2);
    for (const count of [1, 2]) {
      await undo.first().click();
      await page.getByRole('button', { name: 'Wirklich rückgängig' }).click();
      await expect(reverted).toHaveCount(count, { timeout: 60_000 });
    }
    await expect(page.getByRole('cell', { name: /übernommen$/ })).toHaveCount(0);
    await go('/konten');
    await expect(page.getByText('Girokonto')).toHaveCount(0);
  });
});
