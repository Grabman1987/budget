import { expect, type Page } from '@playwright/test';
import {
  syntheticColumnarPayslipPdf,
  syntheticPayslipPdf,
  syntheticWageRows,
} from '../apps/server/src/payslips/testing';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });

// Synthetic card layout: every label and number is invented.
const cardRows = [
  [{ x: 40, text: 'Kartenabrechnung' }],
  [{ x: 40, text: 'Rechnungsnummer: DEMO-01' }],
  [{ x: 40, text: 'Rechnungtdaium: 01.10.2026' }],
  [{ x: 40, text: 'Abrechnungszeitraum: 01.09.2026 - 30.09.2026' }],
  [
    { x: 40, text: 'Total Neto' },
    { x: 280, text: 'MwSt Betrag' },
    { x: 440, text: 'Toial Bruto in EUR' },
  ],
  [
    { x: 40, text: 'Kartensumme ****1234' },
    { x: 520, text: '70,00', right: true },
  ],
  [
    { x: 40, text: 'Gesamt Firmensumme' },
    { x: 250, text: '100,00', right: true },
    { x: 410, text: '20,00', right: true },
    { x: 520, text: '120,00', right: true },
  ],
];

/** The global top-bar action with the redesign on; the page-level button otherwise. */
async function openCentralUpload(page: Page) {
  const global = page.getByRole('button', { name: 'Neues Dokument hochladen', exact: true });
  if (await global.count()) await global.click();
  else await page.getByRole('button', { name: 'Dokument hochladen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Dokument hochladen' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('central upload: a payslip ends in a result summary with a link to Prüfen', async ({
  page,
  isolatedLedger,
}) => {
  const { origin } = isolatedLedger;
  const created = await page.request.post(origin + '/api/accounts', {
    headers: { origin },
    data: { name: 'Gehalt Muster', type: 'checking', openingDate: '2026-01-01' },
  });
  expect(created.status()).toBe(201);
  await page.goto('/konten/pruefen');
  const dialog = await openCentralUpload(page);
  const bytes = await syntheticPayslipPdf(syntheticWageRows, '');
  await dialog
    .getByLabel('Dokument auswählen')
    .setInputFiles({ name: 'synthetic-payslip.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(dialog.getByText(/Erkannt: Gehaltszettel/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  const flow = page.getByRole('dialog', { name: 'Gehaltszettel hochladen' });
  const summary = flow.getByRole('region', { name: 'Ergebnis des Uploads' });
  await expect(summary).toContainText('Erkannt: Gehaltszettel');
  await expect(summary.getByRole('link', { name: 'Zu Prüfen' })).toHaveAttribute(
    'href',
    '/konten/pruefen',
  );
});

test('central upload: a card statement ends in a result summary with a link to Prüfen', async ({
  page,
  isolatedLedger,
}) => {
  const { origin } = isolatedLedger;
  const created = await page.request.post(origin + '/api/accounts', {
    headers: { origin },
    data: { name: 'Karte Muster', type: 'credit_card', openingDate: '2026-01-01' },
  });
  expect(created.status()).toBe(201);
  await page.goto('/konten/pruefen');
  const dialog = await openCentralUpload(page);
  const bytes = await syntheticColumnarPayslipPdf(cardRows, '');
  await dialog
    .getByLabel('Dokument auswählen')
    .setInputFiles({ name: 'synthetic-card.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(dialog.getByText(/Erkannt: Kreditkartenabrechnung/)).toBeVisible();
  await dialog.getByLabel('Konto').selectOption({ label: 'Karte Muster' });
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  const flow = page.getByRole('dialog', { name: 'Abrechnung prüfen' });
  const summary = flow.getByRole('region', { name: 'Ergebnis des Uploads' });
  await expect(summary).toContainText('Erkannt: Kreditkartenabrechnung');
  await expect(summary).toContainText('noch nichts gebucht');
  await expect(summary.getByRole('link', { name: 'Zu Prüfen' })).toBeVisible();
});
