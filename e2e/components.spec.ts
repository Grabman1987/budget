import { expect, test, type Page } from '@playwright/test';
import { expectScreenshot } from './visual';

const PAGE = '/dev/bauteile';

async function open(page: Page, colorScheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await expect(page.getByTestId('chart-lines')).toBeVisible();
  await expect(page.getByTestId('chart-classes')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('design system page /dev/bauteile', () => {
  test('renders every primitive without console or CSP errors', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(msg.text());
    });
    page.on('pageerror', (err) => problems.push(err.message));
    await open(page);
    for (const id of [
      'farben',
      'grundbausteine',
      'betrag',
      'massketten',
      'stueckliste',
      'revisionen',
      'ueberlagerungen',
      'diagramme',
    ]) {
      await expect(page.locator(`section#${id}`)).toBeVisible();
    }
    expect(problems).toEqual([]);
  });

  test('follows the system theme and lets the user override it, persisted across reloads', async ({
    page,
  }) => {
    await open(page, 'light');
    expect(await bodyBackground(page)).toBe('rgb(246, 248, 251)');

    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await bodyBackground(page)).toBe('rgb(11, 49, 82)');

    await page.getByRole('button', { name: 'Hell', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe('rgb(246, 248, 251)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await bodyBackground(page)).toBe('rgb(246, 248, 251)');

    await page.getByRole('button', { name: 'System', exact: true }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    expect(await bodyBackground(page)).toBe('rgb(11, 49, 82)');
  });

  test('amount field evaluates arithmetic and commits cents', async ({ page }) => {
    await open(page);
    const input = page.getByRole('textbox', { name: 'Betrag', exact: true });
    await input.fill('1.000+576×2');
    await expect(page.getByText(/= 2\.152,00 €/)).toBeVisible();
    await input.press('Enter');
    await expect(input).toHaveValue('2.152,00');
    await expect(page.getByTestId('amount-committed')).toContainText('2.152,00 €');
  });

  test('side panel traps focus, closes with Esc and returns focus', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Seitenpanel öffnen' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Kontostand prüfen' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('revision action removes the row and the toast undoes it', async ({ page }) => {
    await open(page);
    const row = page.getByText('12 Buchungen im Posteingang');
    await expect(row).toBeVisible();
    await page.getByRole('button', { name: 'Öffnen' }).first().click();
    await expect(row).toBeHidden();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(row).toBeVisible();
  });

  test('drawn dimension chain: segments work by keyboard, it folds, lines are plotted', async ({
    page,
  }) => {
    await open(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const segment = page.getByRole('button', { name: 'Bedarf 1.280,00 €, Einzelposten zeigen' });
    await segment.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Bedarf' })).toBeVisible();
    await page.keyboard.press('Escape');

    const line = page.locator('#kette-frei .plot-line').first();
    const animation = await line.evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(animation).toEqual({ name: 'plot-draw', duration: '0.9s' });

    const toggle = page.getByRole('button', { name: 'Maßkette ausblenden' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Maßkette zeigen' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(segment).toBeHidden();
    await page.getByRole('button', { name: 'Maßkette zeigen' }).click();
    await expect(segment).toBeVisible();
  });

  test('drawn dimension chain has no animation for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const name = await page
      .locator('#kette-frei .plot-line')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });

  test('parts list assemblies collapse and number their positions', async ({ page }) => {
    await open(page);
    await expect(page.getByText('1.1', { exact: true })).toBeVisible();
    await expect(page.getByText('2.2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Fixkosten und Mindestraten/ }).click();
    await expect(page.getByText('Miete', { exact: true })).toBeHidden();
  });

  test('phone: interactive controls are at least 44 px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'touch targets are a phone requirement');
    await open(page);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, input, select, [role="switch"]')]
        .filter((el) => el.offsetParent !== null && !el.closest('dialog:not([open])'))
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim(),
            h: box.height,
          };
        })
        .filter((el) => el.h < 43.5),
    );
    expect(small).toEqual([]);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`regression baseline (own screenshot): ${scheme}`, async ({ page }) => {
      await open(page, scheme);
      await expectScreenshot(page, `bauteile-${scheme}.png`, { fullPage: true });
    });
  }
});
