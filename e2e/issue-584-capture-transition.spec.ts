import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-02' });

type Seed = { accountId: string; categories: { id: string; name: string }[] };
type Split = { categoryId: string; amountCents: number };
type Stored = { id: string; accountId: string; amountCents: number; splits: Split[] };

async function seed(request: APIRequestContext, origin: string): Promise<Seed> {
  async function post<T>(path: string, data: unknown): Promise<T> {
    const response = await request.post(`${origin}/api${path}`, { data, headers: { origin } });
    expect(response.status(), await response.text()).toBe(201);
    return response.json() as Promise<T>;
  }
  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: '584 Synthetic capture account',
    type: 'checking',
    onBudget: true,
    role: 'budget',
    openingDate: '2026-10-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post<{ group: { id: string } }>('/categories/groups', {
    name: '584 Synthetic capture categories',
  });
  const categories = [];
  for (const name of ['584 Alpha', '584 Beta', '584 Gamma']) {
    const { category } = await post<{ category: { id: string; name: string } }>('/categories', {
      name,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 2,
    });
    categories.push(category);
  }
  return { accountId: account.id, categories };
}

function database(path: string, accountId: string) {
  const opened = openDatabase(path);
  try {
    const bookings = opened.db
      .select()
      .from(schema.booking)
      .all()
      .filter((row) => row.accountId === accountId && row.deletedAt === null);
    const ids = new Set(bookings.map((row) => row.id));
    const splits = opened.db
      .select()
      .from(schema.bookingSplit)
      .all()
      .filter((row) => ids.has(row.bookingId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { bookings, splits };
  } finally {
    opened.close();
  }
}

async function choose(dialog: Locator, label: string, name: string) {
  await dialog.getByLabel(label, { exact: true }).fill(name);
  await dialog
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(`^${name}`) })
    .click();
}

async function picture(page: Page, dialog: Locator, stage: string, info: TestInfo) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  if (page.viewportSize()!.width === 390) {
    const controls = await dialog
      .locator('button, input:not([aria-hidden="true"]), select, textarea, summary')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            name: el.getAttribute('aria-label') ?? el.textContent ?? el.tagName,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
      );
    for (const control of controls) {
      expect(control.width, control.name).toBeGreaterThanOrEqual(44);
      expect(control.height, control.name).toBeGreaterThanOrEqual(44);
    }
  }
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  if (stage.startsWith('two-') || stage.startsWith('three-'))
    await dialog.locator('.kdiff').scrollIntoViewIfNeeded();
  else
    await dialog.locator('.bk-body').evaluate((el) => {
      el.scrollTop = 0;
    });
  const path = info.outputPath(`capture-584-${stage}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(stage, { path, contentType: 'image/png' });
}

async function scene(
  page: Page,
  ids: Seed,
  databasePath: string,
  theme: 'light' | 'dark',
  info: TestInfo,
) {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/bookings')
      writes.push(request.postData() ?? '');
  });
  const stored = async () => {
    const response = await page.request.get(`/api/bookings?accountId=${ids.accountId}`);
    expect(response.status()).toBe(200);
    return (await response.json()).items as Stored[];
  };
  const balance = async () => {
    const response = await page.request.get(`/api/accounts/${ids.accountId}`);
    expect(response.status()).toBe(200);
    return (await response.json()).account.balanceCents as number;
  };
  const open = async (payee: string) => {
    await page.goto(`/konten/${ids.accountId}?panel=buchung`);
    const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Betrag', { exact: true }).fill('10,00');
    await dialog.getByLabel('Empfänger', { exact: true }).fill(payee);
    await dialog.getByLabel('Bezahlt von', { exact: true }).selectOption(ids.accountId);
    await choose(dialog, 'Kategorie', ids.categories[0]!.name);
    return dialog;
  };
  const saveAndUndo = async (dialog: Locator, expected: Split[]) => {
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/bookings',
    );
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const result = (await response.json()) as { groupId: string; bookings: Stored[] };
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({ accountId: ids.accountId, amountCents: -1000 });
    await expect(dialog).toBeHidden();
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: result.bookings[0]!.id, amountCents: -1000 });
    expect(
      rows[0]!.splits.map(({ categoryId, amountCents }) => ({ categoryId, amountCents })),
    ).toEqual(expected);
    const db = database(databasePath, ids.accountId);
    expect(db.bookings).toHaveLength(1);
    expect(db.bookings[0]).toMatchObject({ id: result.bookings[0]!.id, amountCents: -1000 });
    expect(db.splits.map(({ categoryId, amountCents }) => ({ categoryId, amountCents }))).toEqual(
      expected,
    );
    expect(await balance()).toBe(99000);
    const undone = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/undo',
    );
    await page
      .locator('.toast.is-open')
      .getByRole('button', { name: 'Rückgängig', exact: true })
      .click();
    const undo = await undone;
    expect(undo.status()).toBe(200);
    expect(undo.request().postDataJSON()).toMatchObject({ groupId: result.groupId });
    expect(await stored()).toEqual([]);
    expect(database(databasePath, ids.accountId)).toEqual({ bookings: [], splits: [] });
    expect((await page.request.get(`/api/bookings/${result.bookings[0]!.id}`)).status()).toBe(404);
    expect(await balance()).toBe(100000);
    return { amountCents: -1000, splits: expected, undoRestoredCents: 100000 };
  };

  expect(await stored()).toEqual([]);
  const dialog = await open('584 Synthetic transition');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const head = dialog.getByLabel('Betrag', { exact: true });
  await expect(dialog.locator('input.amount-input')).toHaveCount(1);
  await expect(dialog.getByLabel(/^Betrag \d+$/)).toHaveCount(0);
  await picture(page, dialog, 'one-before', info);
  await dialog.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
  await expect(dialog.locator('input.amount-input')).toHaveCount(3);
  await expect(dialog.getByLabel(/^Betrag \d+$/)).toHaveCount(2);
  await dialog.getByLabel('Betrag 1', { exact: true }).fill('6,00');
  await choose(dialog, 'Kategorie 2', ids.categories[1]!.name);
  await dialog.getByLabel('Betrag 2', { exact: true }).fill('3,99');
  await expect(dialog.getByText('Rest: 0,01 €', { exact: false })).toBeVisible();
  await expect(
    dialog.getByText(
      '· Speichern geht erst, wenn alle Zeilen gültig sind und der Rest 0,00 € ist.',
      { exact: true },
    ),
  ).toBeVisible();
  for (const name of ['Speichern', 'Speichern und neu'])
    await expect(dialog.getByRole('button', { name, exact: true })).toBeDisabled();
  // The real Ctrl+Enter save handler must refuse the incomplete split as well.
  await dialog.getByLabel('Notiz', { exact: true }).press('Control+Enter');
  await expect(
    dialog.getByText('Speichern geht erst, wenn der Rest 0,00 € ist.', { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(writes).toEqual([]);
  expect(await stored()).toEqual([]);
  expect(database(databasePath, ids.accountId)).toEqual({ bookings: [], splits: [] });
  expect(await balance()).toBe(100000);
  await picture(page, dialog, 'two-nonzero-rest', info);
  await dialog.getByLabel('Betrag 2', { exact: true }).fill('4,00');
  await expect(dialog.getByText('Rest: 0,00 €', { exact: false })).toBeVisible();
  await expect(
    dialog.getByText('Speichern geht erst, wenn der Rest 0,00 € ist.', { exact: true }),
  ).toHaveCount(0);
  for (const label of ['Kategorie 1', 'Kategorie 2'])
    await expect(dialog.getByLabel(label, { exact: true })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Zeile 2 entfernen', exact: true }).click();
  await expect(head).toHaveValue('10,00');
  await expect(dialog.getByRole('group', { name: /^Zeile \d+$/ })).toHaveCount(1);
  await expect(dialog.locator('input.amount-input')).toHaveCount(1);
  await expect(dialog.getByLabel(/^Betrag \d+$/)).toHaveCount(0);
  await expect(dialog.getByText(/^Rest:/)).toHaveCount(0);
  await expect(
    dialog.getByText('Speichern geht erst, wenn der Rest 0,00 € ist.', { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel('Kategorie', { exact: true })).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  await picture(page, dialog, 'one-after', info);
  const single = await saveAndUndo(dialog, [
    { categoryId: ids.categories[0]!.id, amountCents: -1000 },
  ]);

  const odd = await open('584 Synthetic odd cents');
  await odd.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
  await odd.getByLabel('Betrag 1', { exact: true }).fill('3,34');
  await choose(odd, 'Kategorie 2', ids.categories[1]!.name);
  await odd.getByLabel('Betrag 2', { exact: true }).fill('3,33');
  await odd.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
  await choose(odd, 'Kategorie 3', ids.categories[2]!.name);
  await odd.getByLabel('Betrag 3', { exact: true }).fill('3,33');
  await expect(odd.locator('input.amount-input')).toHaveCount(4);
  await expect(odd.getByLabel('Betrag', { exact: true })).toHaveValue('10,00');
  await expect(odd.getByText('Rest: 0,00 €', { exact: false })).toBeVisible();
  await expect(odd.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
  await picture(page, odd, 'three-exact-334-333-333', info);
  const oddCents = await saveAndUndo(odd, [
    { categoryId: ids.categories[0]!.id, amountCents: -334 },
    { categoryId: ids.categories[1]!.id, amountCents: -333 },
    { categoryId: ids.categories[2]!.id, amountCents: -333 },
  ]);
  expect(writes).toHaveLength(2);
  await info.attach('capture-584-receipt', {
    contentType: 'application/json',
    body: JSON.stringify({
      browser: page.context().browser()!.browserType().name(),
      viewport: page.viewportSize(),
      theme,
      single,
      oddCents,
      realBookingPosts: writes.length,
    }),
  });
}

// Four declarations per configured engine; the configured profile retains that project's height/touch.
for (const profile of ['desktop', 'configured'] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`584 capture transitions ${profile} ${theme}`, async ({
      page,
      request,
      browser,
      isolatedLedger,
      ledgerToday,
    }, info) => {
      test.setTimeout(Math.max(90000, info.timeout));
      const ids = await seed(request, isolatedLedger.origin);
      if (profile === 'configured') {
        await page.setViewportSize({ width: 390, height: page.viewportSize()!.height });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.addInitScript((value) => {
          localStorage.setItem('budget-theme', value);
        }, theme);
        await scene(page, ids, isolatedLedger.databasePath, theme, info);
        return;
      }
      const context = await browser.newContext({
        baseURL: isolatedLedger.origin,
        storageState: isolatedLedger.storageState,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        colorScheme: theme,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      try {
        const desktop = await context.newPage();
        await desktop.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
        await desktop.addInitScript((value) => {
          localStorage.setItem('budget-theme', value);
        }, theme);
        await scene(desktop, ids, isolatedLedger.databasePath, theme, info);
      } finally {
        await context.close();
      }
    });
