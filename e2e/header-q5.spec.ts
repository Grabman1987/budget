import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 4 } }));
});

test('one review pill on desktop; three phone header items and linked status below', async ({
  page,
  isMobile,
}, info) => {
  test.setTimeout(90_000);
  await page.goto('/reports');
  const count = (
    (await (await page.request.get('/api/budget/2026-09')).json()) as BudgetMonthView
  ).summary.envelopes.filter((e) => e.availableCents < 0).length;
  if (isMobile) {
    const header = page.locator('.m-head');
    await expect(
      header.locator(':scope > .m-title, :scope > button, :scope > details'),
    ).toHaveCount(3);
    await expect(header.locator(':scope > a, .count, .overspent-chip')).toHaveCount(0);
    const status = page.getByRole('navigation', { name: 'Offene Aufgaben' });
    await expect(status).toHaveText(`4 zu prüfen·${count} überzogen`);
    await expect(status.getByRole('link', { name: '4 zu prüfen' })).toHaveAttribute(
      'href',
      /^\/konten\/pruefen/,
    );
    await status.getByRole('link', { name: `${count} überzogen` }).click();
    await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09&ansicht=triage/);
    await page
      .getByRole('navigation', { name: 'Offene Aufgaben' })
      .getByRole('link', { name: '4 zu prüfen' })
      .click();
  } else {
    const header = page.locator('.topbar');
    await expect(header.locator('.review-pill')).toHaveCount(1);
    await expect(header.locator('.review-pill')).toHaveText('Prüfen · 4');
    await expect(header.locator('.overspent-chip, .count')).toHaveCount(0);
    await expect(header.getByText(/überzogen/)).toHaveCount(0);
    await header.locator('.review-pill').click();
  }
  await expect(page).toHaveURL(/\/konten\/pruefen/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const small = await page
      .locator(isMobile ? '.m-head, .m-status' : '.topbar')
      .evaluateAll((regions) =>
        regions
          .flatMap((region) => [...region.querySelectorAll('a, button, summary')])
          .filter((el) => el.getClientRects().length)
          .map((el) => el.getBoundingClientRect())
          .filter((box) => box.width < 44 || box.height < 44),
      );
    expect(small).toEqual([]);
    await page.screenshot({ path: info.outputPath(`header-${theme}.png`) });
  }
});

test('zero open items has no number or phone status line', async ({ page, isMobile }) => {
  await page.route('**/api/inbox/count', (route) => route.fulfill({ json: { count: 0 } }));
  await page.route('**/api/budget/2026-09', async (route) => {
    const response = await route.fetch();
    const body: BudgetMonthView = await response.json();
    body.summary.envelopes = body.summary.envelopes.map((e) => ({ ...e, availableCents: 0 }));
    await route.fulfill({ response, json: body });
  });
  const loaded = page.waitForResponse('**/api/inbox/count');
  const budget = page.waitForResponse('**/api/budget/2026-09');
  await page.goto('/reports');
  await loaded;
  await budget;
  if (isMobile) await expect(page.locator('.m-status')).toHaveCount(0);
  else await expect(page.locator('.review-pill')).toHaveText('Prüfen');
});

test('search overlay and full results clear area selection and name the phone header Suchen', async ({
  page,
  isMobile,
}) => {
  for (const source of [
    '/',
    '/plan/monat',
    '/konten',
    '/vermoegen/portfolio',
    '/reports',
    '/einstellungen',
  ]) {
    await page.goto(source);
    await expect(
      page.locator(
        isMobile
          ? '.tabbar [aria-current="page"]'
          : '.sheetlist [aria-current="page"], .sidebar-foot [aria-current="page"]',
      ),
    ).toHaveCount(source === '/einstellungen' && isMobile ? 0 : 1);
    const title = await page.locator('.m-title-text').textContent();
    await page.locator(isMobile ? '#global-search-mobile' : '#global-search').click();
    await expect(page.getByRole('dialog', { name: 'Suchen' })).toBeVisible();
    await expect(
      page.locator(
        isMobile
          ? '.tabbar [aria-current="page"]'
          : '.sheetlist [aria-current="page"], .sidebar-foot [aria-current="page"]',
      ),
    ).toHaveCount(0);
    if (isMobile) await expect(page.locator('.m-title-text')).toHaveText('Suchen');
    await page.getByRole('combobox', { name: 'Suchen', exact: true }).press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.locator(
        isMobile
          ? '.tabbar [aria-current="page"]'
          : '.sheetlist [aria-current="page"], .sidebar-foot [aria-current="page"]',
      ),
    ).toHaveCount(source === '/einstellungen' && isMobile ? 0 : 1);
    if (isMobile) await expect(page.locator('.m-title-text')).toHaveText(title!);
  }
  await page.goto('/suche?q=Plan');
  await expect(
    page.locator('.sidebar [aria-current="page"], .tabbar [aria-current="page"]'),
  ).toHaveCount(0);
  if (isMobile) await expect(page.locator('.m-title-text')).toHaveText('Suchen');
});

test('offline writes have a separate neutral chip and never inflate Prüfen', async ({
  page,
  isMobile,
}) => {
  await page.goto('/reports');
  await expect(page.locator(isMobile ? '.m-status' : '.review-pill')).toContainText(
    isMobile ? '4 zu prüfen' : 'Prüfen · 4',
  );
  // Populate the existing device queue while the page remains online. No booking endpoint is called.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('budget-capture', 1);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('bookings')) {
          db.close();
          reject(new Error('The capture queue must be initialized by the app before seeding.'));
          return;
        }
        const tx = db.transaction('bookings', 'readwrite');
        for (const id of ['header-a', 'header-b', 'header-c'])
          tx.objectStore('bookings').put({
            id,
            createdAt: 1,
            uncertain: false,
            input: {
              type: 'booking',
              accountId: 'synthetic-account',
              date: '2026-09-17',
              amountCents: -100,
              status: 'pending',
            },
            draft: {
              kind: 'expense',
              accountId: 'synthetic-account',
              toAccountId: '',
              date: '2026-09-17',
              amount: '1',
              payee: 'Testkauf',
              categoryId: '',
              incomeTypeId: '',
              contactId: '',
              projectId: '',
              memo: '',
              status: 'pending',
              flag: '',
              splitOn: false,
              splits: [],
            },
          });
        tx.oncomplete = () => {
          db.close();
          window.dispatchEvent(new Event('budget-queue-changed'));
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  const chip = page.locator('.offline-chip');
  await expect(chip).toHaveText('3 offline gespeichert');
  await expect(page.locator(isMobile ? '.m-status' : '.review-pill')).toContainText(
    isMobile ? '4 zu prüfen' : 'Prüfen · 4',
  );
  await expect(page.locator('.sidebar .count, .tabbar .count')).toHaveCount(0);
  expect(
    await chip.evaluate((el) => {
      const sample = document.createElement('span');
      sample.style.color = 'var(--ink-2)';
      document.body.append(sample);
      const neutral = getComputedStyle(el).color === getComputedStyle(sample).color;
      sample.remove();
      return neutral;
    }),
  ).toBe(true);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('budget-capture', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('bookings', 'readwrite');
        tx.objectStore('bookings').clear();
        tx.oncomplete = () => {
          db.close();
          window.dispatchEvent(new Event('budget-queue-changed'));
          resolve();
        };
      };
    });
  });
  await expect(chip).toHaveCount(0);
});
