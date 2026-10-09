import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('Heute labels envelope reserve separately from a negative account balance', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const { origin } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };

  const group = (await post('/categories/groups', { name: 'Testgruppe Zahlungen' })).group;
  const category = (
    await post('/categories', { name: 'Test Envelope', groupId: group.id, class: 'need' })
  ).category;
  const negativeAccount = (
    await post('/accounts', {
      name: 'Negatives Testkonto',
      type: 'checking',
      onBudget: true,
      openingDate: '2026-10-01',
      openingBalanceCents: -20_000,
    })
  ).account;
  await post('/accounts', {
    name: 'Positives Testkonto',
    type: 'checking',
    onBudget: true,
    openingDate: '2026-10-01',
    openingBalanceCents: 150_000,
  });
  const assigned = await request.put(`${origin}/api/budget/2026-10/assigned`, {
    headers: { origin },
    data: { items: [{ categoryId: category.id, assignedCents: 100_000 }] },
  });
  expect(assigned.ok(), await assigned.text()).toBe(true);
  await post('/expected', {
    accountId: negativeAccount.id,
    name: 'Testzahlung',
    kind: 'outflow',
    categoryId: category.id,
    amountCents: 50_000,
    rhythm: 'monthly',
    dueDay: 5,
    startDate: '2026-10-01',
    validFrom: '2026-10-01',
  });
  await post('/expected', {
    accountId: negativeAccount.id,
    name: 'Testzahlung 2',
    kind: 'outflow',
    categoryId: category.id,
    amountCents: 60_000,
    rhythm: 'monthly',
    dueDay: 6,
    startDate: '2026-10-01',
    validFrom: '2026-10-01',
  });

  const [accountsResponse, budgetResponse, todayResponse] = await Promise.all([
    request.get(`${origin}/api/accounts`),
    request.get(`${origin}/api/budget/2026-10`),
    request.get(`${origin}/api/heute?period=month&month=2026-10`),
  ]);
  expect(accountsResponse.ok(), await accountsResponse.text()).toBe(true);
  expect(budgetResponse.ok(), await budgetResponse.text()).toBe(true);
  expect(todayResponse.ok(), await todayResponse.text()).toBe(true);
  const { accounts } = (await accountsResponse.json()) as {
    accounts: Array<{ id: string; balanceCents: number }>;
  };
  const { summary } = (await budgetResponse.json()) as {
    summary: { envelopes: Array<{ categoryId: string; availableCents: number }> };
  };
  const { upcoming14 } = (await todayResponse.json()) as {
    upcoming14: Array<{ name: string; accountId: string; amountCents: number; covered: boolean }>;
  };
  expect(accounts.find((item) => item.id === negativeAccount.id)?.balanceCents).toBe(-20_000);
  expect(
    summary.envelopes.find((envelope) => envelope.categoryId === category.id)?.availableCents,
  ).toBe(100_000);
  expect(upcoming14.find((payment) => payment.name === 'Testzahlung')).toMatchObject({
    accountId: negativeAccount.id,
    amountCents: -50_000,
    covered: true,
  });
  expect(upcoming14.find((payment) => payment.name === 'Testzahlung 2')).toMatchObject({
    accountId: negativeAccount.id,
    amountCents: -60_000,
    covered: false,
  });

  await page.goto('/');
  const section = page.locator('section[aria-labelledby="heute-upcoming-title"]');
  await expect(section).toContainText('Testzahlung');
  const paymentRows = section.locator('.heute-upcoming');
  await expect(paymentRows).toHaveCount(2);
  await expect(paymentRows.nth(0).locator('.heute-amount-status > span')).toHaveText(
    'Budgetrücklage reicht',
  );
  await expect(paymentRows.nth(1).locator('.heute-amount-status > span')).toHaveText(
    'Budgetrücklage reicht nicht',
  );
  await expect(section).toContainText(
    'Die Budgetrücklage vergleicht nur das Verfügbar im Envelope mit der Zahlung. Kontostand und Überziehungsrahmen werden nicht geprüft.',
  );
  await expect(section).not.toContainText('nicht gedeckt');
  await expect(
    paymentRows.nth(0).getByRole('link').filter({ hasText: '500,00 €' }),
  ).toHaveAttribute('href', /\/plan\/erwartet/);
  await expect(
    paymentRows.nth(1).getByRole('link').filter({ hasText: '600,00 €' }),
  ).toHaveAttribute('href', /\/plan\/erwartet/);

  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBe(info.project.name === 'desktop' ? 1440 : 390);
  const sectionBox = await section.boundingBox();
  expect(sectionBox).toBeTruthy();
  for (const row of await paymentRows.all()) {
    const rowBox = await row.boundingBox();
    const status = row.locator('.heute-amount-status > span');
    expect(rowBox).toBeTruthy();
    const textBounds = await status.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const rects: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      while (walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width > 0 && rect.height > 0)
            rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        }
      }
      return {
        text: element.textContent?.trim(),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        rects,
      };
    });
    expect(textBounds.rects.length).toBeGreaterThan(0);
    expect(textBounds.scrollWidth).toBeLessThanOrEqual(textBounds.clientWidth);
    for (const rect of textBounds.rects) {
      expect(rect.left).toBeGreaterThanOrEqual(rowBox!.x - 0.5);
      expect(rect.right).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);
      expect(rect.top).toBeGreaterThanOrEqual(rowBox!.y - 0.5);
      expect(rect.bottom).toBeLessThanOrEqual(rowBox!.y + rowBox!.height + 0.5);
      expect(rect.left).toBeGreaterThanOrEqual(sectionBox!.x - 0.5);
      expect(rect.right).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 0.5);
      expect(rect.top).toBeGreaterThanOrEqual(sectionBox!.y - 0.5);
      expect(rect.bottom).toBeLessThanOrEqual(sectionBox!.y + sectionBox!.height + 0.5);
      expect(rect.left).toBeGreaterThanOrEqual(-0.5);
      expect(rect.right).toBeLessThanOrEqual(viewportWidth! + 0.5);
    }
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  const themeSurfaces: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate((theme) => {
      localStorage.setItem('budget-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }, colorScheme);
    const theme = await page.evaluate(() => ({
      preference: document.documentElement.getAttribute('data-theme'),
      ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
    }));
    expect(theme.preference).toBe(colorScheme);
    themeSurfaces.push(theme.ground);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('section[aria-labelledby="heute-upcoming-title"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    await section.screenshot({ path: info.outputPath(`payment-budget-273-${colorScheme}.png`) });
  }
  expect(new Set(themeSurfaces).size).toBe(2);
});
