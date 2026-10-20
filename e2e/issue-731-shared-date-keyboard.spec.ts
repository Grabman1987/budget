import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });

test('731 phone shared date accepts sequential dots without submitting a target version', async ({
  browser,
  isolatedLedger,
}, info) => {
  const context = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
  });
  const page = await context.newPage();
  try {
    await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+02:00'));
    const before = await context.request.get('/api/asset-classes/targets');
    expect(before.status()).toBe(200);
    const versions = await before.json();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname.startsWith('/api/') &&
        !['GET', 'HEAD'].includes(request.method())
      )
        writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.goto('/einstellungen/anlageklassen?panel=sollquoten');
    const dialog = page.getByRole('dialog', { name: 'Sollquoten bearbeiten' });
    const date = dialog.getByLabel('Gültig ab');
    await expect(date).toHaveValue('20.10.2026');
    await expect(date).toHaveAttribute('type', 'text');
    await expect(date).toHaveAttribute('inputmode', 'text');
    await date.scrollIntoViewIfNeeded();
    const box = await date.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await date.fill('');
    await date.pressSequentially('12.0');
    await expect(date).toHaveValue('12.0');
    expect(await date.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await date.pressSequentially('3.2026');
    await expect(date).toHaveValue('12.03.2026');
    expect(await date.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
    await date.press('Tab');
    await expect(date).not.toBeFocused();
    await expect(date).toHaveValue('12.03.2026');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      })),
    ).toEqual({ width: 390, height: 844, dpr: 3 });
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const after = await context.request.get('/api/asset-classes/targets');
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(versions);
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath('shared-date-phone.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
