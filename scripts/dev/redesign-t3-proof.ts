import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { Heute } from '../../apps/web/src/heute/api';

const root = resolve(import.meta.dirname, '../..');

async function investmentScreenshots(page: Page, state: 'basis' | 'chain' | 'sources') {
  const output = join(root, 'test-results/redesign-investment');
  mkdirSync(output, { recursive: true });
  const previous = await page.locator('html').getAttribute('data-theme');
  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(async (value) => {
        document.documentElement.dataset['theme'] = value;
        await document.fonts.ready;
      }, theme);
      const selector =
        state === 'basis'
          ? '.heute-wealth-line'
          : state === 'chain'
            ? '.heute-net-worth'
            : '#anlagebasis';
      const target = page.locator(selector);
      await target.evaluate((element) =>
        element.scrollIntoView({ block: 'center', inline: 'nearest' }),
      );
      const bounds = await target.boundingBox();
      if (!bounds) throw new Error('Investment screenshot target has no layout bounds');
      const tabbar = page.locator('.tabbar');
      const tabbarBounds = (await tabbar.isVisible()) ? await tabbar.boundingBox() : null;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        page.viewportSize()!.height - (tabbarBounds?.height ?? 0),
      );
      const header = page.locator('.m-head');
      const headerBounds = (await header.isVisible()) ? await header.boundingBox() : null;
      expect(bounds.y).toBeGreaterThanOrEqual(
        headerBounds ? headerBounds.y + headerBounds.height : 0,
      );
      await target.screenshot({
        path: join(output, `investment-${page.viewportSize()!.width}-${state}-${theme}.png`),
        animations: 'disabled',
      });
    }
  } finally {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate((value) => {
      if (value === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.dataset['theme'] = value;
    }, previous);
  }
}

export async function verifyT3InvestmentBasis(page: Page, origin: string, bookmark: string) {
  const groups: string[] = [];
  const headers = { origin };
  try {
    for (const [name, type, role, onBudget, openingBalanceCents] of [
      ['T3 budget', 'checking', 'budget', true, 100_000],
      ['T3 selected positive', 'brokerage', 'investment', false, 20_000],
      ['T3 selected negative', 'brokerage', 'investment', false, -3_000],
      ['T3 debt credit', 'checking', 'debt', false, 500],
      ['T3 loan', 'loan', 'debt', false, -7_000],
    ] as const) {
      const response = await page.request.post(`${origin}/api/accounts`, {
        headers,
        data: {
          name,
          type,
          role,
          onBudget,
          openingDate: '2026-09-17',
          openingBalanceCents,
        },
      });
      expect(response.ok()).toBe(true);
      const result = (await response.json()) as { groupId: string };
      groups.push(result.groupId);
    }
    const response = await page.request.get(`${origin}/api/heute?period=month&month=2026-09`);
    expect(response.ok()).toBe(true);
    const source = (await response.json()) as Heute;
    expect(source.investmentBasis).toMatchObject({ asOf: '2026-09-17', investedCents: 17_000 });
    expect(source.netWorth).toMatchObject({
      investedCents: 20_000,
      debtCents: -9_500,
      totalCents: 110_500,
      assetsCents: 120_500,
      liabilitiesCents: 10_000,
    });
    for (const [path, field] of [
      ['/wealth/freedom', 'investedCents'],
      ['/portfolio/allocation', 'valueCents'],
    ] as const) {
      const read = await page.request.get(`${origin}/api${path}`);
      expect(read.ok()).toBe(true);
      expect((await read.json())[field]).toBe(17_000);
    }
    await page.clock.setFixedTime(new Date('2026-09-17T08:30:00+02:00'));
    await page.goto(`${origin}/?monat=2026-09&period=month`);
    await page.locator('.hv-net-value > a').click();
    const basis = page.getByRole('region', { name: 'Investiert · Anlagebasis', exact: true });
    await expect(basis).toContainText('170,00');
    const more = page.getByRole('button', { name: 'Mehr zum Monat', exact: true });
    if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
    const chain = page.getByTestId('heute-networth-chart');
    await expect(chain.getByRole('button', { name: /Anlagen.*200,00/ })).toBeVisible();
    await expect(chain.getByRole('button', { name: /Schulden \(netto\).*95,00/ })).toBeVisible();
    await investmentScreenshots(page, 'basis');
    await investmentScreenshots(page, 'chain');
    await basis
      .getByRole('link', { name: 'Anlagebasis ansehen · Quelle der Anlagebasis', exact: true })
      .click();
    const target = page.locator('#anlagebasis-title');
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/heute/details/invested' &&
        url.searchParams.get('monat') === '2026-09' &&
        url.searchParams.get('period') === 'month' &&
        url.hash === '#anlagebasis',
    );
    await expect(target).toBeFocused();
    await page.reload();
    await expect(target).toBeFocused();
    const sources = page.locator('#anlagebasis');
    await expect(sources).toContainText('Beitrag zur Anlagebasis');
    await expect(sources).toContainText('−30,00');
    await expect(sources).toContainText('200,00');
    await expect(sources.getByRole('listitem')).toHaveCount(2);
    await expect(
      sources.getByRole('link', { name: 'T3 selected negative', exact: true }),
    ).toHaveAttribute('href', /monat=2026-09&period=month/);
    await investmentScreenshots(page, 'sources');
    await page.getByRole('link', { name: 'Zurück zu Heute', exact: true }).click();
    await expect(basis).toContainText('170,00');
    await page.goBack();
    await expect(target).toBeFocused();
    console.log(
      'PASS T3: selected17000 versus positive20000/net-debt-9500, source context, reload and Back focus',
    );
  } finally {
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
