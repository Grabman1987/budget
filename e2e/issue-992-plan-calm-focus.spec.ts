import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { eq } from 'drizzle-orm';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });

for (const theme of ['light', 'dark'] as const) {
  for (const area of ['plan', 'attention', 'scroll', 'bookings', 'account'] as const) {
    test(`calm ${area} keeps its figures and actions (${theme})`, async ({
      page,
      request,
      baseURL,
      isolatedLedger,
    }, info) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
      const send = async (path: string, data: unknown, method = 'POST') => {
        const response = await request.fetch(`/api${path}`, {
          method,
          data,
          headers: { origin: baseURL! },
        });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
      };
      const { account } = await send('/accounts', {
        name: 'Synthetic focus account',
        type: 'checking',
        openingDate: '2026-10-01',
        openingBalanceCents: 100000,
      });
      const { group } = await send('/categories/groups', { name: 'Synthetic focus group' });
      const { group: quietGroup } = await send('/categories/groups', {
        name: 'Synthetic quiet group',
      });
      const ids: string[] = [];
      for (let index = 0; index < (area === 'bookings' || area === 'account' ? 4 : 18); index++) {
        const { category } = await send('/categories', {
          name: `Synthetic category ${String(index).padStart(2, '0')}`,
          groupId: index < 4 ? group.id : quietGroup.id,
          class: 'need',
          kind: 'variable',
          stage: 2,
        });
        ids.push(category.id);
        if (index < 3)
          await send(
            `/categories/${category.id}/target`,
            {
              validFrom: '2026-10',
              target: { kind: 'monthly', amountCents: 1000 },
            },
            'PUT',
          );
      }
      await send(
        '/budget/2026-10/assigned',
        {
          items: [
            { categoryId: ids[0], assignedCents: 1000 },
            { categoryId: ids[1], assignedCents: 1500 },
            { categoryId: ids[2], assignedCents: 500 },
          ],
        },
        'PUT',
      );
      const booking = (memo: string, categoryId?: string) =>
        send('/bookings', {
          type: 'booking',
          accountId: account.id,
          date: '2026-10-10',
          amountCents: -100,
          status: 'confirmed',
          memo,
          ...(categoryId ? { categoryId } : {}),
        });
      const checked = await booking('Synthetic checked purchase', ids[0]);
      const confirmed = await booking('Synthetic confirmed purchase', ids[1]);
      await booking('Synthetic overspent purchase', ids[3]);
      const missing = await booking('Synthetic missing category');
      const incomplete =
        area === 'bookings' || area === 'account'
          ? await send('/bookings', {
              type: 'booking',
              accountId: account.id,
              date: '2026-10-10',
              amountCents: -100,
              status: 'confirmed',
              memo: 'Synthetic incomplete split',
              splits: [
                { categoryId: ids[0], amountCents: -50 },
                { categoryId: null, amountCents: -50 },
              ],
            })
          : null;
      // Fixture-only status setup in this test's disposable ledger; no production writer changes.
      const database = openDatabase(isolatedLedger.databasePath);
      try {
        database.db
          .update(schema.booking)
          .set({ status: 'reconciled' })
          .where(eq(schema.booking.id, checked.id))
          .run();
      } finally {
        database.close();
      }
      const before = await (await request.get('/api/budget/2026-10')).json();
      const accountsBefore = await (await request.get('/api/accounts')).json();
      const writes: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/') && request.method() !== 'GET')
          writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      if (area !== 'bookings' && area !== 'account') {
        await page.goto('/plan/monat?monat=2026-10');
        await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
        await expect(page.getByTestId('to-be-assigned')).toHaveText('969,00 €');
        const row = (index: number) =>
          page.locator(`.prow:has([data-category-id="${ids[index]}"])`);
        if (area === 'plan') {
          await expect(page.locator('.prow:has(.pname)')).toHaveCount(18);
          const styles = await page.locator('.prow:has(.pname)').evaluateAll((rows) =>
            rows.map((row) => {
              const bar = row.querySelector('.spending-bar')!;
              const probe = document.createElement('span');
              probe.style.backgroundColor = 'var(--rule)';
              bar.append(probe);
              const neutral =
                getComputedStyle(bar).backgroundColor === getComputedStyle(probe).backgroundColor;
              probe.remove();
              return {
                id: row.querySelector('.pname')!.getAttribute('data-category-id'),
                fill: getComputedStyle(bar.querySelector('.pbar-fill')!).display,
                neutral,
              };
            }),
          );
          for (const index of [0, 1, 4])
            expect(styles.find((row) => row.id === ids[index])).toMatchObject({
              fill: 'none',
              neutral: true,
            });
          for (const index of [2, 3])
            expect(styles.find((row) => row.id === ids[index])!.fill).not.toBe('none');
          if (info.project.name === 'desktop') {
            const cell = row(0).locator('td').first();
            const initial = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
            await row(0).hover();
            await expect
              .poll(() => cell.evaluate((el) => getComputedStyle(el).backgroundColor))
              .not.toBe(initial);
            const backgrounds = await row(0)
              .locator('td')
              .evaluateAll((cells) => cells.map((el) => getComputedStyle(el).backgroundColor));
            expect(new Set(backgrounds).size).toBe(1);
          }
          await page.mouse.move(0, 0);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: info.outputPath(`plan-${theme}.png`) });
          expect(
            (await new AxeBuilder({ page }).include('.plan-month-frame').analyze()).violations,
          ).toEqual([]);
        }
        if (area === 'attention') {
          const menu = page.locator('.plan-reference-filters');
          await menu.locator('summary').click();
          const attention = menu.getByRole('button', { name: 'Braucht Aufmerksamkeit (2)' });
          await attention.click();
          await expect(attention).toHaveAttribute('aria-pressed', 'true');
          await expect(page).toHaveURL(/filter=attention/);
          await menu.locator('summary').press('Escape');
          await expect(page.locator('.prow:has(.pname)')).toHaveCount(2);
          await expect(row(2)).toBeVisible();
          await expect(row(3)).toBeVisible();
          await expect(
            page.locator('.grp-title').filter({ hasText: 'Synthetic quiet group' }),
          ).toHaveCount(0);
          await expect(page.getByTestId('to-be-assigned')).toHaveText('969,00 €');
          await page.screenshot({ path: info.outputPath(`attention-${theme}.png`) });
          await page.reload();
          await expect(page.locator('.prow:has(.pname)')).toHaveCount(2);
          await menu.locator('summary').click();
          await menu.getByRole('button', { name: 'Alle (18)', exact: true }).click();
          await menu.locator('summary').press('Escape');
          await expect(page.locator('.prow:has(.pname)')).toHaveCount(18);
        }
        if (area === 'scroll') {
          await page.evaluate(() => window.scrollTo(0, 600));
          const head = page.getByTestId('plan-topbar');
          await expect(head).toHaveClass(/is-compact/);
          await page.evaluate(() => window.scrollBy(0, -100));
          await expect(head).not.toHaveClass(/is-compact/);
          expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
          await page.evaluate(() => window.scrollBy(0, 100));
          await expect(head).toHaveClass(/is-compact/);
          await expect(head).toHaveCSS('pointer-events', 'none');
          await expect(head.locator('summary.plan-tba')).toHaveCSS('pointer-events', 'auto');
          await expect(head).toHaveCSS('transition-duration', '0s');
          if (page.viewportSize()!.width < 768) {
            // Returning to toolbar controls expands the lead; clear its full measured height.
            for (const selector of [
              '.plan-filterbar',
              '.plan-menu-optionen summary',
              '.ptable thead .plan-add',
            ]) {
              await page.evaluate(() => window.scrollTo(0, 0));
              await expect(head).not.toHaveClass(/is-compact/);
              await page.evaluate(() => window.scrollTo(0, 400));
              await expect(head).toHaveClass(/is-compact/);
              const target = page.locator(selector);
              await target.scrollIntoViewIfNeeded();
              await expect(head).not.toHaveClass(/is-compact/);
              const headerBounds = (await head.boundingBox())!;
              expect((await target.boundingBox())!.y).toBeGreaterThanOrEqual(
                headerBounds.y + headerBounds.height,
              );
            }
          }
          // The bottom clamp must not turn a collapse into an endless expand/collapse loop.
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          const lastCategory = page.locator('.prow .pname').last();
          await lastCategory.click();
          const history = page.getByRole('link', { name: 'Verlauf und Buchungen' });
          await history.scrollIntoViewIfNeeded();
          await expect(history).toBeVisible();
          await page.screenshot({ path: info.outputPath(`compact-${theme}.png`) });
          await page.evaluate(() => window.scrollTo(0, 0));
          await expect(head).not.toHaveClass(/is-compact/);
        }
      } else {
        const path = area === 'bookings' ? '/konten/buchungen' : `/konten/${account.id}`;
        await page.goto(path);
        await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
        const checkedRow = page.locator(`tr[data-booking="${checked.id}"]`);
        const confirmedRow = page.locator(`tr[data-booking="${confirmed.id}"]`);
        const missingRow = page.locator(`tr[data-booking="${missing.id}"]`);
        await expect(checkedRow).toHaveClass(/is-reconciled/);
        await expect(checkedRow.getByRole('img', { name: 'geprüft', exact: true })).toBeVisible();
        await expect(checkedRow.getByRole('button', { name: /^Kategorie ändern/ })).toHaveCount(0);
        const checkedColor = await checkedRow
          .locator('.kx-payee')
          .evaluate((el) => getComputedStyle(el).color);
        const confirmedColor = await confirmedRow
          .locator('.kx-payee')
          .evaluate((el) => getComputedStyle(el).color);
        expect(checkedColor).not.toBe(confirmedColor);
        await expect(missingRow.locator('.kcat.is-none').filter({ visible: true })).toContainText(
          'ohne Kategorie',
        );
        const background = (selector: string) =>
          page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(await background(`tr[data-booking="${missing.id}"]`)).not.toBe(
          await background(`tr[data-booking="${confirmed.id}"]`),
        );
        if (page.viewportSize()!.width < 768) {
          const name = await missingRow.locator('.kname-s').boundingBox();
          const metadata = await missingRow.locator('.kaccount-mobile-meta').boundingBox();
          expect(name!.y + name!.height).toBeLessThanOrEqual(metadata!.y);
          for (const id of [missing.id, incomplete!.id]) {
            const meta = page.locator(`tr[data-booking="${id}"] .kaccount-mobile-meta`);
            const bounds = (await meta.boundingBox())!;
            const warning = (await meta.locator('.kcat.is-none').boundingBox())!;
            expect(warning.x).toBeGreaterThanOrEqual(bounds.x);
            expect(warning.x + warning.width).toBeLessThanOrEqual(bounds.x + bounds.width);
          }
        }
        expect(
          (await new AxeBuilder({ page }).include('.ktx-redesign').analyze()).violations,
        ).toEqual([]);
        await page.screenshot({
          path: info.outputPath(
            `${path.endsWith('buchungen') ? 'bookings' : 'account'}-${theme}.png`,
          ),
        });
      }
      expect(writes).toEqual([]);
      expect(await (await request.get('/api/budget/2026-10')).json()).toEqual(before);
      expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}
