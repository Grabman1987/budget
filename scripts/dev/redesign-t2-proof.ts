import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { Heute } from '../../apps/web/src/heute/api';

const root = resolve('.');

async function savedHeute(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const open = indexedDB.open('budget-offline-views');
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    try {
      return await new Promise<
        { key: string; fetchedAt: number; epoch: string; data: Heute } | undefined
      >((done, fail) => {
        const get = db.transaction('views', 'readonly').objectStore('views').get('heute');
        get.onsuccess = () => done(get.result);
        get.onerror = () => fail(get.error);
      });
    } finally {
      db.close();
    }
  });
}

async function forecastScreenshots(page: Page, state: 'online' | 'offline') {
  const output = join(root, 'test-results/redesign-forecast');
  mkdirSync(output, { recursive: true });
  const previousTheme = await page.locator('html').getAttribute('data-theme');
  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(async (value) => {
        document.documentElement.dataset['theme'] = value;
        await document.fonts.ready;
      }, theme);
      await page.getByRole('region', { name: 'Kontoprognose · 35 Tage', exact: true }).screenshot({
        path: join(output, `forecast-${page.viewportSize()!.width}-${state}-${theme}.png`),
        animations: 'disabled',
      });
    }
  } finally {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate((value) => {
      if (value === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.dataset['theme'] = value;
    }, previousTheme);
  }
}

/** Same real response and existing permission epoch, not a second offline forecast. */
export async function verifyT2Forecast(page: Page, origin: string, bookmark: string) {
  const groups: string[] = [];
  const headers = { origin };
  const post = async <T extends { groupId: string }>(path: string, data: unknown): Promise<T> => {
    const response = await page.request.post(`${origin}/api${path}`, { headers, data });
    expect(response.ok()).toBe(true);
    const result = (await response.json()) as T;
    groups.push(result.groupId);
    return result;
  };
  try {
    const { account } = await post<{ groupId: string; account: { id: string } }>('/accounts', {
      name: 'Synthetic T2 budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-17',
      openingBalanceCents: 100_000,
    });
    for (const [name, kind, date, dueDay, amountCents] of [
      ['Synthetic day10 outflow', 'outflow', '2026-09-27', 27, 12_500],
      ['Synthetic day20 salary', 'inflow', '2026-10-07', 7, 9_000],
    ] as const)
      await post('/expected', {
        name,
        kind,
        accountId: account.id,
        rhythm: 'monthly',
        startDate: date,
        endDate: date,
        validFrom: '2026-09-17',
        dueDay,
        dateShift: 'none',
        amountCents,
        ...(kind === 'inflow' ? { incomeTypeId: 'income-salary' } : {}),
      });
    await post('/liquidity/events', {
      name: 'Synthetic day35 event',
      date: '2026-10-22',
      amountCents: -100_000,
    });
    const response = await page.request.get(`${origin}/api/heute?period=month&month=2026-09`);
    expect(response.ok()).toBe(true);
    const source = (await response.json()) as Heute;
    expect(source.forecast35d).toMatchObject({
      asOf: '2026-09-17',
      horizon: '35d',
      levers: [],
      available: true,
      report: { low: { day: '2026-10-22', index: 35, cents: -3_500 } },
    });
    expect(source.forecast35d).not.toHaveProperty('events');
    expect(source.forecast35d).not.toHaveProperty('incomePauses');
    expect(source.forecast35d).not.toHaveProperty('report.verdict');
    expect(source.forecast35d).not.toHaveProperty('report.movements');
    await page.clock.setFixedTime(new Date('2026-09-17T08:30:00+02:00'));
    await page.goto(`${origin}/?monat=2026-09&period=month`);
    const live = page.getByRole('region', { name: 'Kontoprognose · 35 Tage', exact: true });
    await expect(live.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '-3500');
    await expect(live.locator('.heute-forecast-low')).toHaveAttribute('data-day', '2026-10-22');
    await expect(live.getByTestId('liquidity-lowpoint')).toHaveAttribute('data-cents', '-3500');
    await expect(live).toContainText('17.09.2026');
    // Permission is granted by the unchanged authenticated app, never by the smoke.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('budget-offline-read-epoch')))
      .not.toBeNull();
    await expect
      .poll(async () => (await savedHeute(page))?.data.forecast35d)
      .toEqual(source.forecast35d);
    const saved = (await savedHeute(page))!;
    expect(new URL(saved.key, origin).searchParams.get('month')).toBe('2026-09');
    expect(new URL(saved.key, origin).searchParams.get('period')).toBe('month');
    expect(saved.fetchedAt).toBe(Date.parse('2026-09-17T08:30:00+02:00'));
    expect(saved.epoch).toBeTruthy();
    await forecastScreenshots(page, 'online');
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toBeVisible();
    const offline = page.getByRole('region', { name: 'Kontoprognose · 35 Tage', exact: true });
    await expect(offline).toContainText('−35,00');
    await expect(offline).toContainText('22.10.2026');
    await expect(offline).toContainText('17.09.2026');
    await expect(
      offline
        .getByRole('list', { name: 'Gespeicherte 35-Tage-Kontoprognose' })
        .getByRole('listitem'),
    ).toHaveCount(36);
    expect((await savedHeute(page))?.fetchedAt).toBe(saved.fetchedAt);
    await forecastScreenshots(page, 'offline');
    await page.context().setOffline(false);
    await page.reload();
    await expect(live.locator('.heute-forecast-low')).toHaveAttribute('data-cents', '-3500');
    console.log(
      'PASS T2: literal day35 low, response-owned IndexedDB source, offline reload and reconnection',
    );
  } finally {
    await page.context().setOffline(false);
    // Only this smoke's fixture groups; do not sign out the shared bootstrap session.
    for (const groupId of groups.reverse()) {
      const response = await page.request.post(`${origin}/api/undo`, {
        headers,
        data: { groupId },
      });
      expect(response.ok()).toBe(true);
    }
    await page.goto(`${origin}${bookmark}`);
  }
}
