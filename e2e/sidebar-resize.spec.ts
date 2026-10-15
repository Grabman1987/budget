import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';
import { sampleTest as test, expect } from './sample';

test('desktop sidebar resizes with pointer and keyboard and remembers its width', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop shell control only');
  await page.goto('/');
  const handle = page.getByRole('slider', { name: 'Breite der Seitenleiste' });
  await expect(handle).toHaveAttribute('aria-valuenow', '236');
  await page.mouse.move(700, 100);
  await expect(handle).toHaveCSS('opacity', '0');
  await page.locator('#sidebar').hover();
  await expect(handle).toHaveCSS('opacity', '1');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(audit.violations).toEqual([]);
    const file = `sidebar-resize-${theme}-desktop.png`;
    await page.screenshot({
      animations: 'disabled',
      path: process.env['BUDGET_SEARCH_EVIDENCE']
        ? join(process.env['BUDGET_SEARCH_EVIDENCE'], file)
        : info.outputPath(file),
    });
  }
  await page.evaluate(() => (document.documentElement.dataset['theme'] = 'light'));

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY);
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '316');
  await expect(page.locator('.app')).toHaveCSS('grid-template-columns', '316px 1124px');

  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', '360');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await page.keyboard.press('ArrowLeft');
  await expect(handle).toHaveAttribute('aria-valuenow', '310');
  await page.reload();
  const restoredHandle = page.getByRole('slider', { name: 'Breite der Seitenleiste' });
  await expect(restoredHandle).toHaveAttribute('aria-valuenow', '310');

  await restoredHandle.focus();
  await page.keyboard.press('Home');
  await expect(restoredHandle).toHaveAttribute('aria-valuenow', '200');
  await page.keyboard.press('ArrowLeft');
  await expect(restoredHandle).toHaveAttribute('aria-valuenow', '200');

  await page.getByRole('button', { name: 'Seitenleiste einklappen' }).click();
  await expect(page.getByRole('slider', { name: 'Breite der Seitenleiste' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click();
  await expect(page.getByRole('slider', { name: 'Breite der Seitenleiste' })).toHaveAttribute(
    'aria-valuenow',
    '200',
  );
});
