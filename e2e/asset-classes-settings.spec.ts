import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sampleTest } from './sample';

// These complete owner flows include both themes, repeated Axe scans and WebKit rotation.
test.setTimeout(90_000);

test('groups can be created, renamed and selected; a P2P account keeps its assigned class', async ({
  page,
}, info) => {
  const suffix = info.project.name;
  const groupName = `Gruppe G ${suffix}`,
    className = `Klasse C ${suffix}`,
    accountName = `Plattform P ${suffix}`;
  await page.goto('/einstellungen/anlageklassen');
  await page.getByRole('link', { name: 'Gruppe anlegen', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name der Gruppe').fill(groupName);
  await dialog.getByRole('button', { name: 'Gruppe anlegen', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page
    .locator('.asset-class-table')
    .getByRole('link', { name: groupName, exact: true })
    .click();
  await dialog.getByLabel('Name der Gruppe').fill(groupName + ' neu');
  await dialog.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  const headers = { Origin: new URL(page.url()).origin };
  const res = await page.request.post('/api/asset-classes', { headers, data: { name: className } });
  expect(res.status()).toBe(201);
  const cls = (await res.json()).assetClass;
  const acct = await page.request.post('/api/accounts', {
    headers,
    data: { name: accountName, type: 'p2p', openingDate: '2026-01-01', openingBalanceCents: 101 },
  });
  expect(acct.status()).toBe(201);
  await page.reload();
  await page.getByLabel(`Gruppe für ${className}`).selectOption({ label: groupName + ' neu' });
  await expect(page.getByLabel(`Gruppe für ${className}`)).toBeEnabled();
  await page.goto('/einstellungen/konten');
  const row = page.locator('.accounts-row').filter({ hasText: accountName });
  await row.getByRole('button', { name: `${accountName} bearbeiten`, exact: true }).click();
  await dialog.getByLabel('Anlageklasse', { exact: true }).selectOption(cls.id);
  await dialog.getByRole('button', { name: /speichern/i }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const id = (await acct.json()).account.id;
  const saved = (await (await page.request.get('/api/accounts')).json()).accounts.find(
    (a: { id: string }) => a.id === id,
  );
  expect(saved.allocationAssetClassId).toBe(cls.id);
  await page.goto('/reports/pallocation');
  // Other specs share this server and may leave a CHF account without a rate, which makes the
  // whole report honestly unavailable; the legend can only be checked while it is available.
  if ((await page.request.get('/api/portfolio/allocation-report')).ok()) {
    await expect(page.locator('.composition-legend')).toContainText(className);
    await expect(page.locator('.composition-legend')).toContainText(groupName + ' neu');
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    await clean(page);
    await page.screenshot({
      path: info.outputPath(`group-composition-${theme}.png`),
      fullPage: true,
    });
  }
});

async function clean(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('.titleblock .tb-cell')
      .evaluateAll((cells) =>
        cells
          .filter((cell) => cell.getClientRects().length)
          .every((cell) => cell.scrollWidth <= cell.clientWidth),
      ),
  ).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}
sampleTest(
  'U01/M01-M12: real settings, class sheet, focus, Back, reopen, scroll, themes and rotation',
  async ({ page, isMobile }, info) => {
    await page.goto('/reports');
    if (isMobile) {
      await page.locator('.m-profile summary').click();
      await page.getByRole('link', { name: 'Profil und Einstellungen' }).click();
      await page.getByRole('link', { name: 'Anlageklassen', exact: true }).click();
    } else await page.goto('/einstellungen/anlageklassen');
    await expect(
      page.getByRole('region', { name: 'Klassen und Sollmodell', exact: true }),
    ).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Noch nicht gebaut');
    await expect(page.getByText('Seitenpanel testen')).toHaveCount(0);
    await expect(page.locator('.asset-class-table')).toContainText('Aktien Welt');
    const opener = page
      .locator('.asset-class-table')
      .getByRole('link', { name: 'Aktien Welt', exact: true });
    const panel = page.getByRole('dialog', { name: 'Aktien Welt', exact: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      await clean(page);
      await page.screenshot({ path: info.outputPath(`settings-${theme}.png`), fullPage: true });
      for (let i = 0; i < 2; i++) {
        await opener.click();
        await expect(panel).toBeVisible();
        await expect(panel.getByLabel('Name der Anlageklasse')).toBeVisible();
        expect(await panel.evaluate((d) => d.contains(document.activeElement))).toBe(true);
        await panel.evaluate((d) => d.getAnimations().forEach((a) => a.finish()));
        const box = await panel.boundingBox();
        expect(box!.height).toBeGreaterThan(100);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
        await expect(
          panel.getByRole('button', { name: 'Schließen', exact: true }),
        ).toBeInViewport();
        await clean(page);
        await page.screenshot({ path: info.outputPath(`class-${theme}-${i}.png`) });
        if (i === 0) {
          const before = await page.evaluate(() => scrollY);
          await panel.locator('.panel-body').evaluate((el) => {
            el.scrollTop = el.scrollHeight;
          });
          expect(await panel.locator('.panel-body').evaluate((el) => el.scrollTop)).toBeGreaterThan(
            0,
          );
          expect(await page.evaluate(() => scrollY)).toBe(before);
          if (isMobile)
            expect(
              await page.evaluate(() => getComputedStyle(document.documentElement).overflowY),
            ).toBe('hidden');
          await panel.getByRole('button', { name: 'Schließen', exact: true }).click();
        } else await page.goBack();
        await expect(panel).toBeHidden();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect(opener).toBeFocused();
      }
    }
    await page.goForward();
    await expect(panel).toBeVisible();
    if (isMobile) {
      await page.setViewportSize({ width: 750, height: 340 });
      await panel.evaluate((d) => d.getAnimations().forEach((a) => a.finish()));
      const box = await panel.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(341);
      await expect(panel.getByRole('button', { name: 'Schließen', exact: true })).toBeInViewport();
      await clean(page);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await opener.click();
    await panel
      .getByRole('link', { name: /Zuordnung bearbeiten/ })
      .first()
      .click();
    const instrument = page.getByRole('dialog', { name: 'Instrument bearbeiten', exact: true });
    await expect(instrument).toBeVisible();
    await expect(instrument.getByLabel('Anlageklasse', { exact: true })).toBeVisible();
    expect(await instrument.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await clean(page);
    await instrument.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(opener).toBeFocused();
  },
);

test('U02-U12: create, German field errors, duplicate, rename, reorder, safe/blocked archive, restore and future target/band/tiers', async ({
  page,
}, info) => {
  const name = `Klasse ${info.project.name}`;
  const renamed = `Reserve ${info.project.name}`;
  await page.goto('/einstellungen/anlageklassen');
  await page.getByRole('link', { name: 'Anlageklasse anlegen', exact: true }).click();
  let panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Anlageklasse anlegen', exact: true }).click();
  await expect(panel.getByLabel('Name der Anlageklasse')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.getByRole('alert')).toContainText('Namen');
  await panel.getByLabel('Name der Anlageklasse').fill(name);
  await page.goBack();
  await expect(panel).toContainText('Ungespeicherte Änderungen');
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await panel.getByRole('button', { name: 'Anlageklasse anlegen', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.asset-class-table')).toContainText(name);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(
    page.locator('.asset-class-table').getByRole('row', { name: new RegExp(name) }),
  ).toContainText('Archiviert');
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await page.getByRole('link', { name: 'Anlageklasse anlegen', exact: true }).click();
  panel = page.getByRole('dialog');
  await panel.getByLabel('Name der Anlageklasse').fill(name.toLowerCase());
  await panel.getByRole('button', { name: 'Anlageklasse anlegen', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('bereits vorhanden');
  await panel.getByRole('button', { name: 'Schließen', exact: true }).click();
  await panel.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await page.locator('.asset-class-table').getByRole('link', { name, exact: true }).click();
  await panel.getByLabel('Name der Anlageklasse').fill(renamed);
  await panel.getByLabel('Sortierposition').fill('0');
  await panel.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(page.locator('.asset-class-table')).toContainText(renamed);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/einstellungen\/anlageklassen$/);
  await page
    .locator('.asset-class-table')
    .getByRole('link', { name: renamed, exact: true })
    .click();
  await panel.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page).toHaveURL(/\/einstellungen\/anlageklassen$/);
  await page
    .locator('.asset-class-table')
    .getByRole('link', { name: renamed, exact: true })
    .click();
  await panel.getByRole('button', { name: 'Wieder aktivieren', exact: true }).click();
  // The save closes its own panel; wait for that so it cannot close the next one.
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Sollquoten bearbeiten', exact: true }).click();
  panel = page.getByRole('dialog', { name: 'Sollquoten bearbeiten' });
  const classes = (await (await page.request.get('/api/asset-classes')).json()).assetClasses as {
    id: string;
    name: string;
  }[];
  for (const cls of classes.filter((c) => !('isGroup' in c) || !c.isGroup))
    await panel
      .getByLabel(`Im Sollmodell berücksichtigen · ${cls.name}`, { exact: true })
      .setChecked(cls.name === renamed);
  await panel.getByLabel(`${renamed} · Soll (%)`).fill('99,99');
  await panel.getByRole('button', { name: 'Sollquoten speichern', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('99,99 %');
  await panel.getByLabel(`${renamed} · Soll (%)`).fill('ungültig');
  await panel.getByRole('button', { name: 'Sollquoten speichern', exact: true }).click();
  await expect(panel.getByLabel(`${renamed} · Soll (%)`)).toHaveAttribute('aria-invalid', 'true');
  await panel.getByLabel(`${renamed} · Soll (%)`).fill('100');
  await panel.getByLabel(`${renamed} · Band`, { exact: true }).selectOption('custom');
  await panel.getByLabel(`${renamed} · Band ± (Prozentpunkte)`).fill('3');
  const date = `2055-0${info.project.name === 'desktop' ? 1 : info.project.name === 'mobile' ? 2 : 3}-01`;
  await panel.getByLabel('Gültig ab').fill(date);
  await panel.getByLabel('Bezeichnung (optional)').fill('Synthetische Strategie');
  await panel.getByLabel('Dynamische Stufen nach Anlagesumme').check();
  await panel.getByLabel('Stufengrenze (€)').fill('12000');
  await clean(page);
  await panel.getByRole('button', { name: 'Sollquoten speichern', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const version = (
    await (await page.request.get('/api/asset-classes/targets')).json()
  ).versions.find((v: { validFrom: string }) => v.validFrom === date);
  expect(version.tiers.map((t: { upToCents: number | null }) => t.upToCents)).toEqual([
    1200000,
    2000000,
    5000000,
    null,
  ]);
  expect(version.targets[0]).toMatchObject({
    targetShareBp: 10000,
    bandBp: 300,
    bandMode: 'custom',
  });
  await page
    .locator('.asset-class-table')
    .getByRole('link', { name: renamed, exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('zukünftige Sollquote');
});
