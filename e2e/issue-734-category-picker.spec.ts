import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type APIRequestContext, type Locator } from '@playwright/test';
import { test as base } from './isolated-ledger';

const test = base.extend<{ pickerDesktop: boolean }>({
  pickerDesktop: [false, { option: true }],
  page: async ({ page, browser, isolatedLedger, pickerDesktop }, use) => {
    if (!pickerDesktop) return use(page);
    const context = await browser.newContext({
      baseURL: isolatedLedger.origin,
      storageState: isolatedLedger.storageState,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      reducedMotion: 'reduce',
    });
    try {
      const desktop = await context.newPage();
      await desktop.clock.setFixedTime(new Date('2026-10-21T12:00:00+02:00'));
      await use(desktop);
    } finally {
      await context.close();
    }
  },
});
test.use({ ledgerToday: '2026-10-21' });

async function post<T>(
  request: APIRequestContext,
  origin: string,
  path: string,
  data: unknown,
): Promise<T> {
  const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
  expect(response.status()).toBe(201);
  return response.json() as Promise<T>;
}

/** Inspect the actual clipping region, not the implementation's placement calculation. */
async function bounds(list: Locator) {
  return list.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const body = node.closest('.bk-body');
    if (!(body instanceof HTMLElement)) throw new Error('Missing real capture scroller');
    const clip = body.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = Math.max(clip.top + body.clientTop, viewport?.offsetTop ?? 0);
    const bottom = Math.min(
      clip.top + body.clientTop + body.clientHeight,
      (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight),
    );
    return {
      top: box.top,
      bottom: box.bottom,
      height: box.height,
      left: box.left,
      right: box.right,
      clipTop: top,
      clipBottom: bottom,
      viewportWidth: viewport?.width ?? innerWidth,
    };
  });
}
async function bounded(list: Locator) {
  await expect(list).toBeVisible();
  await expect
    .poll(async () => {
      const b = await bounds(list);
      return (
        b.top >= b.clipTop && b.bottom <= b.clipBottom && b.left >= 0 && b.right <= b.viewportWidth
      );
    })
    .toBe(true);
  return bounds(list);
}
async function activeVisible(field: Locator, list: Locator) {
  const id = await field.getAttribute('aria-activedescendant');
  expect(id).toBeTruthy();
  let lastGeometry: unknown;
  try {
    await expect
      .poll(async () => {
        const measured = await list.evaluate((node, activeId) => {
          const option = document.getElementById(activeId!);
          if (!option) return { valid: false, geometry: { missingActive: activeId } };
          const a = option.getBoundingClientRect(),
            b = node.getBoundingClientRect();
          const header = node.querySelector('.combo-head');
          const h = header?.getBoundingClientRect();
          const valid =
            a.top >=
              Math.max(
                b.top + node.clientTop,
                node.querySelector('.combo-head')?.getBoundingClientRect().bottom ?? b.top,
              ) && a.bottom <= b.top + node.clientTop + node.clientHeight;
          return {
            valid,
            geometry: {
              activeTop: a.top,
              activeBottom: a.bottom,
              activeHeight: a.height,
              activeOffsetTop: option.offsetTop,
              listTop: b.top,
              listBottom: b.bottom,
              headerTop: h?.top,
              headerBottom: h?.bottom,
              headerHeight: h?.height,
              scrollTop: node.scrollTop,
              scrollHeight: node.scrollHeight,
              clientTop: node.clientTop,
              clientHeight: node.clientHeight,
            },
          };
        }, id);
        lastGeometry = measured.geometry;
        return measured.valid;
      })
      .toBe(true);
  } catch (error) {
    console.log('734_ACTIVE_VISIBILITY_GEOMETRY ' + JSON.stringify(lastGeometry));
    const path = test.info().outputPath('active-visibility-failure.json');
    await writeFile(path, JSON.stringify(lastGeometry, null, 2));
    await test
      .info()
      .attach('active-visibility-failure', { path, contentType: 'application/json' });
    throw error;
  }
  return id;
}
async function balance(request: APIRequestContext, origin: string, id: string) {
  const response = await request.get(origin + '/api/accounts');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { accounts: { id: string; balanceCents: number }[] };
  return data.accounts.find((a) => a.id === id)?.balanceCents;
}

for (const profile of ['configured', 'desktop1440'] as const) {
  test.describe(profile, () => {
    test.use({ pickerDesktop: profile === 'desktop1440' });
    for (const theme of ['light', 'dark'] as const) {
      test(`${theme}: grouped bank identity, bounded category/contact list, synthetic confirm transport and real share Undo`, async ({
        page,
        request,
        browser,
        isolatedLedger,
      }, info) => {
        const { origin, databasePath } = isolatedLedger;
        const { account } = await post<{ account: { id: string } }>(request, origin, '/accounts', {
          name: 'Musterkonto 734',
          type: 'checking',
          openingDate: '2026-01-01',
          openingBalanceCents: 50000,
        });
        const { group: groupA } = await post<{ group: { id: string } }>(
          request,
          origin,
          '/categories/groups',
          { name: 'Gruppe A 734' },
        );
        const { group: groupB } = await post<{ group: { id: string } }>(
          request,
          origin,
          '/categories/groups',
          { name: 'Gruppe B 734' },
        );
        const { contact } = await post<{ contact: { id: string } }>(request, origin, '/contacts', {
          name: 'Kontakt Alpha 734',
        });
        const ids = Array.from({ length: 61 }, () => randomUUID());
        const candidate = randomUUID();
        const opened = openDatabase(databasePath);
        try {
          opened.db
            .insert(schema.category)
            .values(
              ids.map((id, i) => ({
                id,
                name:
                  i === 0 || i === 30
                    ? 'Muster doppelt'
                    : i === 60
                      ? 'Muster für Wege'
                      : `Kategorie ${i}`,
                groupId: i < 30 ? groupA.id : groupB.id,
                kind: 'variable' as const,
                class: 'need' as const,
                sortOrder: i,
              })),
            )
            .run();
          opened.db
            .insert(schema.bankSyncCandidate)
            .values({
              id: candidate,
              accountId: account.id,
              date: '2026-10-20',
              amountCents: -1000,
              currency: 'EUR',
              dedupeKey: candidate,
              memo: 'Bankumsatz Muster 734',
            })
            .run();
          opened.db
            .insert(schema.inboxItem)
            .values({
              id: candidate,
              kind: 'import',
              title: 'Bankumsatz prüfen',
              refType: 'bank-sync-candidate',
              refId: candidate,
            })
            .run();
          const active = () => {
            const bookings = opened.db
              .select()
              .from(schema.booking)
              .all()
              .filter((r) => !r.deletedAt);
            const activeIds = new Set(bookings.map((r) => r.id));
            return {
              bookings,
              splits: opened.db
                .select()
                .from(schema.bookingSplit)
                .all()
                .filter((r) => activeIds.has(r.bookingId)),
            };
          };
          const before = active(),
            auditBefore = opened.db.select().from(schema.auditLog).all();
          const writes: { path: string; body: unknown }[] = [];
          page.on('request', (incoming) => {
            const path = new URL(incoming.url()).pathname;
            if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(incoming.method()))
              writes.push({ path, body: incoming.postDataJSON() });
          });
          await page.goto(`/konten/${account.id}`);
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          const actual = await page.evaluate(() => ({
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
            coarse: matchMedia('(pointer: coarse)').matches,
            rawTouchPoints: navigator.maxTouchPoints,
          }));
          const expected =
            profile === 'desktop1440'
              ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false }
              : info.project.use;
          expect(actual.viewport).toEqual(expected.viewport);
          expect(actual.dpr).toBe(expected.deviceScaleFactor ?? 1);
          expect(actual.coarse).toBe(expected.hasTouch ?? false);
          const queue = page.getByRole('region', { name: 'Bankumsätze prüfen', exact: true });
          await queue.locator('.bank-review summary').click();
          const bankSelect = queue.getByRole('combobox', { name: 'Kategorie', exact: true });
          await expect(bankSelect.locator('optgroup')).toHaveCount(2);
          expect(
            await bankSelect.locator('optgroup').evaluateAll((groups) =>
              groups.map((g) => ({
                label: (g as HTMLOptGroupElement).label,
                ids: Array.from(g.querySelectorAll('option')).map((o) => o.value),
              })),
            ),
          ).toEqual([
            { label: 'Gruppe A 734', ids: ids.slice(0, 30) },
            { label: 'Gruppe B 734', ids: ids.slice(30) },
          ]);
          await bankSelect.selectOption(ids[30]!);
          if (actual.coarse) {
            const box = await bankSelect.boundingBox();
            expect(box!.width).toBeGreaterThanOrEqual(44);
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }
          await expect(page.locator('section.kinbox')).toHaveCount(1);
          expect(
            (await new AxeBuilder({ page }).include('section.kinbox').analyze()).violations,
          ).toEqual([]);
          expect(writes).toEqual([]);
          expect(active()).toEqual(before);
          expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
          const review = await request.get(
            origin + `/api/assignment-rules/candidates/${candidate}`,
          );
          expect(review.ok()).toBe(true);
          const revision = ((await review.json()) as { candidateRevision: string })
            .candidateRevision;
          // Banking transport is deliberately unconfigured in the isolated ledger. This
          // narrow synthetic response proves only the exact UI request, never a bank posting.
          let syntheticConfirmCount = 0;
          await page.route(`**/api/bank-sync/candidates/${candidate}/confirm`, async (route) => {
            expect(route.request().method()).toBe('POST');
            expect(route.request().postDataJSON()).toEqual({
              categoryId: ids[30],
              candidateRevision: revision,
              actions: { categoryId: ids[30], payeeId: null },
            });
            syntheticConfirmCount++;
            await route.fulfill({ json: { groupId: 'synthetic-confirm-734' } });
          });
          const confirmation = page.waitForResponse(
            (r) =>
              r.request().method() === 'POST' &&
              new URL(r.url()).pathname === `/api/bank-sync/candidates/${candidate}/confirm`,
          );
          await queue.getByRole('button', { name: 'Als Buchung bestätigen', exact: true }).click();
          expect((await confirmation).ok()).toBe(true);
          expect(writes[0]).toEqual({
            path: `/api/bank-sync/candidates/${candidate}/confirm`,
            body: {
              categoryId: ids[30],
              candidateRevision: revision,
              actions: { categoryId: ids[30], payeeId: null },
            },
          });
          expect(syntheticConfirmCount).toBe(1);
          expect(await balance(request, origin, account.id)).toBe(50000);
          expect(active()).toEqual(before);
          expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
          await page.getByRole('button', { name: 'Buchung erfassen', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
          const field = dialog.getByRole('combobox', { name: 'Kategorie', exact: true });
          await field.click();
          const list = dialog.locator('.is-capture-category .combo-list');
          await expect(list.getByRole('option')).toHaveCount(63);
          const names = await list
            .getByRole('option')
            .locator(':scope > span:first-child')
            .allTextContents();
          expect(names.at(-2)).toBe('Für Kontakt auslegen → Kontakt Alpha 734');
          expect(names.at(-1)).toBe('Kontakt neu anlegen');
          const initialBounds = await bounded(list);
          if (!actual.coarse) expect(initialBounds.height).toBeGreaterThan(240);
          const option = list.getByRole('option').first();
          const optionBox = await option.boundingBox();
          expect(optionBox).not.toBeNull();
          expect(optionBox!.width).toBeGreaterThanOrEqual(44);
          if (actual.coarse) expect(optionBox!.height).toBeGreaterThanOrEqual(44);
          else expect(optionBox!.height).toBeLessThan(44);
          await field.fill('a');
          await expect(field).toHaveAttribute(
            'aria-activedescendant',
            (await list.getByRole('option').first().getAttribute('id')) ?? '',
          );
          const manualScroll = await list.evaluate(
            (el) =>
              new Promise<number>((resolve) => {
                el.addEventListener(
                  'scroll',
                  () => requestAnimationFrame(() => resolve(el.scrollTop)),
                  { once: true },
                );
                el.scrollTop = el.scrollHeight;
              }),
          );
          expect(manualScroll).toBeGreaterThan(0);
          await field.fill('');
          for (let i = 0; i < 62; i++) await field.press('ArrowDown');
          const tailId = await activeVisible(field, list);
          expect(await page.locator(`[id="${tailId}"] > span:first-child`).textContent()).toBe(
            'Für Kontakt auslegen → Kontakt Alpha 734',
          );
          await expect(list.locator('.combo-head')).toBeVisible();
          for (let i = 0; i < 12; i++) {
            await field.press('ArrowUp');
            await activeVisible(field, list);
          }
          expect(
            await page
              .locator(
                `[id="${await field.getAttribute('aria-activedescendant')}"] > span:first-child`,
              )
              .textContent(),
          ).toBe('Kategorie 49');
          for (let i = 0; i < 12; i++) await field.press('ArrowDown');
          expect(await activeVisible(field, list)).toBe(tailId);
          const scroller = dialog.locator('.bk-body');
          const scrollBefore = await scroller.evaluate((el) => el.scrollTop);
          const draftBeforeResize = await field.inputValue();
          await page.setViewportSize({ width: actual.viewport.width, height: 450 });
          await expect
            .poll(async () => (await bounds(list)).clipBottom - (await bounds(list)).clipTop)
            .toBeLessThan(initialBounds.clipBottom - initialBounds.clipTop);
          expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrollBefore);
          if (actual.coarse) {
            // Fresh focus can scroll the anchor before resize. Arrange a fully hidden
            // anchor explicitly; a partially visible field may correctly keep its popup.
            await scroller.evaluate((el) => {
              el.scrollTop = 0;
            });
            await expect
              .poll(() =>
                field.evaluate((el) => {
                  const clip = el.closest('.bk-body')!.getBoundingClientRect(),
                    box = el.getBoundingClientRect();
                  return box.bottom <= clip.top || box.top >= clip.bottom;
                }),
              )
              .toBe(true);
            await expect(list).toBeHidden();
            await expect(field).toHaveAttribute('aria-expanded', 'false');
            await field.press('Enter');
            await expect(dialog).toBeVisible();
            await expect(field).toHaveValue(draftBeforeResize);
            expect(writes.map((w) => w.path)).toEqual([
              `/api/bank-sync/candidates/${candidate}/confirm`,
            ]);
            await expect(list).toBeVisible();
            await bounded(list);
          }
          await activeVisible(field, list);
          expect(await field.getAttribute('aria-activedescendant')).toBe(tailId);
          expect(
            await scroller.evaluate((el) => el.scrollHeight - el.clientHeight),
          ).toBeGreaterThan(0);
          await scroller.evaluate((el, phone) => {
            el.scrollTop = phone ? 0 : el.scrollHeight;
          }, actual.coarse);
          await expect
            .poll(() =>
              field.evaluate((el) => {
                const clip = el.closest('.bk-body')!.getBoundingClientRect(),
                  box = el.getBoundingClientRect();
                return box.bottom <= clip.top || box.top >= clip.bottom;
              }),
            )
            .toBe(true);
          await expect(list).toBeHidden();
          await expect(field).toHaveAttribute('aria-expanded', 'false');
          const draftValue = await field.inputValue();
          await field.press('Enter');
          await expect(dialog).toBeVisible();
          await expect(field).toHaveValue(draftValue);
          expect(writes.map((w) => w.path)).toEqual([
            `/api/bank-sync/candidates/${candidate}/confirm`,
          ]);
          await expect(list).toBeVisible();
          await bounded(list);
          expect(await field.getAttribute('aria-activedescendant')).toBe(tailId);
          await activeVisible(field, list);
          await page.setViewportSize(actual.viewport);
          await field.scrollIntoViewIfNeeded();
          await bounded(list);
          await activeVisible(field, list);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          expect(
            (await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations,
          ).toEqual([]);
          await page.screenshot({ path: info.outputPath(`category-${profile}-${theme}.png`) });
          await writeFile(
            info.outputPath('picker-profile.json'),
            JSON.stringify(
              {
                profile,
                theme,
                engine: browser.browserType().name(),
                actual,
                initialBounds,
                finalBounds: await bounds(list),
              },
              null,
              2,
            ),
          );
          await field.fill('für');
          await expect(list.getByRole('option')).toHaveCount(2);
          expect(
            await list.getByRole('option').locator(':scope > span:first-child').allTextContents(),
          ).toEqual(['Muster für Wege', 'Für Kontakt auslegen → Kontakt Alpha 734']);
          await field.press('Enter');
          await expect(field).toHaveValue('Muster für Wege');
          await dialog.getByLabel('Betrag', { exact: true }).fill('10,00');
          await dialog.getByRole('button', { name: 'Teilen ▾', exact: true }).click();
          await dialog.getByLabel('Kontakt 1.1', { exact: true }).selectOption(contact.id);
          await expect(dialog.getByLabel('Anteil 1.1 (%)')).toHaveValue('50');
          const saved = page.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/bookings',
          );
          await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
          const response = await saved;
          expect(response.status()).toBe(201);
          const id = ((await response.json()) as { id: string }).id;
          const storedResponse = await request.get(origin + `/api/bookings/${id}`);
          expect(storedResponse.ok()).toBe(true);
          const stored = (await storedResponse.json()) as {
            booking: {
              amountCents: number;
              accountId: string;
              splits: {
                categoryId: string | null;
                contactId: string | null;
                amountCents: number;
              }[];
            };
          };
          expect(stored.booking).toMatchObject({ accountId: account.id, amountCents: -1000 });
          expect(stored.booking.splits).toHaveLength(2);
          expect(stored.booking.splits[0]).toMatchObject({
            categoryId: ids[60],
            amountCents: -500,
          });
          expect(stored.booking.splits[1]).toMatchObject({
            contactId: contact.id,
            amountCents: -500,
          });
          expect(await balance(request, origin, account.id)).toBe(49000);
          await page
            .locator('.toast.is-open')
            .getByRole('button', { name: 'Rückgängig', exact: true })
            .click();
          await expect.poll(() => balance(request, origin, account.id)).toBe(50000);
          expect(active()).toEqual(before);
          expect(writes.map((w) => w.path)).toEqual([
            `/api/bank-sync/candidates/${candidate}/confirm`,
            '/api/bookings',
            '/api/undo',
          ]);
        } finally {
          opened.close();
        }
      });
    }
  });
}
