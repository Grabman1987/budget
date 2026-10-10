import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';
import { inspectReport } from './spending-helpers';

test('everyday terms keep function routes, data kinds and global actions distinct', async ({
  page,
}, info) => {
  test.setTimeout(Math.max(120_000, info.timeout));
  const mobile = info.project.name === 'mobile';
  await page.goto('/reports');
  await expect(page.getByRole('link', { name: 'Prognosegenauigkeit', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Budgettreue', exact: true })).toBeVisible();
  const open = async () => {
    if (mobile) await page.getByRole('button', { name: 'Suchen', exact: true }).click();
    else await page.keyboard.press('Control+k');
    const input = page.getByRole('combobox', { name: 'Suchen', exact: true });
    await expect(input).toBeFocused();
    return input;
  };
  for (const [term, label, path] of [
    ['Baby', '3.1 Liquiditätsprognose', '/reports/liquiditaet'],
    ['Einkommenspause', '3.1 Liquiditätsprognose', '/reports/liquiditaet'],
    ['Dispo', 'Vermögen · Schulden', '/vermoegen/schulden'],
    ['Gebühren', '2.6 Bank- und Zinskosten', '/reports/kosten'],
    ['Prognosegenauigkeit', '1.11 Prognosegenauigkeit', '/reports/planungstreue'],
    ['Budgettreue', '2.2 Budgettreue', '/reports/budgettreue'],
  ]) {
    const input = await open();
    await input.fill(term!);
    const option = page
      .getByRole('group', { name: 'Passende Treffer' })
      .getByRole('option', { name: new RegExp(label!) });
    await expect(option).toBeVisible();
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await option.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (term === 'Prognosegenauigkeit' || term === 'Budgettreue') {
      await expect(page.getByRole('heading', { name: term, exact: true })).toBeVisible();
    }
  }
  const input = await open();
  await input.fill('Supermarkt');
  await expect(
    page
      .getByRole('option')
      .filter({ has: page.locator('.global-search-kind', { hasText: /^Buchung$/ }) })
      .first(),
  ).toBeVisible();
  await input.fill('');
  const actions = page.getByRole('group', { name: 'Globale Aktionen' });
  await expect(actions.getByRole('option', { name: /Monatsabschluss starten/ })).toHaveCount(1);
  await expect(
    page
      .getByRole('group', { name: 'Passende Treffer' })
      .getByRole('option', { name: /Monatsabschluss/ }),
  ).toHaveCount(0);
  await input.fill('Posteingang');
  await expect(actions.getByRole('option', { name: /Posteingang öffnen/ })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`search-groups-${theme}.png`),
      animations: 'disabled',
    });
  }
  await input.fill('Monatsabschluss');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/monatsabschluss\/\d{4}-\d{2}/);
});

test('inflation labels expose method, coverage and each comparison window with reconciled contributions', async ({
  page,
}, info) => {
  test.setTimeout(Math.max(120_000, info.timeout));
  await page.goto('/reports/inflation');
  await expect(page.getByTestId('pi-rate')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('pi-method')).toBeVisible();
  await expect(page.getByTestId('pi-reference-state')).toContainText('(Aug 26)');
  await expect(page.getByText(/Synthetische Beispielreihe statt VPI/)).toBeVisible();
  await expect(page.getByTestId('pi-coverage')).toContainText('des Konsums im Basisjahr');
  const contributions = page
    .getByRole('heading', { name: 'Beitrag je Kategorie' })
    .locator('..')
    .locator('..');
  await expect(contributions).toContainText('Aug 25 bis Aug 26');
  const parse = (value: string) =>
    Math.round(
      Number(
        value
          .replace('−', '-')
          .replace(',', '.')
          .replace(/[^\d.+-]/g, ''),
      ) * 100,
    );
  const displayed = await page
    .getByTestId('contributions-table')
    .locator('tbody tr td:last-child')
    .allTextContents();
  const total = await contributions.locator('.sr-state').innerText();
  expect(displayed.reduce((sum, value) => sum + parse(value), 0)).toBe(parse(total));
  const basket = page.getByTestId('inflation-basket');
  await expect(basket).toContainText('Messung / Quelle');
  await expect(basket).toContainText('Preis ·');
  await expect(
    basket.locator('tbody tr').first().locator('td').nth(3).locator('small'),
  ).toBeVisible();
  await inspectReport(page, info, 'inflation-labels');
  await page.getByRole('button', { name: 'Je Jahr', exact: true }).click();
  await expect(page.getByTestId('inflation-basket-yearly')).toContainText(
    'Beitrag: Aug 25 bis Aug 26',
  );
  await inspectReport(page, info, 'inflation-labels-yearly');
});
