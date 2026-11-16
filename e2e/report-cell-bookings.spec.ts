import { retainExplorerReaders } from './explorer-controls';
import { createBooking, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-09-17' });

function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES
        ('budget','Synthetic checking','checking','budget',1,'2023-10-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind) VALUES
        ('food','g','Lebensmittel','need','variable'),
        ('fun','g','Freizeit','want','variable');
    `);
    const book = (
      date: string,
      cents: number,
      splits: { amountCents: number; categoryId?: string; incomeTypeId?: string }[],
      memo?: string,
    ) =>
      createBooking(
        opened.db,
        {
          accountId: 'budget',
          date,
          amountCents: cents,
          incomeNextMonth: false,
          splits,
          ...(memo ? { memo } : {}),
        },
        { actor: 'synthetic-fixture' },
      );
    book('2026-07-02', 10001, [{ amountCents: 10001, incomeTypeId: 'income-salary' }]);
    book(
      '2026-08-03',
      -2002,
      [{ amountCents: -2002, categoryId: 'food' }],
      'Synthetic weekly shop',
    );
    book('2026-08-04', 1, [{ amountCents: 1, categoryId: 'food' }]);
    book('2026-08-05', -1502, [
      { amountCents: -1001, categoryId: 'food' },
      { amountCents: -501, categoryId: 'fun' },
    ]);
  } finally {
    opened.close();
  }
}

for (const [name, width, height] of [
  ['desktop 1440', 1440, 900],
  ['phone 390', 390, 844],
] as const) {
  test(`cell bookings sit under the matrix, sum equals the cell, Esc returns focus (${name})`, async ({
    page,
    isolatedLedger,
  }) => {
    seed(isolatedLedger.databasePath);
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('budget-theme', 'light'));
    await retainExplorerReaders(page);
    await page.goto('/reports/explorer?vorlage=category&zeitraum=1J&kategorien=%5B%22food%22%5D');
    const panel = page.getByTestId('template-category');
    await expect(panel).toBeVisible();
    const cell = panel
      .locator('[data-template-row="cat:food"]')
      .getByRole('button', { name: /^Lebensmittel · August 2026 · 30,02 €/ });
    await cell.click();
    const detail = page.getByTestId('template-sources');
    await expect(detail).toBeVisible();
    // Inside the matrix card, above the collapsed "Datenbasis und Darstellung".
    await expect(panel.locator('.tr-card').first().getByTestId('template-sources')).toHaveCount(1);
    const basis = panel.getByRole('heading', { name: 'Datenbasis und Darstellung' });
    const detailBox = (await detail.boundingBox())!;
    expect(detailBox.y).toBeLessThan((await basis.boundingBox())!.y);
    // In view at once, without scrolling by the test.
    const heading = detail.getByRole('heading', { level: 3 });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    const table = detail.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText([
      'Datum',
      'Empfänger',
      'Konto',
      'Notiz',
      'Anteil',
    ]);
    await expect(table).toContainText('Synthetic checking');
    await expect(table).toContainText('Synthetic weekly shop');
    await expect(table).toContainText('Teil von 15,02 €');
    await expect(table.locator('tfoot')).toContainText('30,02 €');
    await expect(detail).toContainText('Gewählte Zelle: 30,02 €');
    await expect(detail.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(cell).toBeFocused();
  });
}
