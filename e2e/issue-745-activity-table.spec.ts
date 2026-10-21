import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-15' });

interface Seed {
  accountId: string;
  categoryId: string;
  purchaseId: string;
  refundId: string;
}
interface Activity {
  activityBreakdown: {
    totalCents: number;
    count: number;
    pageCents: number;
    nextCursor: string | null;
    items: Array<{
      bookingId: string | null;
      splitId: string | null;
      contributionCents: number;
      sourceAmountCents: number | null;
      source: { bookingAmountCents: number } | null;
    }>;
  };
}

async function seed(request: APIRequestContext, origin: string): Promise<Seed> {
  async function post<T>(path: string, data: unknown): Promise<T> {
    const response = await request.post(`${origin}/api${path}`, { data, headers: { origin } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<T>;
  }
  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: '745 Girokonto',
    type: 'checking',
    role: 'budget',
    onBudget: true,
    openingDate: '2026-10-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post<{ group: { id: string } }>('/categories/groups', {
    name: '745 Tabelle',
  });
  const category = async (name: string) =>
    (
      await post<{ category: { id: string } }>('/categories', {
        name,
        groupId: group.id,
        class: 'need',
        kind: 'variable',
        stage: 2,
      })
    ).category.id;
  const categoryId = await category('745 Kategorie');
  const otherId = await category('745 Anderer Anteil');
  const purchase = await post<{ bookings: Array<{ id: string }> }>('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-05',
    amountCents: -2500,
    payeeName: '745 Gemeinsamer Einkauf',
    memo: '745 gemeinsamer Ursprung',
    status: 'pending',
    splits: [
      { categoryId, amountCents: -1200, memo: 'Erster Kategoriebeitrag' },
      { categoryId, amountCents: -800, memo: 'Zweiter Kategoriebeitrag' },
      { categoryId: otherId, amountCents: -500, memo: 'Unveränderter anderer Anteil' },
    ],
  });
  const refund = await post<{ bookings: Array<{ id: string }> }>('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-06',
    amountCents: 300,
    categoryId,
    payeeName: '745 Erstattung',
    memo: '745 separater Ursprung',
    status: 'confirmed',
  });
  expect(purchase.bookings).toHaveLength(1);
  expect(refund.bookings).toHaveLength(1);
  return {
    accountId: account.id,
    categoryId,
    purchaseId: purchase.bookings[0]!.id,
    refundId: refund.bookings[0]!.id,
  };
}

function snapshot(path: string) {
  const opened = openDatabase(path);
  try {
    return {
      accounts: opened.db.select().from(schema.account).all(),
      bookings: opened.db.select().from(schema.booking).all(),
      splits: opened.db.select().from(schema.bookingSplit).all(),
      audit: opened.db.select().from(schema.auditLog).all(),
    };
  } finally {
    opened.close();
  }
}

async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
}

async function target44(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const box = await target.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const owner = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      width: r.width,
      height: r.height,
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      owned: owner === element || (owner !== null && element.contains(owner)),
    };
  });
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.viewportWidth);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight);
  expect(box.owned).toBe(true);
}

async function scene(
  page: Page,
  ids: Seed,
  databasePath: string,
  profile: 'desktop' | 'configured',
  theme: 'light' | 'dark',
  info: TestInfo,
) {
  const before = snapshot(databasePath);
  const writes: string[] = [];
  const sourceReads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && request.method() !== 'GET')
      writes.push(`${request.method()} ${path}`);
    if (request.method() === 'GET' && path.startsWith('/api/bookings/')) sourceReads.push(path);
  });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(`/plan/monat/envelope/${ids.categoryId}?monat=2026-10`);
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  await expect(
    page.getByRole('heading', { name: '745 Kategorie · Oktober 2026', exact: true }),
  ).toBeVisible();
  const table = page.getByRole('table', { name: 'Kategoriebeiträge · 2026-10', exact: true });
  await expect(table).toBeVisible();
  expect(await table.locator('thead th').allTextContents()).toEqual([
    'Datum',
    'Buchung / Empfänger',
    'Konto',
    'Status',
    'Anteil dieser Kategorie',
  ]);
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  const data = await get<Activity>(page, `/api/budget/2026-10/activity/${ids.categoryId}`);
  expect(data.activityBreakdown).toMatchObject({
    totalCents: -1700,
    count: 3,
    pageCents: -1700,
    nextCursor: null,
  });
  expect(
    data.activityBreakdown.items.map((item) => item.contributionCents).sort((a, b) => a - b),
  ).toEqual([-1200, -800, 300]);
  const shared = data.activityBreakdown.items.filter((item) => item.bookingId === ids.purchaseId);
  expect(shared).toHaveLength(2);
  expect(shared.every((item) => item.splitId !== null)).toBe(true);
  expect(new Set(shared.map((item) => item.splitId)).size).toBe(2);
  expect(shared.map((item) => item.source!.bookingAmountCents)).toEqual([-2500, -2500]);
  const accounts = await get<{ accounts: Array<{ id: string; balanceCents: number }> }>(
    page,
    '/api/accounts',
  );
  expect(accounts.accounts.find((account) => account.id === ids.accountId)?.balanceCents).toBe(
    97800,
  );
  const literal = new Map([
    [-1200, '−12,00 €'],
    [-800, '−8,00 €'],
    [300, '+3,00 €'],
  ]);
  expect(await table.locator('tbody .activity-amount strong').allTextContents()).toEqual(
    data.activityBreakdown.items.map((item) => literal.get(item.contributionCents)),
  );
  await expect(table.getByText('Buchung gesamt: −25,00 €', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/^Aktivität gesamt:/)).toHaveText(
    'Aktivität gesamt: −17,00 € · 3 Einträge',
  );
  const sourceButtons = table.getByRole('button', { name: /Ursprungsbuchung öffnen/ });
  await expect(sourceButtons).toHaveCount(3);
  for (const target of await sourceButtons.all()) await target44(target);
  const geometry = await table.evaluate((element) => ({
    viewport: {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      coarse: matchMedia('(pointer: coarse)').matches,
    },
    scrollWidth: document.documentElement.scrollWidth,
    rows: [...element.querySelectorAll('tbody tr')].map((row) => {
      const button = row.querySelector<HTMLElement>('.activity-source-button')!;
      const description = row.querySelector<HTMLElement>('.activity-description')!;
      const visibleDates = [...row.querySelectorAll('time')].filter((date) =>
        date.checkVisibility(),
      );
      const date = visibleDates[0];
      const range = document.createRange();
      if (date) range.selectNodeContents(date);
      const dateRect = date?.getBoundingClientRect();
      const dateCellRect = date?.closest('td')?.getBoundingClientRect();
      return {
        visibleDateCount: visibleDates.length,
        dateLineCount: date
          ? [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).length
          : 0,
        dateInsideCell: Boolean(
          dateRect &&
          dateCellRect &&
          dateRect.left >= dateCellRect.left &&
          dateRect.right <= dateCellRect.right,
        ),
        rowHeight: row.getBoundingClientRect().height,
        descriptionWidth: description.getBoundingClientRect().width,
        buttonWidth: button.getBoundingClientRect().width,
        buttonHeight: button.getBoundingClientRect().height,
        clippedHorizontally: button.scrollWidth > button.clientWidth,
        clippedVertically: button.scrollHeight > button.clientHeight,
      };
    }),
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport.width);
  expect(geometry.viewport.width).toBe(profile === 'desktop' ? 1440 : 390);
  for (const row of geometry.rows) {
    expect(row.rowHeight).toBeGreaterThanOrEqual(44);
    expect(row.clippedHorizontally).toBe(false);
    expect(row.clippedVertically).toBe(false);
  }
  if (profile === 'configured') {
    await expect(table.getByRole('columnheader')).toHaveText([
      'Buchung / Empfänger',
      'Anteil dieser Kategorie',
    ]);
    for (const row of geometry.rows) {
      expect(row.descriptionWidth).toBeGreaterThanOrEqual(180);
      expect(row.rowHeight).toBeLessThanOrEqual(160);
      expect(row.visibleDateCount).toBe(1);
      expect(row.dateLineCount).toBe(1);
      expect(row.dateInsideCell).toBe(true);
    }
    for (const [index, row] of (await rows.all()).entries()) {
      const meta = row.locator('.activity-mobile-meta');
      await expect(meta).toBeVisible();
      await expect(meta.locator('.activity-mobile-date time')).toHaveText(
        index < 2 ? '05.10.2026' : '06.10.2026',
      );
      await expect(meta).toContainText(index < 2 ? '· Vorgemerkt' : '· Bestätigt');
      await expect(meta.locator('.activity-mobile-account')).toHaveText('Konto: 745 Girokonto');
      await expect(meta.locator('.activity-mobile-account')).toBeVisible();
    }
  } else await expect(table.getByRole('columnheader')).toHaveCount(5);
  await table.scrollIntoViewIfNeeded();
  const fullImage = info.outputPath(`activity-table-${profile}-${theme}.png`);
  const tableImage = info.outputPath(`activity-table-detail-${profile}-${theme}.png`);
  await page.screenshot({ path: fullImage, fullPage: true, animations: 'disabled' });
  await table.screenshot({ path: tableImage, animations: 'disabled' });
  await info.attach('Activity page original', { path: fullImage, contentType: 'image/png' });
  await info.attach('Activity table original', { path: tableImage, contentType: 'image/png' });
  const geometryPath = info.outputPath(`activity-table-${profile}-${theme}.json`);
  await writeFile(
    geometryPath,
    JSON.stringify(
      {
        ...geometry,
        profile,
        theme,
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
      },
      null,
      2,
    ),
  );
  await info.attach('Activity table geometry', {
    path: geometryPath,
    contentType: 'application/json',
  });
  await page.keyboard.press('Control+Shift+H');
  await expect(table).toContainText('•••');
  for (const value of ['12,00', '8,00', '25,00', '3,00'])
    await expect(table).not.toContainText(value);
  for (const button of await sourceButtons.all())
    expect(await button.getAttribute('aria-label')).not.toMatch(/12,00|8,00|25,00|3,00/);
  await expect(page.getByText(/^Aktivität gesamt:/)).toContainText('•••');
  await page.keyboard.press('Control+Shift+H');
  await expect(table).toContainText('−8,00 €');
  const axe = await new AxeBuilder({ page })
    .include('.plan-detail')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  const purchaseBefore = await get<{ booking: unknown }>(page, `/api/bookings/${ids.purchaseId}`);
  const open = table.getByRole('button', {
    name: 'Ursprungsbuchung öffnen · 745 Gemeinsamer Einkauf · 2026-10-05 · −8,00 €',
    exact: true,
  });
  await target44(open);
  await open.focus();
  const fresh = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/bookings/${ids.purchaseId}`,
  );
  await page.keyboard.press('Enter');
  expect((await fresh).status()).toBe(200);
  const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Datum', { exact: true })).toHaveValue('05.10.2026');
  await expect(dialog.getByLabel('Betrag', { exact: true })).toHaveValue('25,00');
  await expect(dialog.getByLabel('Notiz', { exact: true })).toHaveValue('745 gemeinsamer Ursprung');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(open).toBeFocused();
  expect(await get<{ booking: unknown }>(page, `/api/bookings/${ids.purchaseId}`)).toEqual(
    purchaseBefore,
  );
  expect(sourceReads).toEqual([`/api/bookings/${ids.purchaseId}`]);
  expect(writes).toEqual([]);
  expect(snapshot(databasePath)).toEqual(before);
}

for (const profile of ['desktop', 'configured'] as const)
  for (const theme of ['light', 'dark'] as const)
    test(`745 category contribution table ${profile} ${theme}`, async ({
      page,
      request,
      browser,
      isolatedLedger,
      ledgerToday,
    }, info) => {
      const ids = await seed(request, isolatedLedger.origin);
      if (profile === 'configured') {
        const inherited = page.viewportSize();
        expect(inherited).not.toBeNull();
        await page.setViewportSize({ width: 390, height: inherited!.height });
        await scene(page, ids, isolatedLedger.databasePath, profile, theme, info);
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
        await scene(desktop, ids, isolatedLedger.databasePath, profile, theme, info);
      } finally {
        await context.close();
      }
    });
