import { expect as baseExpect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

const expect = baseExpect.configure({ timeout: 15_000 });
test.beforeEach(() => test.slow());

/** A synthetic salary on the 15th (shifted to the banking day before), today is 02.10.2026. */
const SALARY_CENTS = 300_123;

async function octoberIncome(page: Page): Promise<number> {
  const response = await page.request.get('/api/liquidity?horizon=6m');
  expect(response.status()).toBe(200);
  const view = (await response.json()) as {
    report: { months: { month: string; incomeCents: number }[] };
  };
  return view.report.months.find((m) => m.month === '2026-10')!.incomeCents;
}

test('a single salary is struck from the forecast, Heute and Plan, and comes back', async ({
  page,
  baseURL,
}, info) => {
  const origin = baseURL!;
  const accountResponse = await page.request.post('/api/accounts', {
    headers: { origin },
    data: {
      name: `Synthetic skip account ${info.project.name}`,
      type: 'checking',
      openingDate: '2026-10-02',
      openingBalanceCents: 100_000,
    },
  });
  expect(accountResponse.status(), await accountResponse.text()).toBe(201);
  const { account } = (await accountResponse.json()) as { account: { id: string } };
  const name = `Synthetic skip salary ${info.project.name}`;
  const paymentResponse = await page.request.post('/api/expected', {
    headers: { origin },
    data: {
      name,
      kind: 'inflow',
      accountId: account.id,
      incomeTypeId: 'income-salary',
      rhythm: 'monthly',
      dueDay: 15,
      dateShift: 'before',
      startDate: '2026-10-02',
      validFrom: '2026-10-02',
      amountCents: SALARY_CENTS,
    },
  });
  expect(paymentResponse.status(), await paymentResponse.text()).toBe(201);
  const withSalary = await octoberIncome(page);
  expect(withSalary).toBeGreaterThanOrEqual(SALARY_CENTS);

  // Liquiditätsprognose: strike the October salary, the movement and the income vanish.
  await page.goto('/reports/liquiditaet');
  const strike = page.getByRole('button', {
    name: `Diesen Monat streichen: ${name}, 15.10.`,
    exact: true,
  });
  await expect(strike).toBeVisible();
  await strike.click();
  await expect(strike).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeVisible();
  expect(await octoberIncome(page)).toBe(withSalary - SALARY_CENTS);
  // The other salaries stay: the rule is untouched.
  await expect(
    page.getByRole('button', { name: `Diesen Monat streichen: ${name}, 13.11.`, exact: true }),
  ).toBeVisible();

  // Rückgängig brings the occurrence back.
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(strike).toBeVisible();
  expect(await octoberIncome(page)).toBe(withSalary);

  // Plan › Erwartet: struck occurrences stay listed, marked neutral, with "Wiederherstellen".
  await page.goto('/plan/erwartet');
  await page
    .locator('tr.prow')
    .filter({ hasText: name })
    .first()
    .getByRole('button', { name })
    .click();
  await expect(page).toHaveURL(new RegExp('/plan/erwartet/[^?]+'));
  const panel = page.locator('.xp-detail-body');
  const october = panel.locator('.xp-occ > li').filter({ hasText: '15.10.2026' });
  await expect(october).toContainText('erwartet');
  await october.getByRole('button', { name: 'Streichen' }).click();
  await expect(october).toContainText('gestrichen');
  await expect(october.getByRole('button', { name: 'Verknüpfen' })).toHaveCount(0);
  expect(await octoberIncome(page)).toBe(withSalary - SALARY_CENTS);
  await october.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(october).toContainText('erwartet');
  await expect(october.getByRole('button', { name: 'Streichen' })).toBeVisible();
  expect(await octoberIncome(page)).toBe(withSalary);

  // Heute: the upcoming salary offers the same action and drops out of the list.
  await page.goto('/');
  // The list "Danach" sits in "Mehr zum Monat", open on desktop and folded on the phone.
  const more = page.getByRole('button', { name: 'Mehr zum Monat' });
  await expect(more).toBeVisible();
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  const heuteStrike = page.getByRole('button', {
    name: `Diesen Monat streichen: ${name}, 15.10.`,
  });
  await expect(heuteStrike).toBeVisible();
  await heuteStrike.click();
  await expect(heuteStrike).toHaveCount(0);
  expect(await octoberIncome(page)).toBe(withSalary - SALARY_CENTS);
});
