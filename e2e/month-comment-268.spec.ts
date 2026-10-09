import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-03-18' });

test('Today and One-Pager explain booked month progress beside expected salary', async (
  { page, request, isolatedLedger },
  info,
) => {
  test.setTimeout(120_000);
  const { origin } = isolatedLedger;
  const headers = { origin };
  const mobile = info.project.name === 'mobile';
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const response = await request.post(`${origin}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };

  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: 'Synthetisches Girokonto',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-03-01',
    openingBalanceCents: 0,
  });
  const { group } = await post<{ group: { id: string } }>('/categories/groups', {
    name: 'Synthetischer Bedarf',
  });
  const { category } = await post<{ category: { id: string } }>('/categories', {
    name: 'Synthetische variable Ausgabe',
    groupId: group.id,
    class: 'need',
    kind: 'variable',
  });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-03-10',
    amountCents: -60_000,
    splits: [{ categoryId: category.id, amountCents: -60_000 }],
  });
  await post('/expected', {
    name: 'Synthetisches Gehalt',
    kind: 'inflow',
    accountId: account.id,
    incomeTypeId: 'income-salary',
    rhythm: 'monthly',
    validFrom: '2026-03-01',
    dueDay: 31,
    dateShift: 'none',
    amountCents: 300_000,
    currency: 'EUR',
  });

  const apiResponse = await request.get(`${origin}/api/reports/month/onepager?month=2026-03`, {
    headers,
  });
  expect(apiResponse.ok(), await apiResponse.text()).toBe(true);
  const report = (await apiResponse.json()) as {
    month: string;
    asOf: string;
    partial: boolean;
    result: { savedCents: number };
    expectedIncomeProgress: {
      pendingCount: number;
      pendingCents: number;
      fromDueDate: string;
      throughDueDate: string;
    } | null;
  };
  expect(report).toMatchObject({
    month: '2026-03',
    asOf: '2026-03-18',
    partial: true,
    result: { savedCents: -60_000 },
    expectedIncomeProgress: {
      pendingCount: 1,
      pendingCents: 300_000,
      fromDueDate: '2026-03-31',
      throughDueDate: '2026-03-31',
    },
  });

  const scenes = [
    { path: '/?monat=2026-03&period=month', name: 'heute', count: 1 },
    { path: '/reports/onepager?monat=2026-03', name: 'onepager', count: 2 },
  ] as const;
  const mobileProfile = page.locator('.m-profile');
  const privacyToggle = page
    .locator(mobile ? '.m-profile' : '.topbar')
    .getByRole('button', { name: 'Beträge verbergen', exact: true });

  for (const scene of scenes) {
    await page.goto(scene.path);
    const verdicts = page.getByTestId('report-verdict');
    await expect(verdicts).toHaveCount(scene.count, { timeout: 30_000 });
    for (let index = 0; index < scene.count; index++) {
      const verdict = verdicts.nth(index);
      await expect(verdict).toContainText('Zwischenstand bis 18.03.');
      await expect(verdict).toContainText('gebuchtes Monatsergebnis −600 €');
      await expect(verdict).toContainText('3.000 € aus einer erwarteten Einnahme am 31.03.');
    }
    expect(await verdicts.nth(0).textContent()).toBe(
      await verdicts.nth(scene.count - 1).textContent(),
    );

    if (mobile) await mobileProfile.locator('summary').click();
    await privacyToggle.click();
    await expect(privacyToggle).toHaveAttribute('aria-pressed', 'true');
    for (let index = 0; index < scene.count; index++) {
      const verdict = verdicts.nth(index);
      await expect(verdict).toContainText('Zwischenstand bis 18.03.');
      await expect(verdict).toContainText('••• €');
      await expect(verdict).toContainText('am 31.03.');
      const text = (await verdict.textContent()) ?? '';
      expect(text).not.toContain('600');
      expect(text).not.toContain('3.000');
    }
    if (mobile) {
      await privacyToggle.press('Escape');
      await expect(privacyToggle).toBeHidden();
      await expect(mobileProfile).not.toHaveAttribute('open');
      await expect(mobileProfile.locator('summary')).toBeFocused();
      await mobileProfile.locator('summary').click();
    }
    await privacyToggle.click();
    await expect(privacyToggle).toHaveAttribute('aria-pressed', 'false');
    if (mobile) {
      await privacyToggle.press('Escape');
      await expect(privacyToggle).toBeHidden();
      await expect(mobileProfile).not.toHaveAttribute('open');
      await expect(mobileProfile.locator('summary')).toBeFocused();
    }

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.evaluate((value) => {
        localStorage.setItem('budget-theme', value);
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.evaluate(() => document.fonts.ready);
      const accessibility = await new AxeBuilder({ page }).include('main').analyze();
      expect(accessibility.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`month-comment-268-${scene.name}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
});

