import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sampleTest as test, expect } from './sample';
import { expectedSettingsGroups } from './navigation-contract';

const destinations = [
  ['index', '/einstellungen?ansicht=index'],
  ['profil', '/einstellungen/profil'],
  ['sicherheit', '/einstellungen/sicherheit'],
  ['konten', '/einstellungen/konten'],
  ['depots', '/einstellungen/depots'],
  ['kontakte', '/einstellungen/kontakte'],
  ['kategorien', '/einstellungen/kategorien'],
  ['regelwerk', '/einstellungen/regelwerk'],
  ['zuordnungsregeln', '/einstellungen/zuordnung'],
  ['warenkorb', '/einstellungen/warenkorb'],
  ['verbindungen', '/einstellungen/datenquellen'],
  ['anlageklassen', '/einstellungen/anlageklassen'],
  ['csv-export', '/einstellungen/export'],
  ['projekte', '/einstellungen/projekte'],
] as const;

test('source dates distinguish a pending payslip scan from an empty scan history', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((done) => {
    release = done;
  });
  await page.route('**/api/payslip-intake/status', async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    await pending;
    await route.fulfill({
      response,
      json: {
        ...status,
        dropboxConfigured: false,
        dropboxConnected: false,
        lastScanAt: null,
        filesFound: 0,
        errors: 0,
      },
    });
  });
  try {
    await page.goto('/einstellungen/datenquellen');
    const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
    if (!on) {
      await expect(page.locator('.settings-connections-v2')).toHaveCount(0);
      return;
    }
    const payslip = page.getByRole('region', { name: 'Gehaltszettel', exact: true });
    await expect(payslip.getByText('Letzter Scanversuch: Wird geladen …')).toBeVisible();
    await expect(payslip).not.toContainText('Nicht verfügbar');
    await expect(payslip).not.toContainText('Letzter Erfolg:');
    release();
    await expect(payslip.getByText('Letzter Scanversuch: Noch kein Scanversuch')).toBeVisible();
    await expect(payslip).not.toContainText('Wird geladen');
    await expect(page.getByRole('region', { name: 'Bank', exact: true })).toContainText(
      'Letzter Erfolg:',
    );
  } finally {
    release();
  }
});

test('settings design: every destination and group at the reference viewport, with 320px reflow', async ({
  page,
  isMobile,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/einstellungen/profil');
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (!on) {
    await expect(page.locator('.settings-redesign')).toHaveCount(0);
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    return;
  }
  const folder = resolve('docs/evidence/redesign-einstellungen-20261102');
  mkdirSync(folder, { recursive: true });
  const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const capture = async (name: string, path: string) => {
    await page.setViewportSize(viewport);
    await page.goto(path);
    await expect(page.locator('.settings-redesign')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    if (isMobile) {
      await expect(
        page.locator('.m-head').getByRole('button', { name: 'Suchen', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    }
    if (!isMobile) {
      const contact = page
        .locator('.settings-nav-rail')
        .getByRole('link', { name: 'Kontakte', exact: true });
      if (await contact.isVisible()) {
        const bounds = await contact.boundingBox();
        expect(bounds!.height, 'compact contact entry with location pill').toBeLessThanOrEqual(48);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (!isMobile && name === 'verbindungen') {
      for (const row of await page.locator('.settings-source-head').all())
        expect((await row.boundingBox())!.height, 'compact source row').toBeLessThanOrEqual(96);
    }
    await expect(page.locator('main')).not.toContainText('Seite nicht gefunden');
    await expect(page.locator('main')).not.toContainText('Noch nicht gebaut');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      name,
    ).toBeLessThanOrEqual(viewport.width);
    const pathToPng = resolve(folder, `${name}-${isMobile ? 'phone' : 'desktop'}.png`);
    await page.screenshot({ path: pathToPng, animations: 'disabled' });
    await info.attach(name, { path: pathToPng, contentType: 'image/png' });
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${name} at 320`,
      ).toBeLessThanOrEqual(320);
    }
  };
  for (const [name, path] of destinations) await capture(name, path);
  for (const group of expectedSettingsGroups(true))
    await capture(`gruppe-${group.id}`, `/einstellungen?ansicht=index&gruppe=${group.id}`);
  await capture('zielallokation', '/einstellungen/anlageklassen?ansicht=stufen');
  await page.setViewportSize(viewport);
  await page.getByText('Dynamische Stufen nach Anlagesumme', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Vermögensstufen mit Zielquoten' })).toBeVisible();
  await expect(page.locator('.settings-stage-table tbody tr')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
  await page.screenshot({
    path: resolve(folder, `vermoegensstufen-entwurf-${isMobile ? 'phone' : 'desktop'}.png`),
    animations: 'disabled',
  });
  // The reference evidence is a draft, derived from the app's existing policy. It never saves it.
});

test('settings entry follows the desktop profile and the Heute phone avatar', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (!on) {
    await expect(page.locator('main')).toBeVisible();
    return;
  }
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  const folder = resolve('docs/evidence/redesign-einstellungen-20261102');
  mkdirSync(folder, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  if (isMobile) {
    await page.locator('.m-profile > summary').click();
    const entry = page.getByRole('link', { name: 'Profil und Einstellungen', exact: true });
    await expect(entry).toBeVisible();
    await page.screenshot({
      path: resolve(folder, 'einstieg-heute-avatar-phone.png'),
      animations: 'disabled',
    });
    await entry.click();
    await expect(page).toHaveURL(/\/einstellungen$/);
    await expect(page.locator('.m-profile')).toHaveCount(0);
  } else {
    const entry = page.locator('.sidebar-foot > .profile');
    await entry.focus();
    await page.screenshot({
      path: resolve(folder, 'einstieg-profil-sidebar-desktop.png'),
      animations: 'disabled',
    });
    await entry.click();
    await expect(page).toHaveURL(/\/einstellungen\/profil$/);
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  }
});
