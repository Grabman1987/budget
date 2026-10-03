import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PDF, PNG } from '../apps/server/src/receipts/testing';
import { MAIN_URL } from '../playwright.config';

test('capture receipt first, link, attach PDF, remove and undo', async ({
  page,
  request,
}, info) => {
  const tag = `Beleg ${info.project.name} ${info.retry}`;
  const headers = { origin: MAIN_URL };
  const accountResponse = await request.post(`${MAIN_URL}/api/accounts`, {
    headers,
    data: { name: tag, type: 'checking', openingDate: '2026-09-01', openingBalanceCents: 10000 },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = (await accountResponse.json()).account;
  const created = await request.post(`${MAIN_URL}/api/bookings`, {
    headers,
    data: {
      type: 'booking',
      accountId: account.id,
      date: '2026-09-01',
      amountCents: -1250,
      memo: tag,
      splits: [{ amountCents: -1250 }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const booking = await created.json();
  const filename = `${tag}.png`,
    pdfname = `${tag}.pdf`;
  await page.goto('/konten/posteingang');
  const unlinked = page.getByRole('region', { name: 'Beleg ohne Buchung' });
  await unlinked
    .getByLabel('Belegdatei auswählen')
    .setInputFiles({ name: filename, mimeType: 'image/png', buffer: PNG });
  const captured = unlinked.getByTestId('receipt-row').filter({ hasText: filename });
  await expect(captured).toBeVisible();
  await captured.getByRole('button', { name: 'Buchung zuordnen' }).click();
  await captured.getByLabel('Buchung suchen').fill(tag);
  await expect(
    captured.getByLabel('Buchung auswählen').locator('option', { hasText: tag }),
  ).toHaveCount(1);
  await captured.getByLabel('Buchung auswählen').selectOption(booking.id);
  await expect(captured).toHaveCount(0);
  await page
    .getByTestId('inbox-row')
    .filter({ hasText: tag })
    .getByRole('button', { name: 'Zuordnen' })
    .click();
  const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  const receipts = editor.getByRole('region', { name: 'Beleg', exact: true });
  const photo = receipts.getByTestId('receipt-row').filter({ hasText: filename });
  await expect(photo).toBeVisible();
  await photo.scrollIntoViewIfNeeded();
  await expect(photo.locator('img')).toHaveJSProperty('naturalWidth', 1);
  await expect(receipts.getByLabel('Beleg fotografieren')).toHaveAttribute(
    'capture',
    'environment',
  );
  await receipts
    .getByLabel('Belegdatei auswählen')
    .setInputFiles({ name: pdfname, mimeType: 'application/pdf', buffer: PDF });
  const pdf = receipts.getByTestId('receipt-row').filter({ hasText: pdfname });
  await expect(pdf).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await pdf.getByRole('link', { name: 'Herunterladen' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(pdfname);
  await photo.getByRole('button', { name: 'Verknüpfung entfernen' }).click();
  await expect(photo).toHaveCount(0);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(photo).toBeVisible();
  await page.locator('.toast.is-open').getByRole('button', { name: 'Wiederholen' }).click();
  await expect(photo).toHaveCount(0);
  await receipts.getByLabel('Beleg aus dem Posteingang').selectOption({ label: filename });
  await expect(photo).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => document.fonts.ready);
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
    await receipts.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`receipts-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await editor.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  const receiptIds = (
    await (await request.get(`${MAIN_URL}/api/receipts?bookingId=${booking.id}`)).json()
  ).receipts.map((r: { id: string }) => r.id);
  expect(
    (await request.delete(`${MAIN_URL}/api/bookings/${booking.id}`, { headers })).ok(),
  ).toBeTruthy();
  for (const id of receiptIds)
    expect((await request.delete(`${MAIN_URL}/api/receipts/${id}`, { headers })).ok()).toBeTruthy();
});
