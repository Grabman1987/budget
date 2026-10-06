import { expect } from '@playwright/test';
import { openDatabase, storeCpi } from '@budget/db';
import { monthsBetween } from '@budget/domain';
import { test } from './isolated-ledger';
import { inspectReport } from './spending-helpers';

for (const mapped of [true, false]) {
  test(
    mapped
      ? 'explores two categories against their own sub-indices'
      : 'shows total CPI fallback for an unmapped category',
    async ({ page, request, baseURL, isolatedLedger }, info) => {
      test.setTimeout(120_000);
      const headers = { origin: baseURL! };
      const post = async (path: string, data: unknown) => {
        const response = await request.post('/api' + path, { headers, data });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
      };
      const { account } = await post('/accounts', {
        name: 'Giro Beispiel',
        type: 'checking',
        openingDate: '2023-10-01',
      });
      const { group } = await post('/categories/groups', { name: 'Alltag Beispiel' });
      const categories: Array<{ id: string; name: string }> = [];
      for (const name of mapped
        ? ['Lebensmittel Beispiel', 'Treibstoff Beispiel']
        : ['Sonstiges Beispiel']) {
        const { category } = await post('/categories', {
          name,
          groupId: group.id,
          class: 'need',
          kind: 'variable',
        });
        categories.push(category);
        for (const month of monthsBetween('2023-10', '2026-09')) {
          const cents = month < '2025-01' ? 1000 : 1100;
          await post('/bookings', {
            type: 'booking',
            accountId: account.id,
            date: `${month}-03`,
            amountCents: -cents,
            splits: [{ categoryId: category.id, amountCents: -cents }],
          });
        }
      }
      const opened = openDatabase(isolatedLedger.databasePath);
      for (const [series, change] of [
        ['vpi', 2],
        ['vpi:01.1', 5],
        ['vpi:07.2.2', 3],
      ] as const)
        storeCpi(
          opened.db,
          series,
          monthsBetween('2023-10', '2026-09').map((month) => ({
            month,
            indexMicro: (month < '2025-01' ? 100 : 100 + change) * 1_000_000,
          })),
          '2026-10-01',
          'fixture',
        );
      opened.close();
      const response = await request.put('/api/inflation-basket', {
        headers,
        data: {
          changes: categories.map((c, i) => ({
            categoryId: c.id,
            inclusion: 'always',
            ...(mapped
              ? { method: 'cpi', coicop: [{ code: i === 0 ? '01.1' : '07.2.2', shareBp: 10000 }] }
              : {}),
          })),
        },
      });
      expect(response.ok(), await response.text()).toBe(true);
      await page.goto('/reports/inflation');
      if (!mapped)
        await expect(page.getByText('Warenkorb nicht berechenbar', { exact: true })).toHaveText(
          'Warenkorb nicht berechenbar',
        );
      const views = page.getByRole('group', { name: 'Inflationsansicht' });
      await expect(views).toBeVisible({ timeout: 30_000 });
      await views.getByRole('button', { name: 'Kategorie-Explorer', exact: true }).click();
      const explorer = page.getByTestId('inflation-explorer');
      for (const [i, c] of categories.entries()) {
        await expect(explorer.getByRole('checkbox', { name: c.name, exact: true })).toBeChecked();
        const section = page.getByTestId('explorer-category-' + c.id);
        await expect(
          section.getByRole('group', { name: new RegExp(c.name) }).first(),
        ).toBeVisible();
        await expect(section.getByRole('cell').nth(0)).toHaveText('110,00');
        await expect(section.getByRole('cell').nth(1)).toHaveText(
          mapped ? (i === 0 ? '105,00' : '103,00') : '102,00',
        );
        await expect(section.getByRole('cell').nth(2)).toHaveText(
          mapped ? (i === 0 ? '+5,00 Pp' : '+7,00 Pp') : '+8,00 Pp',
        );
        await expect(section).toContainText(
          mapped
            ? i === 0
              ? 'Nahrungsmittel'
              : 'Kraft- und Schmierstoffe'
            : 'Gesamt-VPI (kein Teilindex)',
        );
      }
      await expect(page.getByTestId('explorer-interpretation')).toHaveText(
        'Mehr Fahrten erhöhen die Treibstoffkosten, nicht den Preis – Mengeneffekte selbst einordnen.',
      );
      await inspectReport(
        page,
        info,
        mapped ? 'explorer-two-categories' : 'explorer-total-fallback',
      );
      const first = explorer.getByRole('checkbox', { name: categories[0]!.name, exact: true });
      await first.focus();
      await first.press('Space');
      await expect(page.getByTestId('explorer-category-' + categories[0]!.id)).toHaveCount(0);
      if (mapped)
        await expect(page.getByTestId('explorer-category-' + categories[1]!.id)).toBeVisible();
      else
        await expect(explorer.getByRole('status')).toHaveText(
          'Bitte mindestens eine Kategorie auswählen.',
        );

      // Mapping is editable even while the own basket method remains automatic.
      if (!mapped) {
        await page.goto('/einstellungen/warenkorb');
        const row = page.getByTestId('basket-category-' + categories[0]!.id);
        await row.getByRole('combobox', { name: 'COICOP-Klasse 1' }).fill('Nahrung');
        await row.getByRole('option', { name: '01.1 Nahrungsmittel', exact: true }).click();
        await row.getByRole('button', { name: 'Zuordnung speichern' }).click();
        await expect(row.getByText('Zuordnung gespeichert', { exact: true })).toBeVisible();
        await page.reload();
        await expect(row.getByLabel('Methode:')).toHaveValue('automatic');
        await expect(row.getByRole('combobox', { name: 'COICOP-Klasse 1' })).toHaveValue(
          '01.1 Nahrungsmittel',
        );
        await page.getByRole('link', { name: 'Zur persönlichen Inflation' }).click();
        await page.getByRole('button', { name: 'Kategorie-Explorer', exact: true }).click();
        await expect(
          page
            .getByTestId('explorer-category-' + categories[0]!.id)
            .getByRole('cell')
            .nth(2),
        ).toHaveText('+5,00 Pp');
      }
    },
  );
}
