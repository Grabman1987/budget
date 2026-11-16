import { expect, test } from '@playwright/test';
import { contactShareControl } from './ledger-helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`contact shares remember only the chosen mode on this device in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    await page.goto('/?panel=buchung');
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    const mode = dialog.getByRole('group', { name: 'Anteilart 1.1', exact: true });
    await (await contactShareControl(dialog)).click();
    await expect(mode.getByRole('button', { name: 'Betrag', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByLabel('Anteil 1.1 (€)')).toHaveValue('');
    await mode.getByRole('button', { name: '%', exact: true }).click();
    await dialog.getByLabel('Anteil 1.1 (%)').fill('33,33');
    await page.reload();
    await (await contactShareControl(dialog)).click();
    await expect(mode.getByRole('button', { name: '%', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByLabel('Anteil 1.1 (%)')).toHaveValue('50');
    await mode.getByRole('button', { name: 'Betrag', exact: true }).click();
    await page.reload();
    await (await contactShareControl(dialog)).click();
    await expect(mode.getByRole('button', { name: 'Betrag', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByLabel('Anteil 1.1 (€)')).toHaveValue('');
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`footer buttons keep their position while contact shares expand in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    await page.goto('/?panel=buchung');
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    const footerY = async () =>
      Promise.all(
        ['Abbrechen', 'Speichern und neu', 'Speichern'].map(async (name) => {
          const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
          return Math.round(box!.y);
        }),
      );
    const before = await footerY();
    await (await contactShareControl(dialog)).click();
    await dialog.getByRole('button', { name: '+ Weiterer Kontakt' }).click();
    const after = await footerY();
    expect(after).toEqual(before);
  });
}
