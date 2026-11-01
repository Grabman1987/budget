import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { MIN_TARGET_PX } from '../../e2e/ledger-helpers';
import AxeBuilder from '@axe-core/playwright';

async function rect(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
}

type TargetName =
  | `Tab${number}`
  | 'Fab'
  | 'PlanMenu'
  | 'SearchPrivacy'
  | 'SearchTheme'
  | 'WealthMenu'
  | 'HeuteAvatar'
  | 'AccountTree';

async function target(locator: Locator, name: TargetName) {
  try {
    await expect(locator).toBeVisible();
    const bounds = await rect(locator);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(bounds!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  } catch (error) {
    // Callers supply only fixed control names; local native diagnostics never need raw errors.
    if (error instanceof Error) error.name = `S3Target${name}`;
    throw error;
  }
}

async function screenshot(page: Page, path: string) {
  if (page.viewportSize() !== null) {
    await page.screenshot({ path, animations: 'disabled' });
    return;
  }
  // A real native Chrome zoom uses viewport:null. Capture the unmodified physical viewport;
  // Playwright's synthesized CSS clip can crop it when native page zoom changes DIP dimensions.
  const cdp = await page.context().newCDPSession(page);
  try {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const bytes = Buffer.from(data, 'base64');
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const viewport = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      dpr: devicePixelRatio,
    }));
    expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(
      Math.floor(viewport.width * viewport.dpr),
    );
    writeFileSync(path, bytes);
  } finally {
    await cdp.detach();
  }
}

async function search(page: Page, phone: boolean) {
  if (phone)
    await page.locator('.m-head').getByRole('button', { name: 'Suchen', exact: true }).click();
  else await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Suchen', exact: true });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox', { name: 'Suchen', exact: true });
  await expect(input).toBeFocused();
  return { dialog, input };
}

/** Real browser proof shared by the existing OFF/ON/PWA smoke; no financial mocks or writes. */
export async function verifyRedesignShell(
  page: Page,
  origin: string,
  enabled: boolean,
  output: string,
  production = true,
) {
  await page.clock.setFixedTime(new Date('2026-09-17T08:30:00+02:00'));
  mkdirSync(output, { recursive: true });
  if (production) {
    for (const path of [
      '/dev/details',
      '/dev/diagramme',
      '/dev/bauteile',
      '/dev/report-answer',
      '/dev/panels',
      '/dev/start',
    ]) {
      await page.goto(`${origin}${path}`);
      await expect(
        page.getByRole('heading', { name: 'Seite nicht gefunden', exact: true }),
      ).toBeVisible();
    }
  }
  await page.goto(`${origin}/plan/monat?monat=2026-09`);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const { width } = viewport;
  const phone = width < 768;
  const writes: string[] = [];
  const observe = (request: Request) => {
    if (request.method() !== 'GET' && /\/api\/(bookings|payees)(?:[/?]|$)/.test(request.url()))
      writes.push(request.url());
  };
  page.on('request', observe);
  await page.locator('main').focus();
  await page.keyboard.press('n');
  const capture = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
  await expect(capture).toBeVisible();
  await capture.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(capture).toBeHidden();
  const navigation = page.getByRole('navigation', {
    name: phone ? 'Hauptnavigation' : 'Planliste',
    exact: true,
  });
  await expect(navigation).toBeVisible();
  expect(await navigation.getByRole('link').allTextContents()).toEqual([
    'Heute',
    'Plan',
    'Konten',
    'Vermögen',
    'Reports',
  ]);
  if (phone) {
    for (const [index, link] of (await navigation.getByRole('link').all()).entries())
      await target(link, `Tab${index}`);
    const tabs = await rect(navigation);
    const fab = page.getByRole('link', { name: 'Buchung erfassen', exact: true });
    await target(fab, 'Fab');
    const bounds = await rect(fab);
    expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(tabs!.y + 0.5);
  }
  const menu = page.getByLabel('Planansicht wählen: Monat', { exact: true });
  if (enabled) {
    await target(menu, 'PlanMenu');
    await menu.focus();
    await page.keyboard.press('Enter');
    const views = page.getByRole('navigation', { name: 'Ansichten von Plan', exact: true });
    await expect(views).toBeVisible();
    const firstView = views.getByRole('link', { name: 'Monat', exact: true });
    await firstView.focus();
    await expect(firstView).toBeFocused();
    // The later sticky Plan toolbar must not intercept the first menu entry.
    expect(
      await firstView.evaluate((link) => {
        const bounds = link.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        return hit === link || link.contains(hit);
      }),
    ).toBe(true);
    await firstView.click();
    await expect(views).toBeHidden();
    await menu.click();
    await expect(views).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).include('.area-page-menu').analyze()).violations,
    ).toEqual([]);
    expect(await views.getByRole('link').allTextContents()).toEqual([
      'Monat',
      'Jahr',
      'Zahlungen',
      'Ziele',
      'Prognose',
    ]);
    const lastView = views.getByRole('link', { name: 'Prognose', exact: true });
    await lastView.focus();
    await expect(lastView).toBeInViewport();
    await views.getByRole('link', { name: 'Zahlungen', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(views).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await views.getByRole('link', { name: 'Zahlungen', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/plan/erwartet?monat=2026-09`);
    await expect(page.getByLabel('Planansicht wählen: Zahlungen', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/plan/monat?monat=2026-09`);
  } else {
    await expect(menu).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Register von Plan', exact: true }),
    ).toBeVisible();
  }

  const { dialog, input } = await search(page, phone);
  await input.press('n');
  await expect(capture).toBeHidden();
  await input.fill('');
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).focus();
  await page.keyboard.press('n');
  await expect(capture).toBeHidden();
  await input.focus();
  if (enabled) {
    const utilities = dialog.getByRole('group', { name: 'Darstellung', exact: true });
    const privacy = utilities.getByRole('button', { name: 'Beträge verbergen', exact: true });
    await target(privacy, 'SearchPrivacy');
    await privacy.click();
    await expect(privacy).toHaveAttribute('aria-pressed', 'true');
    await privacy.click();
    await expect(privacy).toHaveAttribute('aria-pressed', 'false');
    const theme = utilities.getByRole('button', { name: /Dunkle Blaupause|Heller Zeichenfilm/ });
    await target(theme, 'SearchTheme');
    const lightSwitch = utilities.getByRole('button', { name: 'Heller Zeichenfilm', exact: true });
    if (await lightSwitch.isVisible()) await lightSwitch.click();
    for (const scheme of ['dark', 'light'] as const) {
      const label = scheme === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm';
      await utilities.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
        [],
      );
      await screenshot(
        page,
        join(output, `shell-search-${enabled ? 'on' : 'off'}-${width}-${scheme}.png`),
      );
    }
    // The short phone viewport scrolls this existing result surface independently.
    for (const name of ['Alle Ergebnisse', 'Tastenkürzel anzeigen (?)']) {
      const control = dialog.getByRole('button', { name, exact: true });
      await control.focus();
      await expect(control).toBeFocused();
      const bounds = await rect(control);
      const clip = await rect(dialog.locator('.global-search-popup'));
      expect(bounds.y).toBeGreaterThanOrEqual(Math.max(0, clip.y) - 0.5);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        Math.min(viewport.height, clip.y + clip.height) + 0.5,
      );
    }
    await input.focus();
    await input.fill('Wiederkehrende Zahlungen');
    await dialog.getByRole('option', { name: /Plan · Zahlungen/ }).click();
    await expect(page).toHaveURL(`${origin}/plan/erwartet?monat=2026-09`);
    await expect(page.getByLabel('Planansicht wählen: Zahlungen', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/plan/monat?monat=2026-09`);
  } else {
    await expect(dialog.getByRole('group', { name: 'Darstellung', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await expect(dialog).toBeHidden();

  await page.goto(`${origin}/vermoegen/portfolio?zeitraum=1J`);
  if (enabled) {
    const wealth = page.getByLabel('Vermögensansicht wählen: Portfolio', { exact: true });
    await target(wealth, 'WealthMenu');
    await wealth.click();
    const views = page.getByRole('navigation', { name: 'Ansichten von Vermögen', exact: true });
    expect(await views.getByRole('link').allTextContents()).toEqual([
      'Nettovermögen',
      'Portfolio',
      'Schulden',
      'Freiheit',
    ]);
    await views.getByRole('link', { name: 'Schulden', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/vermoegen/schulden?zeitraum=1J`);
    await page.reload();
    await expect(
      page.getByLabel('Vermögensansicht wählen: Schulden', { exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/vermoegen/portfolio?zeitraum=1J`);
  }
  if (phone) {
    await expect(page.locator('.m-profile')).toHaveCount(enabled ? 0 : 1);
    await page.goto(`${origin}/`);
    const avatar = page.locator('.m-profile > summary');
    await target(avatar, 'HeuteAvatar');
    await avatar.click();
    const profile = page.getByRole('link', { name: 'Profil und Einstellungen', exact: true });
    await profile.click();
    await expect(page).toHaveURL(
      `${origin}${enabled ? '/einstellungen/profil' : '/einstellungen'}`,
    );
    if (enabled)
      await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
  } else if (enabled) {
    const accounts = page.locator('#acct-tree-label > a');
    await target(accounts, 'AccountTree');
    await accounts.click();
    await expect(page).toHaveURL(`${origin}/konten/buchungen`);
    await expect(
      page.getByRole('searchbox', { name: 'In Buchungen suchen', exact: true }),
    ).toBeVisible();
    await page.locator('.sidebar-foot > a.profile').click();
    await expect(page).toHaveURL(`${origin}/einstellungen/profil`);
  }
  const geometry = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 0.5);
  expect(writes).toEqual([]);
  page.off('request', observe);
  console.log(
    `PASS S3 ${enabled ? 'ON' : 'OFF'} ${width}px: five areas, native page menus, search utilities, compatible context, Back/reload and profile/account entries`,
  );
}
