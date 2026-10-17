import AxeBuilder from '@axe-core/playwright';
import Database from 'better-sqlite3';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { pickCategory } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-13' });

test('separates future captures and next weekly occurrence, projects cents and undoes both actions', async ({
  page,
  request,
  baseURL,
}, info) => {
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Kommend Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Wöchentlich Muster',
    kind: 'variable',
    class: 'want',
  });
  await page.goto(`/konten/${account.id}?panel=buchung`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await dialog.getByLabel('Betrag', { exact: true }).fill('2,03');
  await dialog.getByLabel('Datum', { exact: true }).fill('12.10.2026');
  await dialog.getByLabel('Empfänger', { exact: true }).fill('Wöchentlich Muster');
  await pickCategory(dialog, category.name);
  await dialog.getByLabel('Wiederholen', { exact: true }).selectOption('weekly');
  const captured = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/bookings' && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  const captureResponse = await captured;
  expect(captureResponse.status()).toBe(201);
  const past = await captureResponse.json();
  await expect(dialog).toBeHidden();
  const future = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-27',
    amountCents: -1234,
    payeeName: 'Später Muster',
    status: 'confirmed',
  });
  for (const url of [`/konten/${account.id}`, '/konten/buchungen']) {
    await page.goto(url);
    const section = page.locator('.kupcoming');
    const summary = section.locator('.kupcoming-toggle');
    await expect(summary).toHaveText('2 kommend · nächste: Wöchentlich Muster 19.10.');
    // One table: the section shares header and columns with the history below.
    await expect(page.locator('.ktable')).toHaveCount(1);
    await expect(page.locator('.ktable thead')).toHaveCount(1);
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await expect(section.locator('[data-booking], [data-occurrence]')).toHaveCount(0);
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    const scheduled = section.locator('[data-occurrence]');
    const booked = section.locator(`[data-booking="${future.id}"]`);
    await expect(scheduled).toHaveCount(1);
    await expect(scheduled.locator('.kx-run')).toContainText('995,94');
    await expect(booked.locator('.kx-run')).toContainText('983,60');
    await expect(booked.locator('.kx-date')).toContainText('27.10. · in 14 Tagen');
    await expect(booked.getByRole('img', { name: 'Kommende Buchung' })).toBeVisible();
    await expect(scheduled.getByRole('img', { name: 'Nächste Wiederholung' })).toBeVisible();
    await expect(page.getByTestId('register-today')).toContainText('Heute · Saldo 997,97');
    await expect(page.locator(`[data-booking="${past.id}"]`)).toBeVisible();
    if (!url.endsWith('/buchungen')) {
      await expect(page.getByTestId('account-balance')).toContainText('997,97');
      await expect(page.locator(`[data-booking="${past.id}"] .kx-run`)).toContainText('997,97');
    } else await expect(scheduled.locator('.kx-acct')).toHaveText(account.name);
    await expect(booked).toHaveClass(/is-upcoming/);
    expect(await booked.locator('.kname-s').evaluate((el) => getComputedStyle(el).fontWeight)).toBe(
      '400',
    );
    if (info.project.name === 'desktop') {
      // Same columns as the history rows, compact actions on one line.
      const history = page.locator(`[data-booking="${past.id}"]`);
      for (const cell of [
        '.kx-date',
        '.kx-payee',
        '.kx-cat',
        '.kx-amount',
        '.kx-run',
        '.kx-status',
      ]) {
        const a = (await booked.locator(cell).boundingBox())!;
        const b = (await history.locator(cell).boundingBox())!;
        const c = (await scheduled.locator(cell).boundingBox())!;
        expect(Math.abs(a.x - b.x), cell).toBeLessThan(1);
        expect(Math.abs(a.width - b.width), cell).toBeLessThan(1);
        expect(Math.abs(c.x - b.x), cell).toBeLessThan(1);
      }
      const rowHeight = (await booked.boundingBox())!.height;
      expect((await scheduled.boundingBox())!.height).toBeLessThan(rowHeight * 1.4);
      await scheduled.hover();
      const actions = await scheduled.getByRole('button', { name: 'Jetzt buchen' }).boundingBox();
      const skip = await scheduled.getByRole('button', { name: 'Überspringen' }).boundingBox();
      expect(actions!.height).toBeLessThanOrEqual(34);
      expect(Math.abs(actions!.y - skip!.y)).toBeLessThan(2);
    }
    if (info.project.name === 'mobile') {
      expect((await booked.locator('.kx-payee').boundingBox())!.width).toBeGreaterThan(100);
      await scheduled.getByRole('button', { name: /^Aktionen:/ }).click();
      for (const name of ['Jetzt buchen', 'Überspringen']) {
        const box = await scheduled.getByRole('button', { name }).boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
    }
    await section.scrollIntoViewIfNeeded();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`${url.endsWith('/buchungen') ? 'all' : 'account'}-${theme}.png`),
      });
    }
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await page.reload();
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
  }
  // Future captures retain inline editing; changing to today moves the row into history.
  const futureRow = page.locator(`.kupcoming [data-booking="${future.id}"]`);
  await futureRow.getByRole('button', { name: /Datum ändern:/ }).click();
  await futureRow.getByLabel('Datum bearbeiten', { exact: true }).fill('2026-10-13');
  await futureRow.getByLabel('Datum bearbeiten', { exact: true }).press('Enter');
  await expect(futureRow).toHaveCount(0);
  await expect(page.locator(`[data-booking="${future.id}"]`)).toBeVisible();
  await expect(page.getByTestId('register-today')).toContainText('985,63');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(futureRow).toBeVisible();
  await expect(page.getByTestId('register-today')).toContainText('997,97');
  const scheduled = page.locator('.kupcoming [data-occurrence]');
  // Hover-only (desktop) or behind ⋯ (touch): reveal the actions the way a user does, then press.
  const press = async (name: string) => {
    const more = scheduled.getByRole('button', { name: /^Aktionen:/ });
    if (!(await more.isVisible())) await scheduled.hover();
    else if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
    await scheduled.getByRole('button', { name }).click();
  };
  const originalId = await scheduled.getAttribute('data-occurrence');
  await press('Überspringen');
  await expect(scheduled).not.toHaveAttribute('data-occurrence', originalId!);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(scheduled).toHaveAttribute('data-occurrence', originalId!);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/occurrences/${originalId}/book`) && r.request().method() === 'POST',
  );
  await press('Jetzt buchen');
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(201);
  const result = await savedResponse.json();
  await expect(page.locator(`[data-booking="${result.bookingId}"]`)).toBeVisible();
  await expect(scheduled).not.toHaveAttribute('data-occurrence', originalId!);
  await expect(page.getByTestId('register-today')).toContainText('995,94');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.locator(`[data-booking="${result.bookingId}"]`)).toHaveCount(0);
  await expect(scheduled).toHaveAttribute('data-occurrence', originalId!);
  await expect(page.getByTestId('register-today')).toContainText('997,97');
  await scheduled.getByRole('link', { name: 'Wöchentlich Muster' }).click();
  await expect(page).toHaveURL(/\/plan\/erwartet\/[^?]+/);
  await expect(
    page.getByRole('heading', { name: 'Wöchentlich Muster', exact: true }).last(),
  ).toBeVisible();
});

test('loads every future capture beyond the preview and first cursor page', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}, info) => {
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: {
      name: 'Zukunft Muster',
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
      const b = db.prepare(
        "INSERT INTO booking (id, account_id, date, amount_cents, status) VALUES (?, ?, '2027-12-01', -1, 'confirmed')",
      );
      const s = db.prepare(
        'INSERT INTO booking_split (id, booking_id, amount_cents) VALUES (?, ?, -1)',
      );
      for (let i = 0; i < 201; i++) {
        const id = `future-${String(i).padStart(3, '0')}`;
        b.run(id, account.id);
        s.run(`split-${id}`, id);
      }
    })();
  } finally {
    db.close();
  }
  await page.goto(`/konten/${account.id}`);
  const section = page.locator('.kupcoming');
  const toggle = section.locator('.kupcoming-toggle');
  await expect(toggle).toHaveText('201 kommend · nächste: Buchung 01.12.');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(section.locator('[data-booking]')).toHaveCount(0);
  await toggle.click();
  await expect(section.locator('[data-booking]')).toHaveCount(201);
  await expect(section.locator('[data-booking]').last().locator('.kx-run')).toContainText('997,99');
  await expect(page.getByTestId('account-balance')).toContainText('1.000,00');
});
