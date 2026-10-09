import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-01' });

const severe = (violations: Array<{ impact?: string | null }>) =>
  violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

async function moneyLeaks(page: Page) {
  return page.locator('main').evaluate((main) => {
    const money = /[+−-]?\d[\d.,\s]*(?:Mio\.\s*)?(€|EUR|USD|GBP|CHF)(?![A-Z])/g;
    return [
      main.textContent ?? '',
      ...Array.from(main.querySelectorAll('[aria-label], [title]')).map(
        (element) =>
          `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`,
      ),
    ].flatMap((text) => [...text.matchAll(money)].map((match) => match[0]));
  });
}

test('Today and Plan explain a real booking-month shift beside October expected income', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const isMobile = info.project.name === 'mobile';
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: isMobile ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const headers = { origin: baseURL! };
  const post = async <T>(path: string, data: unknown): Promise<T> => {
    const response = await request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as T;
  };

  const { account } = await post<{ account: { id: string } }>('/accounts', {
    name: 'Synthetisches Haushaltskonto',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-09-01',
    openingBalanceCents: 0,
  });
  const { group } = await post<{ group: { id: string } }>('/categories/groups', {
    name: 'Synthetische Einnahmen',
  });
  const { category } = await post<{ category: { id: string } }>('/categories', {
    name: 'Haushaltseinnahmen',
    kind: 'income',
    class: null,
    groupId: group.id,
  });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-09-30',
    amountCents: 100_000,
    incomeNextMonth: true,
    splits: [{ categoryId: category.id, incomeTypeId: 'income-salary', amountCents: 100_000 }],
  });
  await post('/expected', {
    name: 'Synthetische erwartete Einnahme',
    kind: 'inflow',
    accountId: account.id,
    incomeTypeId: 'income-salary',
    rhythm: 'monthly',
    validFrom: '2026-10-01',
    dueDay: 15,
    dateShift: 'none',
    amountCents: 30_000,
  });
  await post('/expected/refresh', {});

  const accountResponse = await request.get('/api/accounts?asOf=2026-09-30', { headers });
  expect(accountResponse.ok(), await accountResponse.text()).toBe(true);
  const accountRead = (await accountResponse.json()) as {
    accounts: Array<{ id: string; balanceCents: number }>;
  };
  expect(accountRead.accounts.find((row) => row.id === account.id)?.balanceCents).toBe(100_000);

  const budgetResponse = await request.get('/api/budget/2026-10', { headers });
  expect(budgetResponse.ok(), await budgetResponse.text()).toBe(true);
  expect((await budgetResponse.json()).summary.incomeCents).toBe(100_000);

  const expectedResponse = await request.get('/api/expected/income?month=2026-10', { headers });
  expect(expectedResponse.ok(), await expectedResponse.text()).toBe(true);
  expect(await expectedResponse.json()).toMatchObject({
    month: '2026-10',
    expectedCents: 30_000,
    receivedCents: 0,
  });

  await page.goto('/?monat=2026-10');
  const todayCards = page.locator('.heute-answers');
  await expect(todayCards).toContainText('Haushaltseinnahmen 0,00 €');
  await expect(todayCards).toContainText('Haushaltseinnahmen im Oktober 2026 nach Buchungsdatum.');
  const planLink = page.getByRole('link', { name: 'Planmonat Oktober 2026 ansehen' });
  await expect(planLink).toHaveAttribute('href', /\/plan\/monat\/einnahmen\?monat=2026-10/);

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    expect(
      severe((await new AxeBuilder({ page }).include('.heute-answers').analyze()).violations),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`income-scope-266-heute-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  await planLink.click();
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen\?monat=2026-10$/);
  await expect(page.getByRole('heading', { name: 'Oktober 2026', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText('Monat');
  const planDetail = page.locator('.plan-detail');
  await expect(planDetail.getByTestId('income-received')).toHaveText('0,00 €');
  await expect(planDetail).toContainText('Zu erwarteten Zahlungen eingegangen im Oktober');
  await expect(planDetail).toContainText('erwartet 300,00 €');
  await expect(planDetail).toContainText(
    'Budgetrelevante Zuflüsse im Planmonat Oktober 2026: 1.000,00 €',
  );
  await expect(planDetail).toContainText('Erwartete Zahlungen sind Planwerte');

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    expect(
      severe((await new AxeBuilder({ page }).include('.plan-detail').analyze()).violations),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`income-scope-266-plan-income-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }

  await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-10$/);
  await page.getByRole('button', { name: /Einnahmen im Detail/ }).click();
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen\?monat=2026-10$/);
  await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-10$/);

  await page.goto('/?monat=2026-10');
  await page.keyboard.press('Control+Shift+H');
  if (!isMobile) {
    await expect(
      page.locator('.topbar').getByRole('button', { name: 'Beträge verbergen', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(todayCards).toContainText('Haushaltseinnahmen ••• €');
  await expect(planLink).toBeVisible();
  expect(await moneyLeaks(page)).toEqual([]);

  await page.goto('/plan/monat/einnahmen?monat=2026-10');
  await expect(page.getByTestId('income-received')).toHaveText('••• €');
  await expect(page.locator('.plan-detail')).toContainText(
    'Budgetrelevante Zuflüsse im Planmonat Oktober 2026: ••• €',
  );
  expect(await moneyLeaks(page)).toEqual([]);
});
