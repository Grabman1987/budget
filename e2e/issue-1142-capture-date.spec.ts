import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

for (const mode of ['create', 'edit'] as const) {
  for (const kind of ['Ausgabe', 'Einnahme', 'Umbuchung'] as const) {
    test(`${mode} ${kind}: full date fits without dialog overflow`, async ({
      page,
      isolatedLedger,
    }, info) => {
      const post = async (path: string, data: unknown) => {
        const response = await page.request.post(`/api${path}`, {
          headers: { origin: isolatedLedger.origin },
          data,
        });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
      };
      const { account } = await post('/accounts', {
        name: 'Synthetic account with a deliberately long name',
        type: 'checking',
        openingDate: '2026-09-01',
        openingBalanceCents: 100000,
      });
      const { account: target } = await post('/accounts', {
        name: 'Synthetic target account',
        type: 'savings',
        openingDate: '2026-09-01',
        openingBalanceCents: 0,
      });
      let bookingId: string | undefined;
      if (mode === 'edit') {
        const result = await post(
          '/bookings',
          kind === 'Umbuchung'
            ? {
                type: 'transfer',
                fromAccountId: account.id,
                toAccountId: target.id,
                date: '2026-10-02',
                amountCents: 1000,
              }
            : {
                type: 'booking',
                accountId: account.id,
                date: '2026-10-02',
                amountCents: kind === 'Ausgabe' ? -1000 : 1000,
                status: 'pending',
                payeeName: 'Synthetic counterparty',
                splits: [{ categoryId: null, amountCents: kind === 'Ausgabe' ? -1000 : 1000 }],
              },
        );
        bookingId = kind === 'Umbuchung' ? result.fromBookingId : result.id;
        await page.goto(`/konten/${account.id}`);
        await page
          .locator(`[data-booking="${bookingId}"]`)
          .getByRole('button', { name: /bearbeiten/ })
          .click();
      } else {
        await page.goto(`/?panel=buchung&konto=${account.id}`);
      }
      const dialog = page.getByRole('dialog', {
        name: mode === 'edit' ? 'Buchung bearbeiten' : 'Buchung erfassen',
        exact: true,
      });
      await expect(dialog).toBeVisible();
      if (mode === 'create') await dialog.getByRole('button', { name: kind, exact: true }).click();
      const date = dialog.getByLabel('Datum', { exact: true });
      await expect(date).toHaveValue('02.10.2026');
      const writes: string[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
          writes.push(request.url());
      });
      for (const width of info.project.name === 'desktop'
        ? [768, 900, 901, 1000, 1200, 1440]
        : [390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['light', 'dark']) {
          await page.evaluate((value) => {
            document.documentElement.dataset['theme'] = value;
          }, theme);
          await expect(date).toHaveValue('02.10.2026');
          expect(await date.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
          expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
          // scrollWidth can hide clipped text after a font change; measure the complete value too.
          expect(
            await date.evaluate((el: HTMLInputElement) => {
              const style = getComputedStyle(el);
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d')!;
              context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
              return (
                context.measureText(el.value).width <=
                el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
              );
            }),
          ).toBe(true);
          await page.screenshot({ path: info.outputPath(`${width}-${theme}.png`) });
        }
      }
      expect(writes).toEqual([]);
    });
  }
}
