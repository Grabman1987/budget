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
    // The phone sheet has no cancel button (it closes via its header); desktop has all three.
    const phone = (page.viewportSize()?.width ?? 1280) < 768;
    const names = phone
      ? ['Speichern und neu', 'Speichern']
      : ['Verwerfen', 'Speichern und neu', 'Speichern'];
    const readFooter = async () =>
      Promise.all(
        names.map(async (name) => {
          const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
          return Math.round(box!.y);
        }),
      );
    // The dialog slides in; wait until the footer stopped moving before measuring.
    const footerY = async () => {
      // The autofocused amount reserves room for the phone keyboard bar (only while focused); that
      // is keyboard state, not share expansion, so measure with the focus released.
      const release = () =>
        page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeVisible();
      await release();
      let last = await readFooter();
      await expect
        .poll(async () => {
          await release();
          const current = await readFooter();
          const settled = JSON.stringify(current) === JSON.stringify(last);
          last = current;
          return settled;
        })
        .toBe(true);
      return last;
    };
    const before = await footerY();
    await (await contactShareControl(dialog)).click();
    await dialog.getByRole('button', { name: '+ Weiterer Kontakt' }).click();
    const after = await footerY();
    // Sub-pixel layout may round a 0.5 px difference either way; anything more is a real shift.
    after.forEach((y, index) => expect(Math.abs(y - before[index]!)).toBeLessThanOrEqual(1));
  });
}
