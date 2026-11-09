import type { Locator, Page } from '@playwright/test';
import { expect, sampleTest as test } from './sample';

const REDESIGN = process.env['A2_EXPECT_REDESIGN'] === '1';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  if (!value) throw new Error('element has no box');
  return value;
}

/** The pill must sit inside the selected segment's box (sub-pixel tolerance for WebKit). */
async function expectPillUnderSelected(group: Locator) {
  const thumb = group.locator('.seg-thumb');
  await expect(thumb).toHaveCount(1);
  const pill = await box(thumb);
  const selected = await box(group.locator('button[aria-pressed="true"]'));
  const tolerance = 1;
  expect(pill.x).toBeGreaterThanOrEqual(selected.x - tolerance);
  expect(pill.y).toBeGreaterThanOrEqual(selected.y - tolerance);
  expect(pill.x + pill.width).toBeLessThanOrEqual(selected.x + selected.width + tolerance);
  expect(pill.y + pill.height).toBeLessThanOrEqual(selected.y + selected.height + tolerance);
  // Not merely contained: it must also fill the segment (no tiny or collapsed pill).
  expect(pill.width).toBeGreaterThan(selected.width - 6);
}

async function expectLabelsUnclipped(group: Locator) {
  for (const button of await group.getByRole('button').all()) {
    const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
    const b = await box(button);
    const g = await box(group);
    expect(b.x).toBeGreaterThanOrEqual(g.x - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(g.x + g.width + 1);
  }
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

test.skip(!REDESIGN, 'segmented pill and title-row actions are redesign-only');

test.describe('Heute Zeitraum toggle at 390', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`pill sits under the selected label in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
      await page.goto('/?monat=2026-09&period=month');
      await settle(page);
      const group = page.getByRole('group', { name: 'Zeitraum' }).first();
      await expect(group).toBeVisible();
      await expectLabelsUnclipped(group);
      await expectPillUnderSelected(group);
      await group.getByRole('button', { name: 'Bis Gehalt', exact: true }).click();
      await expect(group.getByRole('button', { name: 'Bis Gehalt', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expectPillUnderSelected(group);
      await expectLabelsUnclipped(group);
      await expect(group).toHaveCSS('border-top-width', '1px');
    });
  }
});

test.describe('capture sheet header at 390', () => {
  test('kind pill, title-row actions and no empty menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?panel=buchung');
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await expect(dialog.locator('.bkform-redesign')).toBeVisible();
    await settle(page);
    const kinds = dialog.getByRole('group', { name: 'Art der Buchung' });
    await expectPillUnderSelected(kinds);
    for (const name of ['Einnahme', 'Umbuchung', 'Ausgabe']) {
      await kinds.getByRole('button', { name, exact: true }).click();
      await expect(kinds.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // Let the slide finish; reduced motion is on for sample tests, so this is immediate.
      await expectPillUnderSelected(kinds);
    }
    // Survives a resize and a re-layout.
    await page.setViewportSize({ width: 360, height: 800 });
    await expectPillUnderSelected(kinds);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectPillUnderSelected(kinds);

    const header = dialog.locator('.bk-editor-titlebar');
    await expect(header.getByRole('button', { name: '…' })).toHaveCount(0);
    const title = await box(header.getByRole('heading'));
    const attach = await box(header.getByRole('button', { name: 'Datei anhängen', exact: true }));
    const camera = await box(header.getByRole('button', { name: 'Foto aufnehmen', exact: true }));
    const close = await box(header.getByRole('button', { name: 'Schließen', exact: true }));
    const head = await box(header);
    for (const b of [attach, camera, close]) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.y).toBeGreaterThanOrEqual(head.y - 1);
      expect(b.y + b.height).toBeLessThanOrEqual(head.y + 48 + 1);
    }
    expect(title.x + title.width).toBeLessThanOrEqual(attach.x + 1);
    expect(attach.x + attach.width).toBeLessThanOrEqual(camera.x + 1);
    expect(camera.x + camera.width).toBeLessThanOrEqual(close.x + 1);
    // No separate icon row: the kind switch starts directly below the title row.
    const kindBox = await box(kinds);
    expect(kindBox.y).toBeLessThan(head.y + head.height + 40);
  });
});
