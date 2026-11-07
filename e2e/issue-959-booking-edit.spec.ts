import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX } from './ledger-helpers';

test('reconciled split editing keeps fields and cents readable and closes without writes', async ({
  page,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Synthetic edit account',
    type: 'checking',
    openingDate: '2026-09-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Synthetic group' });
  const { category } = await post('/categories', {
    name: 'Synthetic long household category',
    groupId: group.id,
    class: 'need',
  });
  const { id } = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -12345,
    status: 'confirmed',
    payeeName: 'Synthetic long counterparty',
    splits: [
      { categoryId: category.id, amountCents: -10001 },
      { categoryId: category.id, amountCents: -2344 },
    ],
  });
  await post(`/accounts/${account.id}/reconciliation`, {
    date: '2026-10-02',
    statementBalanceCents: 87655,
  });
  const before = await (await page.request.get(`/api/bookings/${id}`)).json();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/konten/${account.id}`);
  await page
    .locator(`[data-booking="${id}"]`)
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
  await expect(dialog).toBeVisible();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
      writes.push(request.url());
  });
  for (const width of info.project.name === 'desktop' ? [1000, 1440, 1900] : [390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await page.screenshot({ path: info.outputPath(`edit-${width}-${theme}.png`) });
      const fields = [
        dialog.getByLabel('Empfänger', { exact: true }),
        dialog.getByLabel('Datum', { exact: true }),
        dialog.getByLabel('Konto', { exact: true }),
      ];
      const boxes = [];
      for (const field of fields) {
        await expect(field).toBeVisible();
        boxes.push((await field.boundingBox())!);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!,
            b = boxes[j]!;
          expect(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
            JSON.stringify({ a, b }),
          ).toBe(true);
        }
      for (const input of await dialog.locator('.bk-lines input:not([type="checkbox"])').all()) {
        if (
          width === 390 &&
          (await input.locator('..').getAttribute('class'))?.includes('is-capture-overlay')
        ) {
          // Long category names are one-line ellipses in the inset rows (#980).
          await expect(input).toHaveCSS('text-overflow', 'ellipsis');
          await expect(input).toHaveValue('Synthetic long household category');
          expect(await input.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(
            true,
          );
        } else {
          // In particular, every split amount still displays all of its cents.
          expect(await input.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        }
      }
      const close = dialog.getByRole('button', { name: 'Schließen', exact: true });
      expect((await close.innerText()).trim()).toBe('');
      const closeBox = (await close.boundingBox())!;
      expect(closeBox.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(closeBox.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      await page.screenshot({ path: info.outputPath(`edit-${width}-${theme}.png`) });
    }
  }
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(writes).toEqual([]);
  expect(await (await page.request.get(`/api/bookings/${id}`)).json()).toEqual(before);
});
