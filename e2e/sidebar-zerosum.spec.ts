import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { toast } from './ledger-helpers';

test('Z4: account list, remembered collapse, active selection and light/dark accessibility', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  const origin = isolatedLedger.origin;
  for (const [name, type, openingBalanceCents] of [
    ['Alpha', 'checking', 120_000],
    ['Bravo', 'cash', -20_000],
    ['Testkarte', 'credit_card', -30_000],
    ['Testkredit', 'loan', -400_000],
    ['Testanlage', 'other_asset', 500_000],
  ]) {
    const response = await request.post(`${origin}/api/accounts`, {
      headers: { origin },
      data: { name, type, openingBalanceCents, openingDate: '2026-09-01' },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await page.goto('/konten');
  await expect(page.getByTestId('net-worth')).toBeVisible();
  const sidebar = page.locator('.sidebar');
  if (!isMobile) {
    await expect(sidebar).toBeVisible();
    expect((await sidebar.boundingBox())!.width).toBe(236);
    await expect(sidebar.locator('.sheet-no, .acct-group-sub')).toHaveCount(0);
    await expect(sidebar.locator('.sheetlist .icon')).toHaveCount(5);
    await expect(sidebar.locator('.acct-group-title')).toHaveText([
      'Budget-Konten',
      'Kreditkarten',
      'Kredite',
      'Investments',
    ]);
    await expect(sidebar.locator('.acct-group-icon')).toHaveCount(4);
    await expect(sidebar.locator('.acct-type-icon')).toHaveCount(5);
    await expect(sidebar.locator('.acct-group-bar .acct-amount')).toHaveText([
      '1.000 €',
      '−300 €',
      '−4.000 €',
      '5.000 €',
    ]);
    for (const name of ['Bravo', 'Testkarte', 'Testkredit']) {
      const amount = sidebar
        .getByRole('link', { name: new RegExp(`^${name}`) })
        .locator('.acct-amount');
      await expect(amount).toHaveClass(/is-neg/);
      expect(await amount.evaluate((el) => getComputedStyle(el).color)).toBe(
        await amount.evaluate((el) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--red)';
          el.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        }),
      );
    }
    // The plus and settings affordances keep accessible names and 44 px targets.
    for (const action of [
      sidebar.getByRole('button', { name: 'Neues Konto anlegen' }),
      sidebar.getByRole('link', { name: 'Konten verwalten' }),
    ]) {
      const box = (await action.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const alpha = sidebar.getByRole('link', { name: /^Alpha/ });
    await alpha.click();
    await expect(alpha).toHaveAttribute('aria-current', 'page');
    const styles = (el: Element) => {
      const css = getComputedStyle(el);
      return [css.backgroundColor, css.borderColor, css.fontWeight, css.boxShadow];
    };
    expect(await alpha.evaluate(styles)).toEqual(
      await sidebar.locator('.sheetlist a[aria-current="page"]').evaluate(styles),
    );
    const fold = sidebar.getByRole('button', { name: 'Budget-Konten', exact: true });
    await fold.click();
    await expect(alpha).toBeHidden();
    await page.reload();
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await fold.click();
    await expect(alpha).toBeVisible();
  } else {
    await expect(sidebar).toBeHidden();
    const targets = page.locator('.m-head a, .m-head button, .tabbar a, .fab');
    for (const target of await targets.all()) {
      if (!(await target.isVisible())) continue;
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    if (!isMobile) builder.include('.sidebar');
    expect((await builder.analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`z4-${scheme}.png`) });
    if (!isMobile) {
      await page.getByRole('button', { name: 'Seitenleiste einklappen' }).click();
      expect((await sidebar.boundingBox())!.width).toBe(72);
      await expect(sidebar.getByRole('link', { name: 'Plan', exact: true })).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .include('.sidebar')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({ path: info.outputPath(`z4-collapsed-${scheme}.png`) });
      await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click();
    }
  }
  if (!isMobile) {
    await sidebar.getByRole('link', { name: 'Konten verwalten' }).click();
    await expect(page).toHaveURL(/\/einstellungen\/konten$/);
  }
});

test('Z4: plus opens the existing form in an empty ledger, exact-cent save and undo', async ({
  page,
  request,
  isolatedLedger,
  isMobile,
}) => {
  test.skip(isMobile, 'The sidebar is desktop-only; the existing phone entry remains unchanged');
  await page.goto('/plan/monat');
  const plus = page.locator('.sidebar').getByRole('button', { name: 'Neues Konto anlegen' });
  await plus.click();
  const dialog = page.getByRole('dialog', { name: 'Konto anlegen' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(plus).toBeFocused();
  await plus.click();
  await dialog.getByLabel('Name', { exact: true }).fill('Testkonto Z4');
  await dialog.getByLabel('Startsaldo', { exact: true }).fill('12,34');
  await dialog.getByRole('button', { name: 'Konto anlegen', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText('Konto „Testkonto Z4“ angelegt.');
  const response = await request.get(`${isolatedLedger.origin}/api/accounts`);
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { accounts: { name: string; balanceCents: number }[] };
  expect(data.accounts.find((a) => a.name === 'Testkonto Z4')?.balanceCents).toBe(1234);
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('.acct-tree .acct-name')).toHaveCount(0);
});
