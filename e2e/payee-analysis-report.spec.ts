import AxeBuilder from '@axe-core/playwright';
import { formatEuro, cents } from '@budget/domain';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest, expect } from './sample';

function euro(value: number) {
  return formatEuro(cents(value));
}

sampleTest(
  'real sample payee report follows API periods, opens exact recipient bookings, and fits both themes',
  async ({ page }, info) => {
    const initial = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reports/payees' && url.searchParams.get('period') === '3J';
    });
    await page.goto('/reports/empfaenger?zeitraum=3J');
    const first = await initial;
    expect(first.status()).toBe(200);
    const initialData = (await first.json()) as {
      period: string;
      from: string;
      to: string;
      totalSpendCents: number;
      bookingCount: number;
      rows: Array<{ name: string; amountCents: number }>;
    };
    expect(initialData).toMatchObject({ period: '3J', from: '2023-10-01', to: '2026-08-31' });
    await expect(
      page.getByRole('heading', { name: 'Empfänger-Analyse', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('payee-total')).toHaveText(euro(initialData.totalSpendCents));
    await expect(page.locator('.payee-period')).toHaveText('01.10.2023 bis 31.08.2026');
    await expect(
      page.locator('.titleblock .tb-field').filter({ hasText: 'Stichtag' }).locator('.tb-value'),
    ).toHaveText('31.08.2026 · Monatsende');
    expect(initialData.bookingCount).toBeGreaterThan(0);
    expect(initialData.rows.length).toBeGreaterThan(0);

    const period = page.getByRole('group', { name: 'Zeitraum' });
    const oneYear = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/reports/payees' && url.searchParams.get('period') === '1J';
    });
    await period.getByRole('button', { name: '1J', exact: true }).click();
    const oneYearResponse = await oneYear;
    expect(oneYearResponse.status()).toBe(200);
    const oneYearData = (await oneYearResponse.json()) as { totalSpendCents: number };
    await expect(page.getByTestId('payee-total')).toHaveText(euro(oneYearData.totalSpendCents));

    const firstRecipient = page.locator('.payee-row-button').first();
    await expect(firstRecipient).toHaveAttribute('aria-expanded', 'false');
    await expect(firstRecipient).toHaveAttribute('aria-controls', 'payee-booking-detail');
    await expect(page.locator('#payee-booking-detail')).toHaveCount(1);
    const recipientName = await firstRecipient.innerText();
    const detailResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.includes('/api/reports/payees/') &&
        new URL(response.url()).pathname.endsWith('/bookings'),
    );
    await firstRecipient.click();
    const detail = await detailResponse;
    expect(detail.status()).toBe(200);
    const detailData = (await detail.json()) as { items: unknown[]; total: number };
    expect(detailData.items.length).toBeGreaterThan(0);
    expect(detailData.total).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: `Buchungen · ${recipientName}` })).toBeVisible();
    await expect(firstRecipient).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('region', { name: 'Buchungen dieses Empfängers, seitlich scrollbar' }),
    ).toBeVisible();

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const violations = await new AxeBuilder({ page }).analyze();
      expect(
        violations.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
      const dimensions = await page.evaluate(() => ({
        width: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.clientWidth).toBe(dimensions.width);
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
      if (info.project.name === 'mobile') {
        const touchTargets = await page.evaluate(() =>
          ['.payee-bar-name', '.payee-row-button', '.payee-close', '.payee-bookings a'].map(
            (selector) => {
              const element = document.querySelector<HTMLElement>(selector);
              const box = element?.getBoundingClientRect();
              return { width: box?.width ?? 0, height: box?.height ?? 0 };
            },
          ),
        );
        expect(touchTargets).toHaveLength(4);
        expect(touchTargets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
      }
      const evidenceDir = process.env['BUDGET_PAYEE_REPORT_EVIDENCE'];
      if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await page.screenshot({
        path: evidenceDir
          ? join(evidenceDir, `payee-analysis-${theme}-${info.project.name}.png`)
          : info.outputPath(`payee-analysis-${theme}-${info.project.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
    if (info.project.name === 'mobile') {
      for (const name of [
        'Empfängerübersicht, seitlich scrollbar',
        'Buchungen dieses Empfängers, seitlich scrollbar',
      ]) {
        const region = page.getByRole('region', { name, exact: true });
        await region.focus();
        await region.press('ArrowRight');
        await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
    }
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(firstRecipient).toHaveAttribute('aria-expanded', 'false');
  },
);

sampleTest(
  'empty and refund-only states explain unavailable shares and retry errors',
  async ({ page }, info) => {
    let fail = true;
    let failSummaryRefresh = false;
    let emptyState = false;
    let failDetailPage = true;
    const empty = {
      period: '1J',
      from: '2025-09-01',
      to: '2026-08-31',
      availableFrom: '2023-10-01',
      availableTo: '2026-08-31',
      availableMonths: 35,
      previousFrom: '2024-09-01',
      previousTo: '2025-08-31',
      previousAvailable: true,
      includedStatuses: ['pending', 'confirmed', 'reconciled'],
      observedStatuses: [],
      basis: 'eligible budget-consumption categories',
      totalSpendCents: 0,
      topFiveCents: 0,
      remainingCents: 0,
      topFiveSharePercent: null,
      averageSpendCents: null,
      bookingCount: 0,
      excludedUnclassifiedOutflowCents: 0,
      rows: [],
    };
    await page.route('**/api/reports/payees?*', async (route) => {
      if (fail || failSummaryRefresh) {
        await route.fulfill({
          status: 503,
          json: { error: 'read_unavailable', message: 'Report nicht erreichbar.' },
        });
        return;
      }
      if (emptyState) {
        await route.fulfill({
          json: { ...empty, period: new URL(route.request().url()).searchParams.get('period') },
        });
        return;
      }
      await route.fulfill({
        json: {
          ...empty,
          totalSpendCents: -500,
          topFiveCents: -500,
          remainingCents: 0,
          bookingCount: 1,
          averageSpendCents: -500,
          rows: [
            {
              payeeId: 'p-refund',
              name: 'A',
              amountCents: -500,
              averageSpendCents: -500,
              bookingCount: 1,
              sharePercent: null,
              previousAmountCents: null,
              changeCents: null,
              categories: [{ id: 'miete', name: 'Miete', amountCents: -500 }],
            },
          ],
        },
      });
    });
    await page.route('**/api/reports/payees/p-refund/bookings?*', async (route) => {
      const cursor = new URL(route.request().url()).searchParams.get('cursor');
      if (cursor && failDetailPage) {
        failDetailPage = false;
        await route.fulfill({
          status: 503,
          json: { error: 'detail_unavailable', message: 'Buchungsdetails nicht erreichbar.' },
        });
        return;
      }
      const items = Array.from({ length: cursor ? 1 : 40 }, (_, index) => ({
        booking: {
          id: `booking-${cursor ? '41' : index + 1}`,
          date: '2026-08-01',
          payeeName: 'A',
          status: 'confirmed',
        },
        spendCents: -500,
        categories: [{ id: 'miete', name: 'Miete', spendCents: -500 }],
      }));
      await route.fulfill({ json: { items, nextCursor: cursor ? null : 'next', total: 41 } });
    });
    await page.goto('/reports/empfaenger?zeitraum=1J');
    await expect(page.getByRole('alert')).toContainText('Report nicht erreichbar.');
    fail = false;
    await page.getByRole('alert').getByRole('button').click();
    await expect(page.getByTestId('payee-total')).toHaveText('−5,00 €');
    await expect(page.getByText('Nettoanteil der Top 5: –')).toBeVisible();
    await expect(page.getByText(/bei nicht positiver Gesamtsumme nicht berechenbar/)).toBeVisible();
    await expect(page.locator('.payee-row-button')).toHaveText('A');
    failSummaryRefresh = true;
    await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: '3M' }).click();
    await expect(page.getByRole('alert')).toContainText('Report nicht erreichbar.');
    await expect(page.getByTestId('payee-total')).toHaveCount(0);
    await expect(page.locator('.payee-row-button')).toHaveCount(0);
    failSummaryRefresh = false;
    await page.getByRole('alert').getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByTestId('payee-total')).toHaveText('−5,00 €');
    await expect(page.locator('.payee-row-button')).toHaveText('A');
    await page.locator('.payee-row-button').click();
    await expect(page.locator('.payee-bookings tbody tr')).toHaveCount(40);
    if (info.project.name === 'mobile') {
      const shortNameTargets = await page.evaluate(() =>
        ['.payee-bar-name', '.payee-row-button', '.payee-close', '.payee-bookings a'].map(
          (selector) => {
            const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
            return { width: box?.width ?? 0, height: box?.height ?? 0 };
          },
        ),
      );
      expect(shortNameTargets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
    }
    await page.getByRole('button', { name: 'Weitere Buchungen laden' }).click();
    await expect(page.getByRole('alert')).toContainText('Buchungsdetails nicht erreichbar.');
    await expect(page.locator('.payee-bookings')).toHaveCount(0);
    await page.getByRole('alert').getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.locator('.payee-bookings tbody tr')).toHaveCount(41);
    emptyState = true;
    await page.getByRole('group', { name: 'Zeitraum' }).getByRole('button', { name: '1M' }).click();
    await expect(page.getByTestId('payee-total')).toHaveText('0,00 €');
    await expect(page.locator('.payee-lead [role="status"]')).toContainText(
      'In diesem Zeitraum gibt es keine Buchungen',
    );
  },
);
