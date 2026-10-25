import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

type PointerProof = { pointerType: string; isTrusted: boolean };

test.use({ ledgerToday: '2026-10-02' });
for (const profile of [
  {
    name: 'desktop1440',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
  {
    name: 'phone390',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  },
]) {
  test.describe(`WP-001 public walkthrough ${profile.name}`, () => {
    test.use({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      deviceScaleFactor: profile.deviceScaleFactor,
    });
    test('drills into the envelope, preserves privacy, refuses an incomplete split and undoes both transfer legs', async ({
      page,
      request,
      baseURL,
    }, info) => {
      test.setTimeout(90_000);
      const post = async <T>(path: string, data: unknown) => {
        const response = await request.post(`/api${path}`, { data, headers: { origin: baseURL! } });
        expect(response.status(), path).toBe(201);
        return (await response.json()) as T;
      };
      const a = (
        await post<{ account: { id: string } }>('/accounts', {
          name: 'Synthetic509 A',
          type: 'checking',
          openingDate: '2026-08-01',
          openingBalanceCents: 100_000,
        })
      ).account;
      const b = (
        await post<{ account: { id: string } }>('/accounts', {
          name: 'Synthetic509 B',
          type: 'savings',
          openingDate: '2026-08-01',
          openingBalanceCents: 25_000,
        })
      ).account;
      const { group } = await post<{ group: { id: string } }>('/categories/groups', {
        name: 'Synthetic509 budget',
      });
      const ids: string[] = [];
      for (const name of ['Synthetic509 Food', 'Synthetic509 Other'])
        ids.push(
          (
            await post<{ category: { id: string } }>('/categories', {
              name,
              groupId: group.id,
              class: 'need',
            })
          ).category.id,
        );
      const assignment = await request.put('/api/budget/2026-09/assigned', {
        data: { items: [{ categoryId: ids[0], assignedCents: 10_000 }] },
        headers: { origin: baseURL! },
      });
      expect(assignment.status()).toBe(200);
      const expense = await post<{ id: string }>('/bookings', {
        type: 'booking',
        accountId: a.id,
        date: '2026-09-15',
        amountCents: -2_500,
        status: 'confirmed',
        payeeName: 'Synthetic509 initial expense',
        categoryId: ids[0],
      });

      await page.goto('/plan/monat?monat=2026-09');
      await page.locator(`[data-category-id="${ids[0]}"]`).click();
      const history = page.getByRole('link', { name: 'Verlauf und Buchungen', exact: true });
      await history.scrollIntoViewIfNeeded();
      await history.click();
      await expect(page).toHaveURL(new RegExp(`/plan/monat/envelope/${ids[0]}\\?monat=2026-09$`));
      await expect(page.getByRole('main')).toContainText('75,00');
      await page.keyboard.press('Control+Shift+H');
      await expect(page.getByRole('main')).toContainText('•••');
      await expect(page.getByRole('main')).not.toContainText('75,00');
      await page.keyboard.press('Control+Shift+H');
      await expect(page.getByRole('main')).toContainText('75,00');
      await page.goto(`/konten/${a.id}`);
      await expect(page.getByTestId('account-balance')).toHaveText('975,00 €');

      await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
      let panel = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
      await panel.getByLabel('Betrag', { exact: true }).fill('10');
      await panel.getByLabel('Empfänger').fill('Synthetic509 split guard');
      await panel.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
      await panel.getByLabel('Kategorie 1', { exact: true }).fill('Synthetic509 Food');
      await panel.getByRole('option', { name: /^Synthetic509 Food/ }).click();
      await panel.getByLabel('Betrag 1', { exact: true }).fill('6');
      await panel.getByLabel('Kategorie 2', { exact: true }).fill('Synthetic509 Other');
      await panel.getByRole('option', { name: /^Synthetic509 Other/ }).click();
      await panel.getByLabel('Betrag 2', { exact: true }).fill('3');
      await expect(panel.getByText('Rest: 1,00 €', { exact: false })).toBeVisible();
      await expect(panel.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
      const beforeSave = await request.get(`/api/bookings?accountId=${a.id}`);
      expect(beforeSave.status()).toBe(200);
      expect((await beforeSave.json()).total).toBe(1);
      await panel.getByLabel('Betrag 2', { exact: true }).fill('4');
      await expect(panel.getByText('Rest: 0,00 €', { exact: false })).toBeVisible();
      await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
      await expect(panel).toBeHidden();
      await expect(page.getByTestId('account-balance')).toHaveText('965,00 €');
      const splitUndo = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/undo' &&
          response.request().method() === 'POST',
      );
      await page
        .locator('.toast.is-open')
        .getByRole('button', { name: 'Rückgängig', exact: true })
        .click();
      expect((await splitUndo).status()).toBe(200);
      await expect(page.getByTestId('account-balance')).toHaveText('975,00 €');

      await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
      panel = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
      await panel.getByRole('button', { name: 'Umbuchung', exact: true }).click();
      await panel
        .getByLabel('Nach Konto', { exact: true })
        .selectOption({ label: 'Synthetic509 B' });
      await panel.getByLabel('Betrag', { exact: true }).fill('200');
      const save = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/bookings' &&
          response.request().method() === 'POST',
      );
      await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
      const saved = await save;
      expect(saved.status()).toBe(201);
      const transfer = (await saved.json()) as {
        groupId: string;
        bookings: { id: string; amountCents: number }[];
      };
      expect(transfer.bookings.map((row) => row.amountCents).sort((x, y) => x - y)).toEqual([
        -20_000, 20_000,
      ]);
      await expect(panel).toBeHidden();
      await expect(page.getByTestId('account-balance')).toHaveText('775,00 €');
      const balanceOf = async (id: string) => {
        const response = await request.get(`/api/accounts/${id}`);
        expect(response.status()).toBe(200);
        return (await response.json()).account.balanceCents as number;
      };
      expect(await balanceOf(b.id)).toBe(45_000);
      const undo = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/undo' &&
          response.request().method() === 'POST',
      );
      await page
        .locator('.toast.is-open')
        .getByRole('button', { name: 'Rückgängig', exact: true })
        .click();
      expect((await undo).status()).toBe(200);
      await expect(page.getByTestId('account-balance')).toHaveText('975,00 €');
      expect(await balanceOf(a.id)).toBe(97_500);
      expect(await balanceOf(b.id)).toBe(25_000);
      for (const leg of transfer.bookings)
        expect((await request.get(`/api/bookings/${leg.id}`)).status()).toBe(404);
      const original = await request.get(`/api/bookings/${expense.id}`);
      expect(original.status()).toBe(200);
      expect((await original.json()).booking).toMatchObject({
        amountCents: -2_500,
        status: 'confirmed',
        accountId: a.id,
      });
      const runtime = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        touchPoints: navigator.maxTouchPoints,
        finePointer: matchMedia('(pointer: fine)').matches,
        pixelRatio: devicePixelRatio,
      }));
      expect(page.viewportSize()).toEqual(profile.viewport);
      expect(runtime).toMatchObject({
        width: profile.viewport.width,
        height: profile.viewport.height,
        finePointer: !profile.hasTouch,
        pixelRatio: profile.deviceScaleFactor,
      });
      let nativeTouch: PointerProof | null = null;
      if (profile.hasTouch) {
        await page.exposeFunction('observePublic509Pointer', (proof: PointerProof) => {
          nativeTouch = proof;
        });
        await page.evaluate(() => {
          document.addEventListener(
            'pointerdown',
            (event) => {
              void (
                window as unknown as {
                  observePublic509Pointer: (proof: PointerProof) => Promise<void>;
                }
              ).observePublic509Pointer({
                pointerType: event.pointerType,
                isTrusted: event.isTrusted,
              });
            },
            { once: true, capture: true },
          );
        });
        await page.getByRole('heading', { name: 'Synthetic509 A', exact: true }).tap();
        await expect.poll(() => nativeTouch).toEqual({ pointerType: 'touch', isTrusted: true });
      } else expect(runtime.touchPoints).toBe(0);
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        await expect(page.locator(`[data-booking="${expense.id}"]`)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          profile.viewport.width,
        );
        await page.locator(`[data-booking="${expense.id}"]`).scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(`public-509-${profile.name}-${theme}.png`),
          fullPage: false,
        });
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      }
      const proofPath = info.outputPath('public-509-walkthrough.json');
      await writeFile(
        proofPath,
        JSON.stringify({
          profile: profile.name,
          actualBrowser: page.context().browser()!.browserType().name(),
          viewport: page.viewportSize(),
          runtime,
          nativeTouch,
          splitBlockedBeforeExactSum: true,
          groupUndoRestoredBothLegs: true,
          accountACents: 97_500,
          accountBCents: 25_000,
        }),
      );
      await info.attach('public-509-walkthrough.json', {
        path: proofPath,
        contentType: 'application/json',
      });
    });
  });
}
