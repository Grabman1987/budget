import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { accounts, categories, createEntity, openDatabase, schema, setAssigned } from '@budget/db';
import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });
async function hit(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      right: r.right,
      viewport: innerWidth,
      center: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
    };
  });
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.viewport);
  expect(box.center).toBe(true);
}
async function dismissToast(page: Page) {
  const action = page.locator('.toast.is-open').getByRole('button').first();
  if (await action.isVisible()) {
    await action.focus();
    await action.press('Escape');
  }
}
for (const profile of ['desktop', 'phone'] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`604 start, missing funding, retained history and manual Undo ${profile} ${theme}`, async ({
      browser,
      isolatedLedger,
    }, info) => {
      const opened = openDatabase(isolatedLedger.databasePath);
      const accountId = randomUUID(),
        groupId = randomUUID(),
        categoryId = randomUUID();
      const ctx = { actor: 'synthetic-native-goal-604' };
      accounts.create(
        opened.db,
        {
          id: accountId,
          name: 'Synthetic goal budget',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-05-01',
          openingBalanceCents: 500000,
        },
        ctx,
      );
      createEntity(
        opened.db,
        schema.categoryGroup,
        { id: groupId, name: 'Synthetic savings' },
        ctx,
      );
      categories.create(
        opened.db,
        { id: categoryId, groupId, name: 'Synthetic goal category', class: 'future' },
        ctx,
      );
      setAssigned(opened.db, categoryId, '2026-10', 15000, ctx);
      const context = await browser.newContext({
        baseURL: isolatedLedger.origin,
        storageState: isolatedLedger.storageState,
        viewport:
          profile === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
        isMobile: profile === 'phone',
        hasTouch: profile === 'phone',
        colorScheme: theme,
      });
      try {
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+02:00'));
        await page.goto('/plan/sparziele?monat=2026-10');
        // Use the actual theme controls when the stored preference key differs.
        if (
          (await page.evaluate(
            () =>
              document.documentElement.dataset['theme'] ??
              (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
          )) !== theme
        ) {
          if (profile === 'phone') {
            const menu = page.locator('.m-profile > summary');
            await menu.click();
            await page
              .locator('.m-profile')
              .getByRole('button', {
                name: theme === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
                exact: true,
              })
              .click();
            await menu.click();
          } else
            await page
              .locator('.sidebar-foot')
              .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
              .click();
        }
        await page.getByRole('button', { name: 'Neues Sparziel', exact: true }).click();
        const editor = page.getByRole('dialog', { name: 'Neues Sparziel', exact: true });
        await editor.getByLabel('Name', { exact: true }).fill('Synthetic native goal');
        await editor.getByLabel('Ziel', { exact: true }).fill('1200,00');
        await editor.getByLabel('Zielbeginn', { exact: true }).fill('2026-11');
        await editor.getByLabel('Zieldatum', { exact: true }).fill('2026-12-31');
        await editor.getByLabel('Kategorie', { exact: true }).selectOption(categoryId);
        const createdReady = page.waitForResponse(
          (response) =>
            response.url().includes('/api/goals?') && response.request().method() === 'POST',
        );
        await editor.getByRole('button', { name: 'Anlegen', exact: true }).click();
        const createdResponse = await createdReady;
        expect(createdResponse.status()).toBe(201);
        const created = await createdResponse.json();
        expect(created.goal).toMatchObject({
          effectiveStartMonth: '2026-11',
          funding: { monthlyCents: 0, remainingCents: 0 },
        });
        const id = created.goal.id;
        await expect(editor).toBeHidden();
        await dismissToast(page);
        await page.getByRole('link', { name: 'Synthetic native goal', exact: true }).click();
        await page.getByRole('button', { name: 'Sparziel bearbeiten', exact: true }).click();
        const edit = page.getByRole('dialog', { name: 'Synthetic native goal', exact: true });
        await expect(edit.getByLabel('Zielbeginn', { exact: true })).toHaveValue('2026-11');
        await edit.getByLabel('Zielbeginn', { exact: true }).fill('2026-10');
        await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
        await expect(edit).toBeHidden();
        await dismissToast(page);
        const current = async () => {
          const response = await page.request.get('/api/goals?month=2026-10');
          expect(response.status()).toBe(200);
          return (await response.json()).goals.find((goal: { id: string }) => goal.id === id);
        };
        expect(await current()).toMatchObject({
          effectiveStartMonth: '2026-10',
          savedCents: 15000,
          funding: { monthlyCents: 40000, remainingCents: 25000 },
        });
        await expect(page.getByTestId('goal-soll-chart')).toBeVisible();
        const fund = page.getByRole('button', { name: 'Rate zuweisen', exact: true });
        await hit(fund);
        await fund.click();
        const undo = page
          .locator('.toast.is-open')
          .getByRole('button', { name: 'Rückgängig', exact: true });
        await undo.focus();
        await expect.poll(async () => (await current()).savedCents).toBe(40000);
        await hit(undo);
        await undo.click();
        await expect.poll(async () => (await current()).savedCents).toBe(15000);
        await dismissToast(page);
        const complete = page.getByRole('button', { name: 'Manuell abschließen', exact: true });
        await hit(complete);
        await complete.click();
        await undo.focus();
        await expect.poll(async () => (await current()).lifecycle.state).toBe('completed');
        expect(opened.sqlite.prepare('SELECT id FROM booking').all()).toEqual([]);
        expect(
          opened.sqlite.prepare('SELECT id FROM savings_goal WHERE deleted_at IS NULL').all(),
        ).toHaveLength(1);
        await expect(page.getByTestId('goal-soll-chart')).toBeVisible();
        expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: info.outputPath(`goal-completed-${profile}-${theme}.png`),
          animations: 'disabled',
        });
        await hit(undo);
        await undo.click();
        await expect.poll(async () => (await current()).lifecycle.state).toBe('open');
        await page.reload();
        await expect(page.getByTestId('goal-soll-chart')).toBeVisible();
        expect(await current()).toMatchObject({ savedCents: 15000, lifecycle: { state: 'open' } });
        expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
      } finally {
        await context.close();
        opened.close();
      }
    });
