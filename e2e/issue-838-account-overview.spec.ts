import { overviewActions, redesignLoaded, MIN_TARGET_PX, toast } from './ledger-helpers';

import AxeBuilder from '@axe-core/playwright';
import { openDatabase, reconcileAccount, schema } from '@budget/db';
import { expect, type Locator } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-21' });

function seed(databasePath: string) {
  const opened = openDatabase(databasePath);
  try {
    const rows = [
      {
        id: 'k1-alpha',
        name: 'Synthetic Alpha',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: 12345,
      },
      {
        id: 'k1-bravo',
        name: 'Synthetic Bravo',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: -345,
      },
      {
        id: 'k1-card',
        name: 'Synthetic Card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: -2000,
      },
      {
        id: 'k1-unknown',
        name: 'Synthetic Unknown',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingBalanceCents: 123,
      },
      {
        id: 'k1-closed-plus',
        name: 'Synthetic Closed Plus',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: 90000,
        closedAt: '2026-10-21',
      },
      {
        id: 'k1-closed-minus',
        name: 'Synthetic Closed Minus',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: -4000,
        closedAt: '2026-10-21',
      },
    ] satisfies Array<Omit<typeof schema.account.$inferInsert, 'openingDate'>>;
    for (const [sortOrder, row] of rows.entries()) {
      opened.db
        .insert(schema.account)
        .values({ ...row, sortOrder, openingDate: '2026-09-01' })
        .run();
    }
    for (const row of rows.slice(0, 3)) {
      reconcileAccount(
        opened.db,
        {
          accountId: row.id,
          date: '2026-10-21',
          statementBalanceCents: row.openingBalanceCents,
          today: '2026-10-21',
        },
        { actor: 'test' },
      );
    }
  } finally {
    opened.close();
  }
}

async function target(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
}

for (const width of [1440, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`K1 ${width} ${theme}: actual flag, empty entry, source Back, order Undo and cancel`, async ({
      page,
      isolatedLedger,
    }, info) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/konten');
      await expect(page.locator('.account-overview-577')).toBeVisible();
      const redesign = (await page.locator('[data-budget-redesign="1"]').count()) > 0;
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const scope = page.locator('.account-overview-577');
      await expect(page.locator('[data-redesign="account-overview"]')).toHaveCount(
        redesign ? 1 : 0,
      );
      await expect(scope.getByText('Keine offenen Konten.', { exact: false })).toBeVisible();
      const bookings = scope.getByRole('link', { name: 'Alle Buchungen', exact: true });
      if (redesign) await overviewActions(page);
      await expect(bookings).toHaveCount(redesign ? 1 : 0);
      if (redesign) {
        await overviewActions(page);
        await target(bookings);
        await bookings.focus();
        await expect(bookings).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/konten\/buchungen$/);
        await page.goBack();
        await expect(scope).toBeVisible();
      }
      seed(isolatedLedger.databasePath);
      await page.reload();
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await expect(page.getByTestId('budget-accounts-balance')).toHaveText('120,00 €');
      await expect(
        scope.getByRole('link', {
          name: (await redesignLoaded(page)) ? '3 von 4 geprüft' : '3 von 4 Konten geprüft',
        }),
      ).toBeVisible();
      await expect(scope.locator('[data-testid="account-group-value"]')).toHaveText([
        '120,00 €',
        '−20,00 €',
        '–',
      ]);
      const writes: string[] = [];
      page.on('request', (request) => {
        if (
          new URL(request.url()).pathname.startsWith('/api/') &&
          !['GET', 'HEAD'].includes(request.method())
        )
          writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      await scope.getByRole('button', { name: 'Details zu Synthetic Unknown' }).click();
      const unknownDetails = scope.locator('.overview-detail').filter({ hasText: 'Wechselkurs' });
      await expect(unknownDetails).toBeVisible();
      const source = unknownDetails.getByRole('button', {
        name: 'Bewertungsgrundlage · Synthetic Unknown',
        exact: true,
      });
      if (redesign) await target(source);
      await source.click();
      await expect(
        page.getByRole('tooltip').filter({ hasText: 'Bewertungsgrundlage · Synthetic Unknown' }),
      ).toContainText('EUR-Umrechnung fehlt · USD');
      await page.keyboard.press('Escape');
      await scope
        .getByRole('link', {
          name: (await redesignLoaded(page)) ? '3 von 4 geprüft' : '3 von 4 Konten geprüft',
        })
        .click();
      await expect(page).toHaveURL(/\/konten\/pruefen$/);
      await page.goBack();
      await expect(page.getByTestId('budget-accounts-balance')).toHaveText('120,00 €');
      await overviewActions(page);
      await scope.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Konto anlegen' })
        .getByRole('button', { name: 'Abbrechen', exact: true })
        .click();
      expect(writes).toEqual([]);
      const order = () =>
        scope
          .locator('[data-account-id="k1-alpha"] .kname, [data-account-id="k1-bravo"] .kname')
          .allTextContents();
      await overviewActions(page);
      await scope.getByRole('button', { name: 'Reihenfolge ändern', exact: true }).click();
      const down = scope.getByRole('button', { name: 'Synthetic Alpha nach unten' });
      if (redesign) await target(down);
      await down.click();
      await expect(toast(page)).toContainText('Reihenfolge der Konten gespeichert.');
      await expect.poll(order).toEqual(['Synthetic Bravo', 'Synthetic Alpha']);
      await expect(scope.getByRole('button', { name: 'Synthetic Alpha nach oben' })).toBeFocused();
      await toast(page).getByRole('button', { name: 'Rückgängig', exact: true }).click();
      await expect.poll(order).toEqual(['Synthetic Alpha', 'Synthetic Bravo']);
      await scope.getByRole('button', { name: 'Fertig', exact: true }).click();
      await page.reload();
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await expect.poll(order).toEqual(['Synthetic Alpha', 'Synthetic Bravo']);
      await expect(page.getByTestId('budget-accounts-balance')).toHaveText('120,00 €');
      expect(writes).toEqual(['PATCH /api/accounts/order', 'POST /api/undo']);
      if (redesign) {
        await overviewActions(page);
        await expect(bookings).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(() => document.fonts.ready);
        if (width === 1440) {
          const last = await scope.locator('[data-account-id]').last().boundingBox();
          expect(last).not.toBeNull();
          expect(last!.y + last!.height).toBeLessThanOrEqual(900);
        }
        const axe = await new AxeBuilder({ page })
          .include('.account-overview-577')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(axe.violations).toEqual([]);
        await page.getByTestId('budget-accounts-balance').scrollIntoViewIfNeeded();
        const screenshot = info.outputPath(`k1-${width}-${theme}.png`);
        await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
        await info.attach(`K1 ${width} ${theme} ${info.project.name}`, {
          path: screenshot,
          contentType: 'image/png',
        });
      }
    });
  }
}
