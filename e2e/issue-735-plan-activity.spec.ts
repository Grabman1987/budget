import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { STORAGE_STATE_SAMPLE } from '../playwright.config';
import { sampleTest, SAMPLE_NOW, SAMPLE_URL } from './sample';
import { test } from './isolated-ledger';

for (const profile of ['desktop', 'phone'] as const)
  for (const theme of ['light', 'dark'] as const) {
    sampleTest(
      `735 exact activity and compact inspector ${profile} ${theme}`,
      async ({ browser }, info) => {
        const phone = profile === 'phone';
        const context = await browser.newContext({
          baseURL: SAMPLE_URL,
          storageState: STORAGE_STATE_SAMPLE,
          viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
          deviceScaleFactor: phone ? 3 : 1,
          isMobile: phone,
          hasTouch: phone,
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage();
          await page.clock.setFixedTime(new Date(SAMPLE_NOW));
          const writes: string[] = [];
          page.on('request', (request) => {
            if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
              writes.push(request.method());
          });
          await page.goto('/plan/monat?monat=2026-09');
          await page.evaluate((value) => {
            document.documentElement.dataset['theme'] = value;
          }, theme);
          await page.locator('.pname[data-category-id="cat-miete"]').click();
          const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
          await expect(
            inspector.getByRole('heading', { name: 'Miete', exact: true }),
          ).toBeVisible();
          const assigned = inspector.getByLabel('Zugewiesen', { exact: true });
          await expect(assigned).toBeVisible();
          const move = inspector.locator('.inspector-move');
          await expect(move).not.toHaveAttribute('open');
          await expect(inspector.getByLabel('Betrag', { exact: true })).not.toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          const geometry = await inspector.evaluate((node) => {
            const content = node.querySelector<HTMLElement>('.inspector-selection')!;
            return {
              viewport: {
                width: innerWidth,
                height: innerHeight,
                dpr: devicePixelRatio,
                coarse: matchMedia('(pointer: coarse)').matches,
              },
              contentHeight: content.getBoundingClientRect().height,
              scrollHeight: content.scrollHeight,
            };
          });
          expect(geometry.viewport).toEqual({
            width: phone ? 390 : 1440,
            height: phone ? 844 : 900,
            dpr: phone ? 3 : 1,
            coarse: phone,
          });
          if (!phone) expect(geometry.contentHeight).toBeLessThan(1139.703125); // Same original synthetic baseline, captured before UI edits.
          await writeFile(
            info.outputPath('inspector-geometry.json'),
            JSON.stringify(geometry, null, 2),
          );
          await page.screenshot({
            path: info.outputPath(`inspector-${profile}-${theme}.png`),
            fullPage: true,
          });
          await inspector.screenshot({
            path: info.outputPath(`inspector-panel-${profile}-${theme}.png`),
          });
          // Closing the disclosure must retain mounted inputs and an unsaved assignment.
          await assigned.fill('891,23');
          await move.locator('summary').click();
          await inspector.getByLabel('Betrag', { exact: true }).fill('1,23');
          await move.locator('summary').click();
          await move.locator('summary').click();
          await expect(inspector.getByLabel('Betrag', { exact: true })).toHaveValue('1,23');
          await expect(assigned).toHaveValue('891,23');
          await assigned.fill('890,00');
          if (!phone) {
            await page.getByRole('checkbox', { name: 'Strom auswählen', exact: true }).check();
            await page.getByRole('button', { name: 'Gruppe Abos', exact: true }).click();
            await expect(
              page.getByRole('checkbox', { name: 'Miete auswählen', exact: true }),
            ).toBeChecked();
            await expect(
              page.getByRole('checkbox', { name: 'Strom auswählen', exact: true }),
            ).toBeChecked();
          }
          const activity = phone
            ? inspector.locator('.activity-link')
            : page
                .locator('.prow', { has: page.locator('.pname[data-category-id="cat-miete"]') })
                .locator('.activity-link');
          const bounds = (await activity.boundingBox())!;
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(phone ? 44 : 24);
          await activity.focus();
          await page.keyboard.press('Enter');
          await expect(page).toHaveURL(/\/plan\/monat\/envelope\/cat-miete\?monat=2026-09$/);
          await expect(page.getByRole('heading', { name: 'Aktivität im Detail' })).toBeVisible();
          const firstContribution = page.locator('.activity-terms .activity-term').first();
          await expect(firstContribution).toBeVisible();
          await expect(firstContribution).toBeInViewport({ ratio: 1 });
          const initialBounds = await firstContribution.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const nav = document.querySelector<HTMLElement>('.tabbar');
            const navBox = nav?.getBoundingClientRect();
            const usableBottom =
              nav && nav.checkVisibility() && navBox && navBox.height > 0
                ? Math.min(innerHeight, navBox.top)
                : innerHeight;
            return {
              top: box.top,
              bottom: box.bottom,
              usableBottom,
              viewportHeight: innerHeight,
              scrollY,
            };
          });
          await writeFile(
            info.outputPath('activity-initial-viewport.json'),
            JSON.stringify(initialBounds, null, 2),
          );
          expect(initialBounds.top).toBeGreaterThanOrEqual(0);
          expect(initialBounds.bottom).toBeLessThanOrEqual(initialBounds.usableBottom);
          const response = await page.request.get('/api/budget/2026-09/activity/cat-miete');
          expect(response.ok()).toBe(true);
          const body = await response.json();
          expect(body.activityBreakdown.totalCents).toBe(-89_000);
          expect(body.activityBreakdown.items[0]).toMatchObject({
            date: '2026-09-01',
            source: { payeeName: 'Hausverwaltung', accountName: 'Girokonto' },
          });
          await expect(
            page.getByRole('button', { name: /Ursprungsbuchung öffnen · Hausverwaltung/ }),
          ).toBeVisible();
          await expect(firstContribution).toContainText('01.09.2026');
          await expect(firstContribution).toContainText('Girokonto');
          expect(
            body.activityBreakdown.items.reduce(
              (sum: number, item: { contributionCents: number }) => sum + item.contributionCents,
              0,
            ),
          ).toBe(-89_000);
          await expect(page.locator('.activity-terms .activity-term')).toHaveCount(
            body.activityBreakdown.count,
          );
          await page.screenshot({
            path: info.outputPath(`activity-${profile}-${theme}.png`),
            fullPage: true,
          });
          await page.keyboard.press('Control+Shift+H');
          await expect(page.locator('.activity-terms')).not.toContainText('890,00');
          await expect(page.locator('.activity-terms')).toContainText('•••');
          await page.keyboard.press('Control+Shift+H');
          await expect(page.locator('.activity-terms')).toContainText('890,00');
          const axe = await new AxeBuilder({ page }).include('.plan-detail').analyze();
          expect(axe.violations).toEqual([]);
          await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
          await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09$/);
          await expect(
            page.getByRole('complementary', { name: 'Plan-Inspektor' }).getByRole('heading', {
              name: phone ? 'Miete' : '2 Kategorien ausgewählt',
              exact: true,
            }),
          ).toBeVisible();
          if (!phone) {
            await expect(
              page.getByRole('checkbox', { name: 'Miete auswählen', exact: true }),
            ).toBeChecked();
            await expect(
              page.getByRole('checkbox', { name: 'Strom auswählen', exact: true }),
            ).toBeChecked();
            await expect(
              page.getByRole('button', { name: 'Gruppe Abos', exact: true }),
            ).toHaveAttribute('aria-expanded', 'false');
          }
          expect(writes).toEqual([]);
        } finally {
          await context.close();
        }
      },
    );
  }

test('735 future origin opens through the real booking GET without saving', async ({
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
    reducedMotion: 'reduce',
  });
  try {
    const send = async (path: string, data: unknown) => {
      const response = await context.request.post(`/api${path}`, {
        data,
        headers: { origin: isolatedLedger.origin },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return response.json();
    };
    const { account } = await send('/accounts', {
      name: 'Synthetic activity account',
      type: 'checking',
      openingDate: '2026-10-01',
      openingBalanceCents: 100_000,
    });
    const { group } = await send('/categories/groups', { name: 'Synthetic activity' });
    const { category } = await send('/categories', {
      name: 'Synthetic future',
      groupId: group.id,
      class: 'need',
      kind: 'variable',
    });
    const created = await send('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-31',
      amountCents: -1_234,
      memo: 'Synthetic future origin',
      splits: [{ categoryId: category.id, amountCents: -1_234 }],
    });
    const id = created.bookings[0].id;
    const page = await context.newPage();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/'))
        writes.push(request.method());
    });
    await page.goto(`/plan/monat/envelope/${category.id}?monat=2026-10`);
    await page.getByRole('button', { name: /Ursprungsbuchung öffnen/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Datum', { exact: true })).toHaveValue('31.10.2026');
    await expect(page.getByLabel('Datum im Kalender', { exact: true })).toHaveValue('2026-10-31');
    await expect(page.getByLabel('Notiz', { exact: true })).toHaveValue('Synthetic future origin');
    await page.screenshot({ path: info.outputPath('future-origin.png'), fullPage: true });
    const response = await context.request.get(`/api/bookings/${id}`);
    expect(response.ok()).toBe(true);
    expect((await response.json()).booking.amountCents).toBe(-1_234);
    expect(writes).toEqual([]);
  } finally {
    await context.close();
  }
});

sampleTest(
  '735 activity uses the clicked month in a multi-month table and restores the source view',
  async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: SAMPLE_URL,
      storageState: STORAGE_STATE_SAMPLE,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(SAMPLE_NOW));
      await page.goto('/plan/monat?monat=2026-08');
      await page.locator('.plan-menu-optionen summary').click();
      await page.getByRole('button', { name: '2 Monate', exact: true }).click();
      const row = page.locator('.ptable-multi tbody .prow', {
        has: page.locator('.pname[data-category-id="cat-miete"]'),
      });
      const september = row.locator('.activity-link').nth(1);
      await expect(september).toHaveAttribute('href', /monat=2026-09/);
      await september.click();
      await expect(page).toHaveURL(/envelope\/cat-miete\?monat=2026-09$/);
      await expect(
        page.getByRole('heading', { name: 'Miete · September 2026', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
      await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-08$/);
      await expect(row.locator('.activity-link')).toHaveCount(2);
    } finally {
      await context.close();
    }
  },
);
