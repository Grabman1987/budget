import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('privacy follows routes and reload, masks money and chart alternatives, preserves an open draft', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/?monat=2026-09');
  const header = page.locator(info.project.name === 'mobile' ? '.m-head' : '.topbar');
  const toggle = header.getByRole('button', { name: 'Beträge verbergen', exact: true });
  await expect(page.getByTestId('heute-lead-value')).toContainText('988', { timeout: 20_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  for (const path of [
    '/?monat=2026-09',
    '/plan/monat?monat=2026-09',
    '/konten',
    '/vermoegen/nettovermoegen',
    '/reports/gesamttabelle',
    '/einstellungen/regelwerk',
  ]) {
    await page.goto(path);
    await expect(
      header.getByRole('button', { name: 'Beträge verbergen', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main')).toContainText('•••', { timeout: 20_000 });
    const leaks = await page.locator('main').evaluate((main) => {
      const money = /[+−-]?\d[\d.,\s]*(?:Mio\.\s*)?(€|EUR|USD|GBP|CHF)(?![A-Z])/g;
      return [
        main.textContent ?? '',
        ...Array.from(main.querySelectorAll('[aria-label], [title]')).map(
          (el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`,
        ),
      ].flatMap((text) => [...text.matchAll(money)].map((m) => m[0]));
    });
    expect(leaks, path).toEqual([]);
  }
  await page.goto('/konten?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  await expect(amount).toHaveAttribute('type', 'password');
  await amount.fill('12,50');
  await dialog.getByLabel('Empfänger').fill('Beispielmarkt');
  await page.keyboard.press('Control+Shift+H');
  await expect(amount).toHaveAttribute('type', 'text');
  await expect(amount).toHaveValue('12,50');
  await expect(dialog.getByLabel('Empfänger')).toHaveValue('Beispielmarkt');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('capture-prefill.png') });
});
