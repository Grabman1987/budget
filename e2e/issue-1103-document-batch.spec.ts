import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { syntheticPayslipPdf, syntheticWageRows } from '../apps/server/src/payslips/testing';

test('batch selection and drop keep independent results, editable suggestions and retries', async ({
  page,
  isolatedLedger,
}, testInfo) => {
  const { origin } = isolatedLedger;
  const ids: string[] = [];
  for (const [name, type] of [
    ['Muster Karte', 'credit_card'],
    ['Muster Giro', 'checking'],
  ]) {
    const created = await page.request.post(origin + '/api/accounts', {
      headers: { origin },
      data: { name, type, openingDate: '2026-01-01' },
    });
    expect(created.status()).toBe(201);
    ids.push((await created.json()).account.id);
  }
  const classified: string[] = [];
  let fail = true;
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/(receipts|statement-intake|payslips)(\/|$)/.test(request.url())
    )
      writes.push(request.url());
  });
  await page.route('**/api/document-intake/classify', async (route) => {
    const name = /filename="([^"]+)"/.exec(route.request().postData() ?? '')?.[1] ?? '';
    classified.push(name);
    if (name === 'retry.pdf' && fail) {
      await route.fulfill({
        status: 422,
        json: { error: 'synthetic_failure', message: 'Prüfung fehlgeschlagen.' },
      });
      return;
    }
    await route.fulfill({
      json: {
        type: 'card_statement',
        confidence: 'certain',
        hints: { mime: 'application/pdf' },
        needsPassword: false,
      },
    });
  });
  await page.goto('/konten/pruefen');
  const global = page.getByRole('button', { name: 'Neues Dokument hochladen', exact: true });
  if (await global.count()) await global.click();
  else await page.getByRole('button', { name: 'Dokument hochladen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dokument hochladen', exact: true });
  await dialog.getByLabel('Dokument auswählen').setInputFiles([
    { name: 'good.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic good') },
    { name: 'retry.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic retry') },
  ]);
  const good = dialog.getByRole('region', { name: 'good.pdf', exact: true });
  const retry = dialog.getByRole('region', { name: 'retry.pdf', exact: true });
  await expect(good.getByText('Erkannt: Kreditkartenabrechnung')).toBeVisible();
  await expect(good.getByLabel('Konto', { exact: true })).toHaveValue(ids[0]!);
  await good.getByLabel('Konto', { exact: true }).selectOption(ids[1]!);
  await expect(retry.getByRole('alert')).toHaveText('Prüfung fehlgeschlagen.');
  fail = false;
  await retry.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(retry.getByText('Erkannt: Kreditkartenabrechnung')).toBeVisible();
  await expect(good.getByLabel('Konto', { exact: true })).toHaveValue(ids[1]!);
  expect(classified.filter((name) => name === 'good.pdf')).toHaveLength(1);
  expect(classified.filter((name) => name === 'retry.pdf')).toHaveLength(2);

  const files = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['synthetic drop'], 'dropped.pdf', { type: 'application/pdf' }));
    transfer.items.add(new File([], 'empty.pdf', { type: 'application/pdf' }));
    return transfer;
  });
  await dialog
    .getByRole('region', { name: 'Dokument ablegen' })
    .dispatchEvent('drop', { dataTransfer: files });
  await files.dispose();
  await expect(
    dialog.getByRole('region', { name: 'dropped.pdf' }).getByLabel('Konto', { exact: true }),
  ).toHaveValue(ids[0]!);
  await expect(dialog.getByRole('region', { name: 'empty.pdf' }).getByRole('alert')).toHaveText(
    'Bitte eine Datei bis 15 MB auswählen.',
  );
  expect(writes).toEqual([]);
  await expect(dialog.getByRole('region', { name: 'good.pdf' })).toBeVisible();
  const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
  await good.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('document-batch.png') });
});

for (const type of ['receipt', 'payslip']) {
  test(`outcome navigation closes the retained batch after ${type} review`, async ({ page }) => {
    await page.goto('/konten/pruefen');
    const bytes = await syntheticPayslipPdf(syntheticWageRows, '');
    await page.route('**/api/document-intake/classify', async (route) => {
      await route.fulfill({
        json: {
          type,
          confidence: 'certain',
          hints: { mime: 'application/pdf' },
          needsPassword: false,
        },
      });
    });
    const global = page.getByRole('button', { name: 'Neues Dokument hochladen', exact: true });
    if (await global.count()) await global.click();
    else await page.getByRole('button', { name: 'Dokument hochladen', exact: true }).click();
    const batch = page.getByRole('dialog', { name: 'Dokument hochladen', exact: true });
    await batch.getByLabel('Dokument auswählen').setInputFiles([
      { name: `${type}.pdf`, mimeType: 'application/pdf', buffer: bytes },
      { name: 'remaining.pdf', mimeType: 'application/pdf', buffer: bytes },
    ]);
    const row = batch.getByRole('region', { name: `${type}.pdf`, exact: true });
    await row.getByRole('button', { name: 'Weiter', exact: true }).click();
    const outcome =
      type === 'receipt'
        ? row.getByRole('region', { name: 'Ergebnis des Uploads' })
        : page
            .getByRole('dialog', { name: /^Gehaltszettel (hochladen|prüfen)/ })
            .getByRole('region', { name: 'Ergebnis des Uploads' });
    await outcome.getByRole('link', { name: 'Zu Prüfen' }).click();
    await expect(batch).toBeHidden();
    await expect(
      page.getByRole('dialog', { name: /^Gehaltszettel (hochladen|prüfen)/ }),
    ).toHaveCount(0);
    await page.unroute('**/api/document-intake/classify');
  });
}
