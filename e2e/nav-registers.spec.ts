import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('Plan and Konten registers fit without swiping and Plan stays active', async ({
  page,
}, info) => {
  test.slow();
  await page.goto('/plan/monat');
  await page.evaluate(() => document.fonts.ready);
  for (const label of ['Monat', 'Jahr', 'Zahlungen', 'Ziele', 'Prognose']) {
    const row = page.getByRole('navigation', { name: 'Register von Plan' });
    await expect(row.getByRole('link')).toHaveText([
      'Monat',
      'Jahr',
      'Zahlungen',
      'Ziele',
      'Prognose',
    ]);
    for (const tab of await row.getByRole('link').all()) {
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      if (info.project.name !== 'desktop') {
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
    }
    expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await row.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(/\/plan\//);
    await expect(
      page
        .locator('.sidebar, .tabbar')
        .getByRole('link', { name: 'Plan', exact: true })
        .filter({ visible: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('navigation', { name: 'Register von Plan' }).locator('[aria-current="page"]'),
    ).toHaveText([label]);
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Liquiditätsprognose');
  await page.screenshot({ path: info.outputPath('plan-prognose.png') });
  await page.goto('/konten/pruefen');
  const row = page.getByRole('navigation', { name: 'Register von Konten' });
  await expect(row.getByRole('link')).toHaveText(['Übersicht', 'Buchungen', 'Prüfen', 'Kontakte']);
  for (const tab of await row.getByRole('link').all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('konten-pruefen.png') });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('.registers').analyze()).violations).toEqual([]);
  }
});

test('legacy forecast, inbox and panel links retain their search state', async ({ page }) => {
  for (const [from, to] of [
    ['/reports/liquiditaet?horizon=90d&levers=trim-variable&monat=2026-09', '/plan/prognose'],
    [
      '/konten/posteingang?von=%2Fplan%2Fmonat&pruefen=reconcile&aufgaben=current',
      '/konten/pruefen',
    ],
    [
      '/konten/posteingang/synthetic-warning?von=%2Fkonten&pruefen=reconcile',
      '/konten/pruefen/synthetic-warning',
    ],
  ]) {
    await page.goto(from!);
    await page.waitForURL((url) => url.pathname === to, { waitUntil: 'load' });
    await expect(
      page
        .getByRole('navigation', {
          name: to === '/plan/prognose' ? 'Register von Plan' : 'Register von Konten',
        })
        .locator('[aria-current="page"]'),
    ).toHaveText([to === '/plan/prognose' ? 'Prognose' : 'Prüfen']);
    expect(new URL(page.url()).searchParams).toEqual(
      new URL(from!, 'https://budget.invalid').searchParams,
    );
  }
  await page.goto('/konten?panel=posteingang&monat=2026-09');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/konten/pruefen');
  expect(new URL(page.url()).searchParams.get('von')).toBe('/konten?monat=2026-09');
  await page.goto('/reports');
  await expect(page.getByRole('link', { name: 'Liquiditätsprognose', exact: true })).toHaveCount(0);
});

test('other area register rows fit or expose their existing scroll fade', async ({ page }) => {
  for (const [path, area] of [
    ['/vermoegen/nettovermoegen', 'Vermögen'],
    ['/reports', 'Reports'],
  ]) {
    await page.goto(path!);
    await page.evaluate(() => document.fonts.ready);
    const row = page.getByRole('navigation', { name: `Register von ${area}` });
    const overflows = await row.evaluate((el) => el.scrollWidth > el.clientWidth);
    if (overflows) {
      await expect(row).toHaveAttribute('data-fade-end', 'true');
      expect(await row.evaluate((el) => getComputedStyle(el).maskImage)).toContain(
        'linear-gradient',
      );
    }
  }
  await page.goto('/einstellungen');
  // Settings use a grouped index/rail, never a horizontal register row.
  await expect(page.getByRole('navigation', { name: /Register von Einstellungen/ })).toHaveCount(0);
});
