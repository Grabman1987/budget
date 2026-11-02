import { expect, sampleTest as test } from './sample';

test('S3 ordinary filtering replaces history and an entity push restores filter, period and scroll on Back', async ({
  page,
}) => {
  await page.goto('/konten/buchungen?monat=2026-09&kategorie=cat-miete');
  const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  const input = page.getByRole('searchbox', { name: 'In Buchungen suchen', exact: true });
  await expect(input).toBeVisible();
  const historyLength = await page.evaluate(() => history.length);
  await input.fill('Hausverwaltung');
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'Hausverwaltung');
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(page.locator('tr[data-booking]').first()).toContainText('Hausverwaltung');
  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  const source = page.url();
  const scroll = await page.evaluate(() => window.scrollY);
  const observe = async (stage: string) =>
    test.info().attach(`return-${stage}`, {
      body: JSON.stringify(
        await page.evaluate(() => ({
          scroll: scrollY,
          path: location.pathname,
          active: document.activeElement?.id,
        })),
      ),
      contentType: 'application/json',
    });
  await observe('source');
  // The phone header is intentionally not sticky: tapping its offscreen button first scrolls
  // to the header. Keep this scrolled-return case at 400px with the supported shortcut in both
  // engines; the separate S3 smoke exercises the actual phone button without a keyboard.
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Suchen', exact: true });
  await observe('palette');
  await search.getByRole('combobox', { name: 'Suchen', exact: true }).fill('Girokonto');
  await observe('before-selection');
  await search
    .getByRole('option', { name: /Konto.*Girokonto/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/konten\/acc-giro$/);
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'Girokonto', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(source);
  await observe('returned');
  await expect(input).toHaveValue('Hausverwaltung');
  await expect(page.locator('tr[data-booking]').first()).toContainText('Hausverwaltung');
  // The existing OFF router deliberately excludes the journal from restoration. S3 enables it ON;
  // both policies are independently asserted against the actual constructed router in the unit contract.
  if (redesign) {
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(scroll - 0.5);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(scroll + 0.5);
  }
  await page.reload();
  await expect(page).toHaveURL(source);
  await expect(input).toHaveValue('Hausverwaltung');
  expect(new URL(page.url()).searchParams.get('monat')).toBe('2026-09');
  expect(new URL(page.url()).searchParams.get('kategorie')).toBe('cat-miete');
  await expect(page.locator('tr[data-booking]').first()).toContainText('Hausverwaltung');
});
