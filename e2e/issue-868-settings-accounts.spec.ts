import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('E2a keeps account edits, rejects stale metadata and confirms dirty cancellation', async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Synthetic editable account',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 10000,
    },
  });
  expect(response.ok()).toBe(true);
  const { account } = (await response.json()) as { account: { id: string } };
  await page.goto('/einstellungen/konten');
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  await page.getByRole('button', { name: 'Synthetic editable account bearbeiten' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Synthetic unsaved draft');
  if (on) {
    page.once('dialog', (confirmation) => confirmation.dismiss());
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Synthetic unsaved draft');
    const changed = await request.patch(`/api/accounts/${account.id}`, {
      headers: { origin: baseURL! },
      data: { name: 'Synthetic concurrent account' },
    });
    expect(changed.ok()).toBe(true);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      dialog.getByText(/Das Konto wurde inzwischen geändert. Dein Entwurf bleibt erhalten/),
    ).toBeVisible();
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Synthetic unsaved draft');
    page.once('dialog', (confirmation) => confirmation.accept());
  }
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).toBeHidden();
  const list = (await (await request.get('/api/accounts')).json()) as {
    accounts: { id: string; name: string; balanceCents: number }[];
  };
  expect(list.accounts.find((entry) => entry.id === account.id)).toMatchObject({
    name: on ? 'Synthetic concurrent account' : 'Synthetic editable account',
    balanceCents: 10000,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page
    .getByRole('button', {
      name: `${on ? 'Synthetic concurrent account' : 'Synthetic editable account'} bearbeiten`,
    })
    .click();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await page.screenshot({ path: test.info().outputPath(`account-320-${theme}.png`) });
  }
});
