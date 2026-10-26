import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });

for (const profile of ['desktop', 'phone'] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`738 compact contact statement, plain copy and real gift Save/Undo ${profile} ${theme}`, async ({
      browser,
      request,
      isolatedLedger,
    }, info) => {
      const { origin } = isolatedLedger;
      const post = async (path: string, data: unknown) => {
        const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
      };
      const group = (await post('/categories/groups', { name: 'Synthetische Kontaktgruppe' }))
        .group;
      const advance = (
        await post('/categories', {
          name: 'Auslagen',
          groupId: group.id,
          class: null,
          kind: 'advance',
        })
      ).category;
      const gift = (
        await post('/categories', {
          name: 'Synthetisches Geschenk',
          groupId: group.id,
          class: 'want',
        })
      ).category;
      const own = (
        await post('/categories', {
          name: 'Synthetischer Eigenanteil',
          groupId: group.id,
          class: 'need',
        })
      ).category;
      const contact = (await post('/contacts', { name: 'Contact Alpha' })).contact;
      const account = (
        await post('/accounts', {
          name: 'Synthetische Bank',
          type: 'checking',
          openingDate: '2026-08-01',
          openingBalanceCents: 100000,
        })
      ).account;
      const outlay = async (date: string, amountCents: number, memo: string) =>
        (
          await post('/bookings', {
            type: 'booking',
            accountId: account.id,
            date,
            amountCents,
            splits: [{ categoryId: advance.id, contactId: contact.id, amountCents, memo }],
          })
        ).bookings[0];
      await outlay('2026-08-01', -1000, 'Abgeschlossene Auslage');
      await post(`/contacts/${contact.id}/settlements`, {
        accountId: account.id,
        date: '2026-08-02',
        amountCents: 1000,
      });
      const older = await outlay('2026-09-01', -3000, 'Ältere offene Auslage');
      await post(`/contacts/${contact.id}/settlements`, {
        accountId: account.id,
        date: '2026-09-02',
        amountCents: 1000,
      });
      const source = (
        await post('/bookings', {
          type: 'booking',
          accountId: account.id,
          date: '2026-10-01',
          amountCents: -5500,
          memo: 'Synthetische gemeinsame Zahlung',
          splits: [
            {
              categoryId: advance.id,
              contactId: contact.id,
              amountCents: -4000,
              memo: 'Synthetischer Geschenkanteil',
            },
            { categoryId: own.id, amountCents: -1500, memo: 'Unveränderter Eigenanteil' },
          ],
        })
      ).bookings[0];
      const phone = profile === 'phone';
      const context = await browser.newContext({
        baseURL: origin,
        storageState: isolatedLedger.storageState,
        viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        deviceScaleFactor: phone ? 3 : 1,
        isMobile: phone,
        hasTouch: phone,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      try {
        // Exercise the actual manual fallback where clipboard permission/support is unavailable.
        // No financial HTTP request or response is intercepted.
        await context.addInitScript(() =>
          Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }),
        );
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+02:00'));
        const writes: Array<{ method: string; path: string }> = [];
        page.on('request', (r) => {
          const path = new URL(r.url()).pathname;
          if (path.startsWith('/api/') && r.method() !== 'GET')
            writes.push({ method: r.method(), path });
        });
        const url = `/konten/kontakte/${contact.id}?verlauf=1`;
        await page.goto(url);
        await page.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        const region = page.getByRole('region', { name: 'Kontaktkontoauszug' });
        const table = region.getByRole('table', { name: 'Kontaktbuchungen im aktuellen Monat' });
        const open = table.getByRole('button', {
          name: /Ursprungsbuchung öffnen.*Synthetischer Geschenkanteil/,
        });
        await expect(open).toBeVisible();
        await expect(table.getByRole('row')).toHaveCount(2);
        await expect(table).toContainText('+40,00 €');
        await expect(table).toContainText('40,00 €');
        await expect(region.locator('.contacts-balance')).toHaveText('Schuldet dir 60,00 €');
        await expect(
          region.getByRole('table', { name: 'Noch offene Auslagen aus früheren Monaten' }),
        ).toContainText('20,00 €');
        await expect(region.locator('.contacts-closed-history')).not.toHaveAttribute('open');
        await page.evaluate(() => document.fonts.ready);
        const geometry = await region.evaluate((node) => {
          const controls = Array.from(
            node.querySelectorAll<HTMLElement>('button, summary, a, textarea'),
          ).filter((el) => el.checkVisibility() && el.getClientRects().length > 0);
          return {
            viewport: {
              width: innerWidth,
              height: innerHeight,
              dpr: devicePixelRatio,
              coarse: matchMedia('(pointer: coarse)').matches,
            },
            documentWidth: document.documentElement.scrollWidth,
            rows: Array.from(node.querySelectorAll('tbody tr'))
              .filter((el) => el.checkVisibility())
              .map((el) => ({
                text: el.textContent,
                height: el.getBoundingClientRect().height,
              })),
            controls: controls.map((el) => ({
              label: el.getAttribute('aria-label') ?? el.textContent,
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            })),
          };
        });
        expect(geometry.viewport).toEqual({
          width: phone ? 390 : 1440,
          height: phone ? 844 : 900,
          dpr: phone ? 3 : 1,
          coarse: phone,
        });
        expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width);
        if (phone)
          for (const control of geometry.controls) {
            expect(control.width, String(control.label)).toBeGreaterThanOrEqual(44);
            expect(control.height, String(control.label)).toBeGreaterThanOrEqual(44);
          }
        expect(
          (await new AxeBuilder({ page }).include('.contacts-statement').analyze()).violations,
        ).toEqual([]);
        await writeFile(
          info.outputPath(`contact-${profile}-${theme}.json`),
          JSON.stringify(geometry, null, 2),
        );
        await page.screenshot({
          path: info.outputPath(`contact-${profile}-${theme}.png`),
          fullPage: true,
        });
        await region.screenshot({
          path: info.outputPath(`contact-statement-${profile}-${theme}.png`),
        });
        await region
          .getByRole('button', { name: 'Abschnitt kopieren: Zahlungen im Oktober 2026' })
          .click();
        const fallback = region.getByRole('textbox', { name: 'Text zum Kopieren' });
        await expect(fallback).toHaveValue(
          [
            'Contact Alpha',
            'Zahlungen im Oktober 2026',
            '01.10.2026 · Synthetischer Geschenkanteil · Auslage · +40,00 € · offen 40,00 €',
            'Gesamtsaldo bis 20.10.2026: Schuldet dir 60,00 €',
          ].join('\n'),
        );
        await page.keyboard.press('Control+Shift+H');
        await expect(fallback).not.toHaveValue(/40,00|60,00/);
        await expect(fallback).toHaveValue(/••• €/);
        await page.keyboard.press('Control+Shift+H');
        expect(writes).toEqual([]);

        // The source GET precedes opening the existing real editor; Escape is read-only.
        const fresh = page.waitForResponse(
          (r) =>
            r.request().method() === 'GET' &&
            new URL(r.url()).pathname === `/api/bookings/${source.id}`,
        );
        await open.focus();
        await page.keyboard.press('Enter');
        expect((await fresh).ok()).toBe(true);
        const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('55,00');
        await expect(dialog.getByLabel('Betrag 1', { exact: true })).toHaveValue('40,00');
        await expect(dialog.getByLabel('Betrag 2', { exact: true })).toHaveValue('15,00');
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        expect(writes).toEqual([]);
        await expect(page).toHaveURL(new RegExp(`/konten/kontakte/${contact.id}\\?verlauf=1$`));

        // A partially allocated older source remains protected by the existing server guard.
        await region
          .getByRole('button', { name: /Ursprungsbuchung öffnen.*Ältere offene Auslage/ })
          .click();
        await expect(
          dialog.getByRole('combobox', { name: 'Kategorie', exact: true }),
        ).toBeEnabled();
        await dialog
          .getByRole('combobox', { name: 'Kategorie', exact: true })
          .fill('Synthetisches Geschenk');
        await dialog.getByRole('option', { name: /Synthetisches Geschenk/ }).click();
        const refusal = page.waitForResponse(
          (r) =>
            r.request().method() === 'PATCH' &&
            new URL(r.url()).pathname === `/api/bookings/${older.id}`,
        );
        await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
        const refused = await refusal;
        expect(refused.status()).toBe(422);
        expect((await refused.json()).message).toBe(
          'Undo the related contact settlement before changing its receipt or allocated outlay',
        );
        await expect(dialog.getByRole('alert')).toHaveText(
          'Diese Buchung ist bereits einer Rückzahlung zugeordnet. Mache zuerst die zugehörige Rückzahlung rückgängig, bevor du Betrag oder Zuordnung änderst.',
        );
        await expect(dialog.getByRole('combobox', { name: 'Kategorie', exact: true })).toHaveValue(
          'Synthetisches Geschenk',
        );
        expect(
          (await (await request.get(`${origin}/api/bookings/${older.id}`)).json()).booking,
        ).toEqual(older);
        await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
        await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
        await expect(dialog).not.toBeVisible();

        // Change only the unallocated contact line through the actual category picker and Save.
        await open.click();
        const category = dialog.getByRole('combobox', { name: 'Kategorie 1', exact: true });
        await expect(category).toBeEnabled();
        await category.fill('Synthetisches Geschenk');
        await dialog.getByRole('option', { name: /Synthetisches Geschenk/ }).click();
        await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(region.locator('.contacts-balance')).toHaveText('Schuldet dir 20,00 €');
        const changed = (await (await request.get(`${origin}/api/bookings/${source.id}`)).json())
          .booking;
        expect(changed).toEqual({
          ...source,
          splits: [
            {
              ...source.splits[0],
              categoryId: gift.id,
              categoryName: 'Synthetisches Geschenk',
              contactId: null,
            },
            source.splits[1],
          ],
        });
        await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
        await expect(region.locator('.contacts-balance')).toHaveText('Schuldet dir 60,00 €');
        expect(
          (await (await request.get(`${origin}/api/bookings/${source.id}`)).json()).booking,
        ).toEqual(source);
        expect(writes).toEqual([
          { method: 'PATCH', path: `/api/bookings/${older.id}` },
          { method: 'PATCH', path: `/api/bookings/${source.id}` },
          { method: 'POST', path: '/api/undo' },
        ]);
      } finally {
        await context.close();
      }
    });
