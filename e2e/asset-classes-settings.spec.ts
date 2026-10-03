/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers of the API are read, not typed */
import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

/**
 * Einstellungen › Anlageklassen: classes (create, rename, order), securities per class and the
 * target sets by investment sum with the active tier, shown in Portfolio and the allocation report.
 */

async function send(
  request: APIRequestContext,
  origin: string,
  method: 'post' | 'put',
  path: string,
  data: unknown,
) {
  const response = await request[method](`${origin}/api${path}`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as Record<string, any>;
}

test('asset classes, securities and target sets by investment sum', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  test.setTimeout(180_000);
  const origin = isolatedLedger.origin;
  // A depot worth about 15.000 € (cash 14.499 € plus 2,5 units at 200 €).
  const depot = (
    await send(request, origin, 'post', '/accounts', {
      name: 'Depot Muster',
      type: 'brokerage',
      openingDate: '2026-09-01',
      openingBalanceCents: 1_500_000,
    })
  ).account;
  await send(request, origin, 'post', '/asset-classes', { name: 'Aktien Muster', sortOrder: 1 });
  await send(request, origin, 'post', '/asset-classes', { name: 'Anleihen Muster', sortOrder: 2 });
  const classes = (await (await request.get(`${origin}/api/asset-classes`)).json()).assetClasses;
  const security = (
    await send(request, origin, 'post', '/securities', {
      name: 'ETF Muster',
      kind: 'etf',
      assetClassId: classes[0].id,
    })
  ).security;
  await send(request, origin, 'put', `/securities/${security.id}/prices/2026-10-01`, {
    price: '200',
  });
  await send(request, origin, 'post', '/trades', {
    securityId: security.id,
    accountId: depot.id,
    date: '2026-10-01',
    kind: 'buy',
    units: '2.5',
    amountCents: 50_000,
    feeCents: 100,
  });

  await page.goto('/einstellungen/anlageklassen');
  await expect(page.getByRole('heading', { name: 'Anlageklassen', exact: true })).toBeVisible();
  if (isMobile) await expect(page.locator('.settings-here')).toHaveText('Anlageklassen');
  else
    await expect(
      page.getByRole('link', { name: 'Anlageklassen', exact: true }).first(),
    ).toBeVisible();
  await expect(page.getByLabel('Name der Anlageklasse Aktien Muster')).toBeVisible();

  // Create, rename and reorder.
  await page.getByLabel('Neue Anlageklasse').fill('Rohstoffe Muster');
  await page.getByRole('button', { name: 'Anlageklasse anlegen' }).click();
  await expect(toast(page)).toContainText('Anlageklasse „Rohstoffe Muster“ angelegt.');
  const rename = page.getByLabel('Name der Anlageklasse Rohstoffe Muster');
  await rename.fill('Gold Muster');
  await rename.locator('xpath=ancestor::form').getByRole('button', { name: 'Umbenennen' }).click();
  await expect(toast(page)).toContainText('Anlageklasse in „Gold Muster“ umbenannt.');
  await page.getByRole('button', { name: 'Gold Muster nach oben' }).click();
  await expect(toast(page)).toContainText('Reihenfolge der Anlageklassen gespeichert.');
  await expect
    .poll(() =>
      page
        .locator('input[aria-label^="Name der Anlageklasse"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    )
    .toEqual(['Aktien Muster', 'Gold Muster', 'Anleihen Muster']);
  // The empty class can be put back: undo of the order, then the order is the old one.
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect
    .poll(() =>
      page
        .locator('input[aria-label^="Name der Anlageklasse"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)),
    )
    .toEqual(['Aktien Muster', 'Anleihen Muster', 'Gold Muster']);

  // Assign the security to another class and back.
  const assign = page.getByLabel('Anlageklasse von ETF Muster');
  await expect(assign).toHaveValue(classes[0].id);
  await assign.selectOption({ label: 'Anleihen Muster' });
  await expect(toast(page)).toContainText(
    'ETF Muster der Anlageklasse „Anleihen Muster“ zugeordnet.',
  );
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(assign).toHaveValue(classes[0].id);

  // Target sets: up to 10.000 €, up to 20.000 €, above.
  await expect(page.getByText('Noch kein Zielset.')).toBeVisible();
  const sets: Array<[string, string, string]> = [
    ['10000', '70', '30'],
    ['20000', '60', '40'],
    ['', '50', '50'],
  ];
  for (const [i, [upTo, aktien, anleihen]] of sets.entries()) {
    await page.getByRole('button', { name: 'Zielset hinzufügen' }).click();
    const n = i + 1;
    await page.getByLabel(`Gilt bis Anlagesumme (€), Zielset ${n}`).fill(upTo);
    await page.getByLabel(`Aktien Muster · Soll (%), Zielset ${n}`).fill(aktien);
    await page.getByLabel(`Anleihen Muster · Soll (%), Zielset ${n}`).fill(anleihen);
  }
  // A set that does not add up is refused with the set's number.
  await page.getByLabel('Anleihen Muster · Soll (%), Zielset 3').fill('40');
  await page.getByRole('button', { name: 'Zielsets speichern' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Zielset 3' })).toContainText(
    'genau 100,00 %',
  );
  await page.getByLabel('Anleihen Muster · Soll (%), Zielset 3').fill('50');
  await page.getByRole('button', { name: 'Zielsets speichern' }).click();
  await expect(toast(page)).toContainText('Zielsets gespeichert.');
  await expect(page.getByTestId('target-set')).toContainText('Aktives Zielset: bis 20.000 €');
  await expect(page.getByTestId('target-set')).toContainText('Stufe 2 von 3');
  await expect(page.getByText('aktiv', { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole('group', { name: 'Zielset 2' }).getByText('aktiv', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Aktien Muster · Soll (%), Zielset 2')).toHaveValue('60,00');

  // Portfolio shows the active set and its Soll.
  await page.goto('/vermoegen/portfolio');
  await expect(page.getByTestId('target-set')).toContainText('Aktives Zielset: bis 20.000 €');
  await expect(page.getByText('Soll 60,0 %')).toBeVisible();
  await expect(page.getByText('Soll 40,0 %')).toBeVisible();

  // The allocation report shows the same active set.
  await page.goto('/reports/pallocation');
  await expect(page.getByTestId('target-set')).toContainText('Aktives Zielset: bis 20.000 €');
  await expect(page.getByTestId('soll-table')).toContainText(/60,0/);

  // Undo removes the sets again (one audit group).
  await page.goto('/einstellungen/anlageklassen');
  await page.getByRole('button', { name: 'Zielset entfernen' }).first().click();
  await page.getByRole('button', { name: 'Zielsets speichern' }).click();
  await expect(toast(page)).toContainText('Zielsets gespeichert.');
  await expect(page.getByRole('group', { name: 'Zielset 3' })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByRole('group', { name: 'Zielset 3' })).toBeVisible();

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await expect(
      page.getByRole('heading', { name: 'Zielgewichte nach Anlagesumme' }),
    ).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const path = test.info().outputPath(`asset-classes-settings-${scheme}.png`);
    await page.screenshot({ path, fullPage: true });
    await test
      .info()
      .attach(`asset classes settings ${scheme}`, { path, contentType: 'image/png' });
  }
});
