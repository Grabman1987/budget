import Database from 'better-sqlite3';
import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { pickCategory } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-02' });

test('scrolls account and all bookings through six months, with complete search and balances', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}, info) => {
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Verlauf Muster',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    },
  });
  expect(response.ok()).toBe(true);
  const { account } = await response.json();
  const db = new Database(isolatedLedger.databasePath);
  try {
    db.transaction(() => {
      const booking = db.prepare(
        'INSERT INTO booking (id, account_id, date, amount_cents, memo, status) VALUES (?, ?, ?, -100, ?, ?)',
      );
      const split = db.prepare(
        'INSERT INTO booking_split (id, booking_id, amount_cents) VALUES (?, ?, -100)',
      );
      for (let i = 0; i < 180; i++) {
        const id = `history-${String(i).padStart(3, '0')}`;
        booking.run(
          id,
          account.id,
          `2026-${String(5 + Math.floor(i / 30)).padStart(2, '0')}-${String(1 + (i % 30)).padStart(2, '0')}`,
          i === 0 ? 'Oldest needle' : 'History Muster',
          'confirmed',
        );
        split.run(`split-${id}`, id);
      }
    })();
  } finally {
    db.close();
  }
  for (const url of [`/konten/${account.id}`, '/konten/buchungen']) {
    await page.goto(url);
    // Today is 2026-10-02: history-152 … history-179 lie ahead and sit in "Kommend", the rest is history.
    const past = page.locator('[data-booking]:not(.is-upcoming)');
    await expect(past.first()).toHaveAttribute('data-booking', 'history-151');
    const upcoming = page.locator('.kupcoming-toggle');
    await expect(upcoming).toHaveText('28 kommend · nächste: History Muster 03.10.');
    if ((await upcoming.getAttribute('aria-expanded')) === 'false') await upcoming.click();
    await expect(page.locator('[data-booking]').first()).toHaveAttribute(
      'data-booking',
      'history-152',
    );
    const loadBox = await page
      .getByRole('button', { name: 'Weitere Buchungen laden' })
      .boundingBox();
    if (info.project.name === 'mobile') {
      expect(loadBox!.height).toBeGreaterThanOrEqual(44);
      expect(loadBox!.width).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < 4 && (await past.count()) < 152; i++) {
      await page.getByRole('button', { name: 'Weitere Buchungen laden' }).scrollIntoViewIfNeeded();
      await expect
        .poll(() => past.count())
        .toBeGreaterThan(i === 0 ? (url.endsWith('/buchungen') ? 50 : 100) : 50 * (i + 1));
    }
    await expect(past).toHaveCount(152);
    await expect(page.locator('[data-booking]')).toHaveCount(180);
    await expect(page.locator('[data-booking]').last()).toHaveAttribute(
      'data-booking',
      'history-000',
    );
    if (!url.endsWith('/buchungen')) {
      await expect(page.locator('[data-booking="history-179"] .kx-run')).toContainText('820,00');
      await expect(page.locator('[data-booking="history-000"] .kx-run')).toContainText('999,00');
      // Opening 1.000,00 minus the 152 past bookings of 1,00 each (history-000 … history-151).
      await expect(page.locator('.kacct-saldo strong')).toHaveText('848,00 €');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const more = page.getByRole('button', { name: 'Weitere Buchungen laden' });
    await expect(more).toHaveCount(0);
    await page.locator('[data-booking]').last().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(url.endsWith('/buchungen') ? 'all-history.png' : 'account-history.png'),
    });
  }
  await page.getByLabel('In Buchungen suchen').fill('Oldest needle');
  await expect(page.locator('[data-booking]')).toHaveCount(1);
  await expect(page.locator('[data-booking]')).toHaveAttribute('data-booking', 'history-000');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

for (const [rhythm, date] of [
  ['weekly', '2026-09-28'],
  ['monthly', '2026-09-05'],
] as const) {
  test(`creates ${rhythm} credit-card repetition from the dialog and shows it in Plan and Heute`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    const headers = { origin: baseURL! };
    const post = async (path: string, data: unknown) => {
      const r = await request.post('/api' + path, { headers, data });
      expect(r.ok(), await r.text()).toBe(true);
      return r.json();
    };
    const { account } = await post('/accounts', {
      name: 'Karte Muster',
      type: 'credit_card',
      openingDate: '2026-01-01',
    });
    const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
    const { category } = await post('/categories', {
      groupId: group.id,
      name: 'Kleine Zahlung Muster',
      kind: 'variable',
      class: 'need',
    });
    await page.goto(`/konten/${account.id}?panel=buchung`);
    const panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
    await panel.getByLabel('Betrag', { exact: true }).fill('2,03');
    await panel.getByLabel('Datum', { exact: true }).fill(date.split('-').reverse().join('.'));
    await panel.getByLabel('Empfänger', { exact: true }).fill('Kleine Kartenzahlung Muster');
    await pickCategory(panel, category.name);
    await panel.locator('summary').click();
    await panel.getByLabel('Wiederholen').selectOption(rhythm);
    const gets: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'GET') gets.push(new URL(r.url()).pathname);
    });
    const saved = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/bookings' && r.request().method() === 'POST',
    );
    const start = performance.now();
    await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
    const savedResponse = await saved;
    const postMs = performance.now() - start;
    await expect(panel).toBeHidden();
    const closeMs = performance.now() - start;
    expect(savedResponse.status()).toBe(201);
    expect(gets.filter((p) => p.startsWith('/api/wealth/'))).toEqual([]);
    await info.attach('save-timing', {
      body: JSON.stringify(
        {
          rhythm,
          serverTiming: savedResponse.headers()['server-timing'],
          postMs,
          closeMs,
          refetches: gets,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    console.info(
      JSON.stringify({
        rhythm,
        method: 'POST',
        serverTiming: savedResponse.headers()['server-timing'],
        postMs,
        closeMs,
        refetches: gets,
      }),
    );
    const created = await savedResponse.json();
    const row = page.locator(`[data-booking="${created.id}"]`);
    await row.getByRole('button', { name: /bearbeiten$/ }).click();
    const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
    await edit.getByLabel('Notiz').fill('Synthetic edit');
    gets.length = 0;
    const patched = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/bookings/${created.id}` &&
        r.request().method() === 'PATCH',
    );
    const patchStart = performance.now();
    await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
    const patchResponse = await patched;
    const patchMs = performance.now() - patchStart;
    await expect(edit).toBeHidden();
    expect(patchResponse.status()).toBe(200);
    expect(gets.filter((p) => p.startsWith('/api/wealth/'))).toEqual([]);
    await info.attach('patch-timing', {
      body: JSON.stringify(
        {
          serverTiming: patchResponse.headers()['server-timing'],
          patchMs,
          closeMs: performance.now() - patchStart,
          refetches: gets,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
    console.info(
      JSON.stringify({
        rhythm,
        method: 'PATCH',
        serverTiming: patchResponse.headers()['server-timing'],
        patchMs,
        closeMs: performance.now() - patchStart,
        refetches: gets,
      }),
    );
    const { payments } = await (await request.get('/api/expected')).json();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      rhythm,
      accountId: account.id,
      categoryId: category.id,
      startDate: '2026-10-05',
      amountCents: -203,
    });
    await page.goto('/plan/erwartet');
    await expect(
      page.getByText('Kleine Kartenzahlung Muster', { exact: true }).first(),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`plan-${rhythm}.png`) });
    await page.goto('/');
    const upcoming = page.getByRole('region', { name: 'Fällig 14 Tage' });
    const occurrences = upcoming
      .locator('.heute-upcoming')
      .filter({ hasText: 'Kleine Kartenzahlung Muster' });
    await expect(occurrences).toHaveCount(rhythm === 'weekly' ? 2 : 1);
    await expect(occurrences.first()).toContainText('05.10.');
    if (rhythm === 'weekly') await expect(occurrences.nth(1)).toContainText('12.10.');
    await expect(upcoming.getByText('Karte Muster', { exact: false }).first()).toBeVisible();
    await upcoming.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`today-${rhythm}.png`) });
    await page.evaluate(() => {
      document.documentElement.dataset['theme'] = 'dark';
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
