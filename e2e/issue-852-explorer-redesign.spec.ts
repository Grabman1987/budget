import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { sampleTest as test, expect } from './sample';
import { redesignReportsOn } from './report-frame';
import { openCustomExplorer } from './explorer-controls';

test('852 Explorer preserves sources, stable saved IDs, dirty cancel and responsive readers', async ({
  page,
}, info) => {
  await page.goto('/reports/explorer');
  const on = await redesignReportsOn(page);
  if (!on) {
    await expect(page.getByTestId('ex-table')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Darstellung der Auswertung' })).toHaveCount(0);
    return;
  }
  const mode = page.getByRole('combobox', { name: 'Darstellung der Auswertung' });
  await expect(mode).toHaveValue('heatmap');
  await expect(page.getByTestId('template-heatmap')).toBeVisible();
  expect(new URL(page.url()).searchParams.has('ansicht')).toBe(false);
  if (page.viewportSize()!.width < 768) {
    await expect(page.getByRole('list', { name: 'Kompakte Auswertungszeilen' })).toBeVisible();
    await expect(page.locator('.r6-phone-rows')).toBeVisible();
    await expect(page.locator('.r6-table-details')).not.toHaveAttribute('open');
  } else await expect(page.getByTestId('template-heatmap').locator('table')).toBeVisible();
  const evidence = 'docs/evidence/redesign-reports-20261103-a';
  await mkdir(evidence, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `${evidence}/r6-explorer-${info.project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await openCustomExplorer(page);
  const name = `852 Synthetic ${info.project.name}`;
  await page.getByLabel('Ansicht speichern').fill(name);
  page.once('dialog', (dialog) => dialog.dismiss());
  await mode.selectOption('heatmap');
  await expect(mode).toHaveValue('custom');
  await expect(page.getByLabel('Ansicht speichern')).toHaveValue(name);
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  const stored = (await (await page.request.get('/api/reports/saved-queries')).json()) as {
    views: { id: string; name: string }[];
  };
  const id = stored.views.find((view) => view.name === name)!.id;
  await page
    .getByRole('navigation', { name: 'Meine Auswertungen' })
    .getByRole('link', { name, exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('ansicht')).toBe(id);
  await expect(page.getByTestId('ex-table')).toBeVisible();
  await page.getByRole('button', { name: `Ansicht ${name} löschen`, exact: true }).click();
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.goto('/reports/explorer');
  await expect(mode).toHaveValue('heatmap');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
