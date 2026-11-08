import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-11-08' });

async function seed(
  request: APIRequestContext,
  origin: string,
  databasePath: string,
  count: number,
) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Register Muster',
    type: 'checking',
    openingDate: '2026-01-01',
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Einkauf Muster',
    class: 'need',
    kind: 'variable',
  });
  const { category: other } = await post('/categories', {
    groupId: group.id,
    name: 'Reise Muster',
    class: 'want',
    kind: 'variable',
  });
  // Synthetic split rows: only 101 cents match the category; the large fixture crosses a page.
  const opened = new Database(databasePath);
  try {
    opened.transaction(() => {
      const booking = opened.prepare(
        "INSERT INTO booking (id, account_id, date, amount_cents, status, memo) VALUES (?, ?, '2026-11-02', -501, 'confirmed', 'Synthetic register')",
      );
      const split = opened.prepare(
        'INSERT INTO booking_split (id, booking_id, category_id, amount_cents) VALUES (?, ?, ?, ?)',
      );
      for (let i = 0; i < count; i++) {
        const id = `synthetic-month-${i}`;
        booking.run(id, account.id);
        split.run(`${id}-category`, id, category.id, -101);
        split.run(`${id}-other`, id, other.id, -400);
      }
    })();
  } finally {
    opened.close();
  }
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -203,
    status: 'pending',
    categoryId: category.id,
    payeeName: 'Älter Muster',
    memo: 'Synthetic register',
  });
  return category.id;
}

test('complete filtered month sums, pagination, range and privacy', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}, info) => {
  const categoryId = await seed(request, baseURL!, isolatedLedger.databasePath, 51);
  await page.goto(`/konten/buchungen?kategorie=${categoryId}`);
  await expect(page.locator('[data-redesign="bookings"]')).toBeVisible();
  const heading = page.locator('.kmonth-totals').first();
  await expect(heading).toContainText('Monat −51,51 € · bis hier −51,51 €');
  await expect(page.locator('[data-booking]')).toHaveCount(50);
  await expect(page.locator('.kupcoming-toggle')).toHaveCount(0);
  await expect(
    page.locator('.kbookings-bar').getByRole('button', { name: 'Buchung erfassen' }),
  ).toHaveCount(0);
  const summary = page.getByRole('region', { name: 'Auswertung des aktuellen Filters' });
  const phone = info.project.name !== 'desktop';
  if (phone) {
    const toggle = summary.getByRole('button', { name: 'Auswertung des Filters' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
  }
  await expect(summary.getByRole('button', { name: '6 M', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(summary.locator('dl')).toContainText('−53,54 €');
  await expect(summary.locator('dl')).toContainText('−8,92 €');
  await expect(summary.getByRole('img')).toBeVisible();
  await summary.getByRole('button', { name: '3 M', exact: true }).click();
  await expect(summary.locator('dl')).toContainText('−17,85 €');
  await summary.getByRole('button', { name: '12 M', exact: true }).click();
  await expect(summary.locator('dl')).toContainText('−4,46 €');
  await summary.getByRole('button', { name: 'Alle', exact: true }).click();
  await expect(summary.locator('dl')).toContainText('−26,77 €');
  await summary.getByRole('button', { name: '6 M', exact: true }).click();
  await page.getByRole('button', { name: 'Weitere Buchungen laden' }).scrollIntoViewIfNeeded();
  await expect(page.locator('[data-booking]')).toHaveCount(52);
  await expect(page.locator('.kmonth-totals').last()).toContainText(
    'Monat −2,03 € · bis hier −53,54 €',
  );
  await page.getByRole('button', { name: 'Status filtern: vorgemerkt', exact: true }).click();
  await expect(page.locator('[data-booking]')).toHaveCount(1);
  await expect(summary.locator('dl')).toContainText('−2,03 €');
  await page.getByLabel('In Buchungen suchen').fill('no-match');
  await expect(page.locator('[data-booking]')).toHaveCount(0);
  await expect(summary).toContainText('Keine Buchungen für diese Filter.');
  await page.getByLabel('In Buchungen suchen').fill('Synthetic');
  await expect(page.locator('[data-booking]')).toHaveCount(1);
  await page.evaluate(() => {
    localStorage.setItem('budget-amounts-hidden', '1');
  });
  await page.reload();
  if (phone) await summary.getByRole('button', { name: 'Auswertung des Filters' }).click();
  await expect(summary.locator('dl')).toContainText('••• €');
  await expect(summary.getByRole('img')).toHaveCount(0);
  await expect(page.locator('.kmonth-sums')).toContainText('Monat ••• € · bis hier ••• €');
  await summary.getByText('Monatswerte · gestrichelt: Ø pro Monat', { exact: true }).click();
  await expect(summary.locator('table')).toContainText('••• €');
  expect(await summary.textContent()).not.toContain('−2,03');
});

for (const theme of ['light', 'dark'])
  test(`register layout and accessibility (${theme})`, async ({
    page,
    request,
    baseURL,
    isolatedLedger,
  }, info) => {
    const categoryId = await seed(request, baseURL!, isolatedLedger.databasePath, 1);
    await page.goto(`/konten/buchungen?kategorie=${categoryId}`);
    await expect(page.locator('[data-booking]')).toHaveCount(2);
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const summary = page.getByRole('region', { name: 'Auswertung des aktuellen Filters' });
    if (info.project.name !== 'desktop') {
      await expect(page.locator('.kmonth-totals').first()).toBeVisible();
      const path = info.outputPath(`register-collapsed-${theme}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      await info.attach(`Register collapsed ${theme}`, { path, contentType: 'image/png' });
      await summary.getByRole('button', { name: 'Auswertung des Filters' }).click();
    }
    await expect(summary.getByRole('img')).toBeVisible();
    {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const path = info.outputPath(`register-${theme}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      await info.attach(`Register ${theme}`, { path, contentType: 'image/png' });
      expect(
        (await new AxeBuilder({ page }).include('.konten-register-head').analyze()).violations,
      ).toEqual([]);
    }
  });
