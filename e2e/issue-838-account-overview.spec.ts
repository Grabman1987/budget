import { overviewActions, redesignLoaded, MIN_TARGET_PX, toast } from './ledger-helpers';

import AxeBuilder from '@axe-core/playwright';
import { openDatabase, reconcileAccount, schema } from '@budget/db';
import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-21' });
// CI's artifact defaults to OFF; ON invocations pin A2_EXPECT_REDESIGN=1 independently.
async function expectedMode(page: Page) {
  const expected = process.env['A2_EXPECT_REDESIGN'] ?? process.env['VITE_BUDGET_REDESIGN'] ?? '0';
  expect(['0', '1'], 'A2_EXPECT_REDESIGN must pin an OFF or ON artifact').toContain(expected);
  await expect(page.locator('.app')).toHaveCount(1);
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  expect(on, 'rendered build matches the independently expected redesign mode').toBe(
    expected === '1',
  );
  return on;
}

async function firstScreen(page: Page, scope: Locator) {
  await page.evaluate(() => document.fonts.ready);
  await scope.evaluate((node) => {
    for (
      let ancestor: HTMLElement | null = node as HTMLElement;
      ancestor;
      ancestor = ancestor.parentElement
    )
      ancestor.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await scope.evaluate((node) => {
      for (
        let ancestor: HTMLElement | null = node as HTMLElement;
        ancestor;
        ancestor = ancestor.parentElement
      )
        if (ancestor.scrollTop !== 0) return false;
      return true;
    }),
  ).toBe(true);
  const last = await scope.locator('[data-account-id]').last().boundingBox();
  expect(last).not.toBeNull();
  return last!;
}

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
      const redesign = await expectedMode(page);
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
      await expectedMode(page);
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
      await expectedMode(page);
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
        if (width === 1440) {
          const last = await firstScreen(page, scope);
          expect(last.y).toBeGreaterThanOrEqual(0);
          expect(last.y + last.height).toBeLessThanOrEqual(page.viewportSize()!.height);
          await expect(scope.locator('[data-account-id]').last()).toBeInViewport({ ratio: 1 });
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
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

test('K1: first-screen proof resets restored scroll and rejects an off-screen last row', async ({
  page,
  isolatedLedger,
}) => {
  seed(isolatedLedger.databasePath);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/konten');
  await expectedMode(page);
  const scope = page.locator('.account-overview-577');
  await expect(scope.locator('[data-account-id]')).toHaveCount(4);
  // Negative fixture: an oversized header puts the last row below the first screen. Scrolling
  // makes a viewport-relative bottom look acceptable; it must never satisfy the real proof.
  await scope.locator('.overview-table').evaluate((table) => {
    (table as HTMLElement).style.marginTop = '100vh';
    document.body.style.minHeight = '300vh';
  });
  const row = scope.locator('[data-account-id]').last();
  await row.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolled = (await row.boundingBox())!;
  expect(scrolled.y + scrolled.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const secured = await firstScreen(page, scope);
  expect(secured.y + secured.height).toBeGreaterThan(page.viewportSize()!.height);
  await expect(row).not.toBeInViewport();
});

test('K1: collapsed mixed review states retain every problem, total and ordering capability', async ({
  page,
  isolatedLedger,
}) => {
  seed(isolatedLedger.databasePath);
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    for (const id of ['k1-missing', 'k1-unreviewed'])
      opened.db
        .insert(schema.account)
        .values({
          id,
          name: id,
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-09-01',
          openingBalanceCents: 0,
        })
        .run();
  } finally {
    opened.close();
  }
  await page.route('**/api/accounts', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    for (const row of body.accounts) {
      if (row.id === 'k1-alpha') row.reviewStatus = { ...row.reviewStatus, state: 'due' };
      if (row.id === 'k1-bravo')
        row.reviewStatus = {
          ...row.reviewStatus,
          state: 'unsupported',
          supported: false,
          policy: 'unsupported',
        };
      if (row.id === 'k1-missing') delete row.reviewStatus;
      if (row.id === 'k1-unreviewed')
        row.reviewStatus = { ...row.reviewStatus, state: 'unreviewed', checkedOn: null };
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto('/konten');
  const redesigned = await expectedMode(page);
  const scope = page.locator('.account-overview-577');
  await expect(page.getByTestId('budget-accounts-balance')).toHaveText('120,00 €');
  await expect(scope.locator('[data-account-id="k1-alpha"]')).toBeVisible();
  const group = scope.locator('.overview-group').filter({ hasText: 'Budget-Konten' });
  if (redesigned) {
    const toggle = group.getByRole('button', { name: /^Budget-Konten/ });
    const summary =
      '1 fällig · 1 offen · 1 Prüfung nicht unterstützt · 1 Prüfstatus nicht verfügbar';
    await expect(toggle).toContainText(summary);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(scope.locator('[data-account-id="k1-alpha"]')).toHaveCount(0);
    await expect(scope.locator('[data-account-id="k1-missing"]')).toHaveCount(0);
    await expect(toggle).toContainText(summary);
    await expect(group.getByTestId('account-group-value')).toHaveText('120,00 €');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(toggle).toContainText(summary);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const text = (await toggle.locator('.overview-group-review').boundingBox())!;
      const header = (await group.boundingBox())!;
      expect(text.y + text.height).toBeLessThanOrEqual(header.y + header.height);
    }
    await overviewActions(page);
    await scope.getByRole('button', { name: 'Reihenfolge ändern', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toBeDisabled();
    await expect(scope.getByRole('button', { name: 'Synthetic Alpha nach unten' })).toBeVisible();
  } else {
    await expect(group.getByRole('button', { name: /^Budget-Konten/ })).toHaveCount(0);
    await expect(scope.locator('[data-account-id="k1-missing"]')).toBeVisible();
    await expect(group.getByTestId('account-group-value')).toHaveText('120,00 €');
  }
});
