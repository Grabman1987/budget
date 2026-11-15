import { expect } from '@playwright/test';
import { syntheticColumnarPayslipPdf } from '../apps/server/src/payslips/testing';
import { accountDocuments } from './ledger-helpers';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });

// Synthetic plain document: no statement or payroll label, so it is filed as a receipt.
test('central document upload recognises a plain document and files it as a receipt', async ({
  page,
  isolatedLedger,
}) => {
  const { origin } = isolatedLedger;
  const created = await page.request.post(origin + '/api/accounts', {
    headers: { origin },
    data: { name: 'Dokument Muster', type: 'checking', openingDate: '2026-01-01' },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).account.id as string;
  await page.goto(`/konten/${id}`);
  await accountDocuments(page);
  await page.getByRole('button', { name: 'Dokument hochladen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dokument hochladen' });
  await expect(dialog).toBeVisible();
  const bytes = await syntheticColumnarPayslipPdf([[{ x: 40, text: 'Synthetic till slip' }]], '');
  await dialog
    .getByLabel('Dokument auswählen')
    .setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(dialog.getByText('Erkannt: Beleg')).toBeVisible();
  await expect(dialog.getByText('Es wird nichts gebucht.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await expect(dialog).toBeHidden();
  const receipts = await page.request.get(origin + '/api/receipts');
  expect((await receipts.json()).receipts).toHaveLength(1);
});
