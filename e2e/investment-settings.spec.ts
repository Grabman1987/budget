import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('average default, saved FIFO switch, reload, both themes and accessible controls', async ({
  page,
  isMobile,
}) => {
  // Viewports run against the same server; isolate UI persistence here. SQLite persistence and
  // strict API validation have independent server/DB tests using the actual migrated table.
  let saved = 'average';
  await page.route('**/api/portfolio/preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { costMethod: string };
      saved = body.costMethod;
    }
    await route.fulfill({ json: { costMethod: saved } });
  });
  await page.goto('/einstellungen/depots');
  const select = page.getByLabel('Einstandskostenmethode');
  await expect(select).toHaveValue('average');
  // Desktop: the settings rail shows the page; phone: the back bar names it.
  if (isMobile) await expect(page.locator('.settings-here')).toHaveText('Depots & Kryptos');
  else
    await expect(
      page.getByRole('link', { name: 'Depots & Kryptos', exact: true }),
    ).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await expect(page.getByRole('heading', { name: 'Einstandskosten', exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    const path = test.info().outputPath(`investment-settings-${scheme}.png`);
    await page.screenshot({ path, fullPage: true });
    await test.info().attach(`investment settings ${scheme}`, { path, contentType: 'image/png' });
  }
  expect((await select.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await select.selectOption('fifo');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Einstandskostenmethode gespeichert.')).toBeVisible();
  await page.reload();
  await expect(select).toHaveValue('fifo');
  await select.selectOption('average');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Einstandskostenmethode gespeichert.')).toBeVisible();
  await page.reload();
  await expect(select).toHaveValue('average');
});
