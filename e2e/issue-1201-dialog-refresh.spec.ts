import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureSaveControl, pickCategory } from './ledger-helpers';

async function setup(page: Page, origin: string) {
  const send = async (method: string, path: string, data: unknown) => {
    const response = await page.request.fetch(`/api${path}`, { method, headers: { origin }, data });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Synthetic dialog cash',
    type: 'checking',
    openingDate: '2026-10-01',
    openingBalanceCents: 10000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Synthetic dialog group' });
  const { category } = await send('POST', '/categories', {
    name: 'Synthetic dialog category',
    groupId: group.id,
    kind: 'variable',
    class: 'need',
    stage: 2,
  });
  return { send, account, category };
}

/** Hold reads until after asserting close: no timing threshold can accidentally accept a refetch. */
async function closesBeforeReads(
  page: Page,
  dialog: Locator,
  save: Locator,
  writePath: string,
  info: TestInfo,
) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  let writing = false;
  let acknowledged = false;
  let reads = 0;
  let finishedReads = 0;
  let started = 0;
  let writeMs = 0;
  let serverWriteMs = 0;
  let clicked = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && writing) {
      reads++;
      await held;
      await route.continue();
      finishedReads++;
      return;
    }
    if (request.method() !== 'GET' && new URL(request.url()).pathname === writePath) {
      writing = true;
      started = Date.now();
      await writeGate;
      await new Promise((resolve) => setTimeout(resolve, 800));
      const serverStarted = Date.now();
      const response = await route.fetch();
      serverWriteMs = Date.now() - serverStarted;
      expect(response.ok()).toBe(true);
      writeMs = Date.now() - started;
      acknowledged = true;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  try {
    clicked = Date.now();
    await save.click();
    await expect.poll(() => writing).toBe(true);
    await expect(dialog).toBeVisible();
    await expect(save).toBeDisabled();
    expect(acknowledged).toBe(false);
    releaseWrite();
    await expect(dialog).toBeHidden();
    const clickToHiddenMs = Date.now() - clicked;
    expect(acknowledged).toBe(true);
    await expect.poll(() => reads).toBeGreaterThan(0);
    expect(finishedReads).toBe(0);
    // Retained figures must visibly remain provisional until the held reads finish.
    const pending = page.locator('.kacct[aria-busy="true"], .plan[aria-busy="true"]');
    await expect(pending).toBeVisible();
    await expect(
      pending.getByRole('status').filter({ hasText: 'werden geladen' }).first(),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('pending-refresh.png'), fullPage: true });
    await info.attach('synthetic-write-close-timing', {
      contentType: 'application/json',
      body: JSON.stringify({
        writePath,
        injectedWriteDelayMs: 800,
        writeMs,
        serverWriteMs,
        clickToHiddenMs,
        heldReads: reads,
        finishedReads,
      }),
    });
  } finally {
    releaseWrite();
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
}

for (const mode of ['capture', 'edit', 'transfer'] as const) {
  test(`1201 ${mode} closes after write success while follow-up reads remain held`, async ({
    page,
    baseURL,
  }, info) => {
    const { send, account, category } = await setup(page, baseURL!);
    let bookingId: string | undefined;
    if (mode === 'edit') {
      const result = await send('POST', '/bookings', {
        type: 'booking',
        accountId: account.id,
        date: '2026-10-02',
        amountCents: -100,
        payeeName: 'Synthetic edit shop',
        status: 'pending',
        splits: [{ categoryId: category.id, amountCents: -100 }],
      });
      bookingId = result.bookings[0].id;
      await page.goto(`/konten/${account.id}`);
      await page
        .getByRole('row', { name: /Synthetic edit shop/ })
        .getByRole('button', { name: /bearbeiten/ })
        .click();
    } else {
      if (mode === 'transfer')
        await send('POST', '/accounts', {
          name: 'Synthetic destination',
          type: 'savings',
          openingDate: '2026-10-01',
          openingBalanceCents: 0,
        });
      await page.goto(`/konten/${account.id}?panel=buchung`);
    }
    const dialog = page.getByRole('dialog', {
      name: mode === 'edit' ? 'Buchung bearbeiten' : 'Buchung erfassen',
      exact: true,
    });
    if (mode === 'transfer') {
      await dialog.getByRole('button', { name: 'Umbuchung', exact: true }).click();
      await dialog.getByLabel('Nach Konto').selectOption({ label: 'Synthetic destination' });
    } else if (mode === 'capture') {
      await dialog.getByLabel('Empfänger', { exact: true }).fill('Synthetic capture shop');
      await pickCategory(dialog, 'Synthetic dialog category');
    }
    await dialog.getByLabel('Betrag', { exact: true }).fill('2,00');
    await closesBeforeReads(
      page,
      dialog,
      captureSaveControl(dialog),
      bookingId ? `/api/bookings/${bookingId}` : '/api/bookings',
      info,
    );
    await expect(page.getByTestId('account-balance')).toHaveText('98,00 €');
  });
}

test('1201 a refused edit keeps the entered draft and error visible', async ({ page, baseURL }) => {
  const { send, account, category } = await setup(page, baseURL!);
  const result = await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -100,
    payeeName: 'Synthetic refused shop',
    status: 'pending',
    splits: [{ categoryId: category.id, amountCents: -100 }],
  });
  await page.goto(`/konten/${account.id}`);
  await page
    .getByRole('row', { name: /Synthetic refused shop/ })
    .getByRole('button', { name: /bearbeiten/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
  await dialog.getByLabel('Betrag', { exact: true }).fill('2,00');
  await page.route(`**/api/bookings/${result.bookings[0].id}`, (route) =>
    route.fulfill({
      status: 422,
      json: { error: 'invariant', message: 'Synthetischer Prüffehler.' },
    }),
  );
  await captureSaveControl(dialog).click();
  await expect(dialog.getByRole('alert')).toContainText('Synthetischer Prüffehler.');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('2,00');
  const stored = await page.request.get(`/api/bookings/${result.bookings[0].id}`);
  expect((await stored.json()).booking.amountCents).toBe(-100);
});

test('1201 all-target dialog closes without awaiting the budget refresh', async ({
  page,
  baseURL,
}, info) => {
  const { send, category } = await setup(page, baseURL!);
  await send('PUT', `/categories/${category.id}/target`, {
    validFrom: '2026-10',
    target: { kind: 'monthly', amountCents: 1000 },
  });
  await page.goto('/plan/monat?monat=2026-10');
  await page.locator('.plan-menu-verteilen > summary').click();
  await page.getByRole('button', { name: 'Alle Ziele füllen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Alle Ziele füllen', exact: true });
  await closesBeforeReads(
    page,
    dialog,
    dialog.getByRole('button', { name: '10,00 € zuweisen', exact: true }),
    '/api/budget/2026-10/assigned',
    info,
  );
});

test('1201 envelope cover dialog closes without awaiting the budget refresh', async ({
  page,
  baseURL,
}, info) => {
  const { send, account, category } = await setup(page, baseURL!);
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-02',
    amountCents: -1000,
    status: 'confirmed',
    splits: [{ categoryId: category.id, amountCents: -1000 }],
  });
  await page.goto(`/plan/monat/envelope/${category.id}?monat=2026-10`);
  await page.getByRole('button', { name: 'Zuweisen oder verschieben' }).click();
  const dialog = page.getByRole('dialog', { name: 'Synthetic dialog category', exact: true });
  await closesBeforeReads(
    page,
    dialog,
    dialog.getByRole('button', { name: 'Decken · 10,00 €', exact: true }),
    '/api/budget/2026-10/cover',
    info,
  );
});
