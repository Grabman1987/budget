import AxeBuilder from '@axe-core/playwright';
import Database from 'better-sqlite3';
import { writeFile } from 'node:fs/promises';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-19' });

type RawRow = Record<string, unknown>;
type Account = { id: string; balanceCents: number };
type Booking = { id: string; accountId: string; amountCents: number; status: string };

// Only the disposable isolated-ledger database is read; no test query changes stored rows.
function rawState(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      bookings: db.prepare('SELECT * FROM booking ORDER BY id').all() as RawRow[],
      splits: db.prepare('SELECT * FROM booking_split ORDER BY id').all() as RawRow[],
      audit: db.prepare('SELECT * FROM audit_log ORDER BY id').all() as RawRow[],
    };
  } finally {
    db.close();
  }
}

async function post<T>(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(`/api${path}`, { headers: { origin }, data });
  expect(response.status(), path).toBe(201);
  return (await response.json()) as T;
}

async function accountBalances(request: APIRequestContext, first: string, second: string) {
  const response = await request.get('/api/accounts');
  expect(response.status()).toBe(200);
  const { accounts } = (await response.json()) as { accounts: Account[] };
  expect(accounts.find((account) => account.id === first)?.balanceCents).toBe(98199);
  expect(accounts.find((account) => account.id === second)?.balanceCents).toBe(49110);
}

async function accountRows(request: APIRequestContext, accountId: string) {
  const response = await request.get(`/api/bookings?accountId=${accountId}&to=2026-10-19`);
  expect(response.status()).toBe(200);
  return (await response.json()) as { items: Booking[]; total: number; sumCents: number };
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const card = await page.locator('.kaccount-table-card').boundingBox();
  expect(card).not.toBeNull();
  for (const cell of await page.locator('.ktx-account .kx-status').all()) {
    const box = await cell.boundingBox();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(card!.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
  }
}

test('pending and confirmed account rows remain distinct, readable and read-only until explicit confirmation and undo', async ({
  page,
  request,
  baseURL,
  isolatedLedger,
}, info) => {
  // Two themes, full existing edit/confirm/undo flows and raw read-only comparisons are one case.
  test.setTimeout(90_000);
  const origin = baseURL!;
  const tag = `Synthetic632 ${info.project.name} ${info.retry} ${info.repeatEachIndex}`;
  const first = await post<{ account: Account }>(request, origin, '/accounts', {
    name: `${tag} Giro A`,
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const second = await post<{ account: Account }>(request, origin, '/accounts', {
    name: `${tag} Giro B`,
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 50000,
  });
  const pending = await post<{ id: string }>(request, origin, '/bookings', {
    type: 'booking',
    accountId: first.account.id,
    date: '2026-10-18',
    amountCents: -1234,
    status: 'pending',
    payeeName: `${tag} offen`,
  });
  const confirmed = await post<{ id: string }>(request, origin, '/bookings', {
    type: 'booking',
    accountId: first.account.id,
    date: '2026-10-18',
    amountCents: -567,
    status: 'confirmed',
    payeeName: `${tag} bestaetigt`,
  });
  const other = await post<{ id: string }>(request, origin, '/bookings', {
    type: 'booking',
    accountId: second.account.id,
    date: '2026-10-18',
    amountCents: -890,
    status: 'pending',
    payeeName: `${tag} anderes Konto`,
  });
  await post(request, origin, '/expected', {
    name: `${tag} geplant`,
    accountId: first.account.id,
    kind: 'outflow',
    rhythm: 'monthly',
    dueDay: 20,
    startDate: '2026-10-20',
    validFrom: '2026-10-20',
    amountCents: 2500,
  });
  const baseline = rawState(isolatedLedger.databasePath);
  expect(baseline.bookings).toHaveLength(3);
  await accountBalances(request, first.account.id, second.account.id);
  const writes: { method: string; path: string; body: unknown }[] = [];
  const reads: URL[] = [];
  page.on('request', (incoming) => {
    const url = new URL(incoming.url());
    if (incoming.method() === 'GET' && url.pathname === '/api/bookings') reads.push(url);
    if (
      incoming.method() !== 'GET' &&
      /^\/api\/(?:bookings(?:\/|$)|undo$|expected(?:\/|$))/.test(url.pathname)
    ) {
      writes.push({
        method: incoming.method(),
        path: url.pathname,
        body: incoming.postDataJSON() as unknown,
      });
    }
  });

  // A deliberately restrictive global filter must neither hide pending account rows nor leak B.
  await page.goto(`/konten/buchungen?konto=${first.account.id}&status=confirmed`);
  await expect(page.locator('.ktx-all [data-booking]')).toHaveCount(1);
  await expect(page.locator(`[data-booking="${confirmed.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-booking="${pending.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-booking="${other.id}"]`)).toHaveCount(0);
  expect(reads.some((url) => url.searchParams.get('status') === 'confirmed')).toBe(true);

  const accountUrl = `/konten/${first.account.id}`;
  await page.goto(accountUrl);
  const history = page.locator('.ktx-account [data-booking]:not(.is-upcoming)');
  const pendingRow = page.locator(`[data-booking="${pending.id}"]`);
  const confirmedRow = page.locator(`[data-booking="${confirmed.id}"]`);
  const assertRows = async () => {
    await expect(history).toHaveCount(2);
    await expect(pendingRow).toHaveCount(1);
    await expect(confirmedRow).toHaveCount(1);
    await expect(pendingRow.getByRole('button', { name: 'vorgemerkt', exact: true })).toBeVisible();
    await expect(
      confirmedRow.getByRole('button', { name: 'bestätigt', exact: true }),
    ).toBeVisible();
    await expect(page.locator(`[data-booking="${other.id}"]`)).toHaveCount(0);
    await expect(page.getByTestId('account-balance')).toHaveText('981,99 €');
  };
  await assertRows();
  await page.reload();
  await assertRows();
  const historyReads = reads.filter(
    (url) =>
      url.searchParams.get('accountId') === first.account.id &&
      url.searchParams.get('to') === '2026-10-19' &&
      url.searchParams.get('limit') === '100',
  );
  expect(historyReads.length).toBeGreaterThanOrEqual(2);
  expect(historyReads.every((url) => !url.searchParams.has('status'))).toBe(true);

  // The planned occurrence remains #579's separate collapsed row, never a pending booking.
  const upcoming = page.locator('.kupcoming-toggle');
  await expect(upcoming).toHaveText(`1 kommend · nächste: ${tag} geplant 20.10.`);
  await expect(upcoming).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-occurrence]')).toHaveCount(0);
  await upcoming.click();
  const planned = page.locator('.kupcoming [data-occurrence]');
  await expect(planned).toHaveCount(1);
  await expect(planned.getByRole('img', { name: 'Nächste Wiederholung' })).toBeVisible();
  await expect(page.locator('.kupcoming [data-booking]')).toHaveCount(0);
  await assertRows();
  await upcoming.click();
  await expect(upcoming).toHaveAttribute('aria-expanded', 'false');

  const phone = page.viewportSize()!.width < 768;
  expect(page.viewportSize()!.width).toBe(phone ? 390 : 1440);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await assertRows();
    await noOverflow(page);
    if (phone) {
      for (const row of [pendingRow, confirmedRow]) {
        for (const button of await row.getByRole('button').all()) {
          if (!(await button.isVisible())) continue;
          const box = await button.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await history.first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`account-pending-${theme}.png`),
      fullPage: false,
    });
    expect(rawState(isolatedLedger.databasePath)).toEqual(baseline);
    expect(writes).toEqual([]);
  }
  // Finish both captures before Axe can move focus in either theme.
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    await assertRows();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(rawState(isolatedLedger.databasePath)).toEqual(baseline);
    expect(writes).toEqual([]);
  }

  await pendingRow.getByRole('button', { name: / bearbeiten · / }).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(edit).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Vorgemerkt', exact: true })).toBeVisible();
  await edit.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(edit).toBeHidden();
  expect(rawState(isolatedLedger.databasePath)).toEqual(baseline);
  expect(writes).toEqual([]);

  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/bookings/${pending.id}` &&
      response.request().method() === 'PATCH',
  );
  await pendingRow.getByRole('button', { name: 'vorgemerkt', exact: true }).click();
  const acknowledgment = await saved;
  expect(acknowledgment.status()).toBe(200);
  expect(acknowledgment.request().postDataJSON()).toEqual({ status: 'confirmed' });
  const { groupId } = (await acknowledgment.json()) as { groupId: string };
  await expect(pendingRow.getByRole('button', { name: 'bestätigt', exact: true })).toBeVisible();
  await expect(history).toHaveCount(2);
  const afterConfirm = rawState(isolatedLedger.databasePath);
  const changed = afterConfirm.bookings.find((row) => row['id'] === pending.id)!;
  expect(changed['updated_at']).toEqual(expect.any(String));
  expect(afterConfirm.bookings).toEqual(
    baseline.bookings.map((row) =>
      row['id'] === pending.id
        ? { ...row, status: 'confirmed', updated_at: changed['updated_at'] }
        : row,
    ),
  );
  expect(afterConfirm.splits).toEqual(baseline.splits);
  const addedAudit = afterConfirm.audit.filter(
    (row) => !baseline.audit.some((original) => original['id'] === row['id']),
  );
  expect(
    afterConfirm.audit.filter((row) =>
      baseline.audit.some((original) => original['id'] === row['id']),
    ),
  ).toEqual(baseline.audit);
  expect(addedAudit).toHaveLength(1);
  expect(addedAudit[0]).toMatchObject({
    action: 'update',
    entity_type: 'booking',
    entity_id: pending.id,
    group_id: groupId,
  });
  await accountBalances(request, first.account.id, second.account.id);
  expect(writes).toEqual([
    { method: 'PATCH', path: `/api/bookings/${pending.id}`, body: { status: 'confirmed' } },
  ]);

  const undone = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/undo' && response.request().method() === 'POST',
  );
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  expect((await undone).status()).toBe(200);
  await assertRows();
  const afterUndo = rawState(isolatedLedger.databasePath);
  const restored = afterUndo.bookings.find((row) => row['id'] === pending.id)!;
  expect(afterUndo.bookings).toEqual(
    baseline.bookings.map((row) =>
      row['id'] === pending.id ? { ...row, updated_at: restored['updated_at'] } : row,
    ),
  );
  expect(afterUndo.splits).toEqual(baseline.splits);
  const undoAudit = afterUndo.audit.filter(
    (row) => !afterConfirm.audit.some((original) => original['id'] === row['id']),
  );
  expect(
    afterUndo.audit.filter((row) =>
      afterConfirm.audit.some((original) => original['id'] === row['id']),
    ),
  ).toEqual(afterConfirm.audit);
  expect(undoAudit).toHaveLength(1);
  expect(undoAudit[0]).toMatchObject({
    action: 'undo',
    entity_type: 'booking',
    entity_id: pending.id,
    undo_of_id: addedAudit[0]!['id'],
  });
  await accountBalances(request, first.account.id, second.account.id);
  const firstRows = await accountRows(request, first.account.id);
  expect(firstRows.total).toBe(2);
  expect(firstRows.sumCents).toBe(-1801);
  expect(firstRows.items.map((row) => row.id).sort()).toEqual([pending.id, confirmed.id].sort());
  expect(firstRows.items.find((row) => row.id === pending.id)).toMatchObject({
    accountId: first.account.id,
    status: 'pending',
    amountCents: -1234,
  });
  expect((await accountRows(request, second.account.id)).items).toEqual([
    expect.objectContaining({ id: other.id, status: 'pending', amountCents: -890 }),
  ]);
  expect(writes.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: 'PATCH', path: `/api/bookings/${pending.id}` },
    { method: 'POST', path: '/api/undo' },
  ]);
  const proofPath = info.outputPath('account-pending-632-proof.json');
  await writeFile(
    proofPath,
    JSON.stringify({
      browserName: page.context().browser()!.browserType().name(),
      viewport: page.viewportSize(),
      accountHistoryReadCount: historyReads.length,
      accountHistoryStatusFilterAbsent: historyReads.every(
        (url) => !url.searchParams.has('status'),
      ),
      persistedBookingCount: baseline.bookings.length,
      unchangedAuditCountDuringDisplay: baseline.audit.length,
      expectedAccountBalanceCents: 98199,
      expectedOtherBalanceCents: 49110,
      explicitConfirmationAuditCount: addedAudit.length,
      explicitUndoAuditCount: undoAudit.length,
      plannedOccurrenceWasNeverBooked: true,
    }),
  );
  await info.attach('account-pending-632-proof.json', {
    path: proofPath,
    contentType: 'application/json',
  });
});
