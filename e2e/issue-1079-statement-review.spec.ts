import { expect } from '@playwright/test';
import { syntheticColumnarPayslipPdf } from '../apps/server/src/payslips/testing';
import { accountDocuments } from './ledger-helpers';
import { test } from './isolated-ledger';

test('checks a statement without inventing its number or period', async ({
  page,
  isolatedLedger,
}) => {
  const { origin } = isolatedLedger;
  const response = await page.request.post(origin + '/api/accounts', {
    headers: { origin },
    data: {
      name: 'Synthetische Karte',
      type: 'credit_card',
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    },
  });
  expect(response.status()).toBe(201);
  const accountId = (await response.json()).account.id as string;
  await page.goto(`/konten/${accountId}`);
  await accountDocuments(page);
  await page.getByRole('button', { name: 'Abrechnung hochladen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^Abrechnung (hochladen|prüfen)$/ });
  const bytes = await syntheticColumnarPayslipPdf(
    [
      [{ x: 40, text: 'Kartenabrechnung' }],
      [{ x: 40, text: 'Rechnungsdatum: 01.10.2026' }],
      [{ x: 40, text: 'Abrechnungsbetrag: 120,00 EUR' }],
      [{ x: 40, text: 'Einzugsdatum: 10.10.2026' }],
    ],
    '',
  );
  await dialog.getByLabel('Abrechnungs-PDF auswählen', { exact: true }).setInputFiles({
    name: 'synthetic.pdf',
    mimeType: 'application/pdf',
    buffer: bytes,
  });
  const save = dialog.getByRole('button', { name: 'Als geprüft speichern', exact: true });
  await expect(dialog.getByLabel('Abrechnungsbetrag', { exact: true })).toHaveValue('120,00');
  await dialog.getByLabel('Kartenreferenz', { exact: true }).fill('SYNTHETIC-CARD');
  await expect(save).toBeDisabled();
  await dialog
    .getByLabel('Abrechnungsnummer: im Original nicht angegeben', { exact: true })
    .check();
  await expect(save).toBeDisabled();
  await dialog.getByLabel('Zeitraum: im Original nicht angegeben', { exact: true }).check();
  await expect(dialog.getByLabel('Zeitraum von', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Zeitraum bis', { exact: true })).toHaveValue('');
  await save.click();
  await expect(
    dialog.getByText('Dokumentstand gespeichert. Keine Zahlung oder Buchung erstellt.', {
      exact: true,
    }),
  ).toBeVisible();
  const list = await page.request.get(`${origin}/api/statement-intake?accountId=${accountId}`);
  const intake = (await list.json()).intakes[0];
  expect(intake).toMatchObject({
    status: 'reviewed',
    reviewed: {
      fields: {
        reference: { value: null },
        periodFrom: { value: null },
        periodTo: { value: null },
      },
      reviewNotes: {
        numberNotPrinted: true,
        periodNotPrinted: true,
        cardReference: 'SYNTHETIC-CARD',
      },
    },
  });
  await expect(dialog).toContainText(intake.sha256);
});
