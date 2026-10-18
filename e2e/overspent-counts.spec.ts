import { expect as baseExpect, sampleTest as test } from './sample';
import AxeBuilder from '@axe-core/playwright';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import type { Heute } from '../apps/web/src/heute/api';
import type { InboxView } from '../apps/web/src/inbox/api';

// Heute, Plan and the envelope page each aggregate the whole ledger; under parallel load that
// takes longer than the default 5 s.
const expect = baseExpect.configure({ timeout: 45_000 });

test('one synthetic month has the same overspent count in Heute, Plan, inbox and phone status', async ({
  page,
  request,
}, info) => {
  test.setTimeout(180_000);
  const plan: BudgetMonthView = await (await request.get('/api/budget/2026-09')).json();
  const today: Heute = await (await request.get('/api/heute')).json();
  const inbox: InboxView = await (await request.get('/api/inbox')).json();
  const badge = await (await request.get('/api/inbox/count')).json();
  const ids = plan.summary.envelopes
    .filter((e) => e.availableCents < 0)
    .map((e) => e.categoryId)
    .sort();
  const count = ids.length;
  const overspentRows = inbox.entries.filter((entry) => entry.type === 'envelope');
  const deficitCents = overspentRows.reduce((sum, entry) => sum + entry.deficitCents, 0);
  expect(count).toBeGreaterThan(2);
  expect(
    today.nextSteps.items
      .filter((e) => e.kind === 'overspent')
      .map((e) => e.categoryId)
      .sort(),
  ).toEqual(ids);
  expect(
    inbox.entries
      .filter((e) => e.type === 'envelope')
      .map((e) => e.categoryId)
      .sort(),
  ).toEqual(ids);
  // The header pill (Umsätze + Aufgaben) excludes the overspent categories the full queue derives.
  expect(badge.count).toBe(inbox.count - count);

  await page.goto('/');
  const phone = (page.viewportSize()?.width ?? Infinity) <= 767;
  const link = phone
    ? page.locator('.m-status').getByRole('link', { name: `${count} überzogen` })
    : page.locator('.heute-attention').getByRole('link', { name: 'Plan prüfen', exact: true });
  await expect(page.locator('.topbar .overspent-chip, .m-head .count')).toHaveCount(0);
  await expect(link).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.heute-attention')).toContainText(`${count} Kategorien überzogen`);
  await expect(page.locator('.heute-attention [data-overspent]')).toHaveCount(0);
  await expect(link).toHaveAttribute('href', /\/plan\/monat/);
  await page.screenshot({ path: info.outputPath('heute.png'), fullPage: true });
  await link.click();
  await expect(page).toHaveURL(/\/plan\/monat\?/);
  const triageUrl = new URL(page.url());
  expect(triageUrl.searchParams.get('monat')).toBe('2026-09');
  expect(triageUrl.searchParams.get('ansicht')).toBe('triage');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // #587: the count lives in the rows and in the Zu verteilen disclosure, not in a head chip.
  await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
  await expect(page.locator('tr.prow.is-over')).toHaveCount(count);

  await page.goto('/plan/monat?monat=2026-09&ansicht=triage');
  await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
  await page.locator('.plan-tba').click();
  await expect(page.locator('.triage')).toContainText(`${count} Envelopes überzogen`);
  await expect(page.locator('tr.prow.is-over')).toHaveCount(count);
  await page.screenshot({ path: info.outputPath('plan.png'), fullPage: true });

  // #561: overspent categories live in Heute and Plan (asserted above), not in Prüfen. The deficit
  // the Plan shows must equal the amount the unfiltered inbox API still derives.
  expect(
    -plan.summary.envelopes
      .filter((e) => e.availableCents < 0)
      .reduce((sum, e) => sum + e.availableCents, 0),
  ).toBe(deficitCents);
  await page.goto('/konten/posteingang');
  await expect(page.getByRole('group', { name: 'Teil von Prüfen' })).toBeVisible();
  await expect(page.locator('.kgroup', { hasText: 'Überzogene Kategorien' })).toHaveCount(0);
  await expect(page.getByTestId('inbox-overspent-summary')).toHaveCount(0);
  await expect(page.getByText('Kategorien überzogen')).toHaveCount(0);
  await expect(page.getByTestId('inbox-row').filter({ hasText: 'ist überzogen' })).toHaveCount(0);
  await expect(
    page.locator(phone ? '.m-status' : '.topbar').getByRole('link', {
      name: phone ? `${badge.count} zu prüfen` : `Prüfen, ${badge.count} offen`,
    }),
  ).toHaveText(phone ? `${badge.count} zu prüfen` : `Prüfen · ${badge.count}`);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`inbox-${theme}.png`), fullPage: true });
  }
  await page.evaluate(() => delete document.documentElement.dataset['theme']);
  let coverPosts = 0;
  await page.route('**/api/budget/2026-09/cover', async (route) => {
    coverPosts += 1;
    await route.fulfill({ status: 409, json: { error: 'Unexpected summary write' } });
  });
  // The overspent count's entry point is Heute / the phone status line now: opens triage, no write.
  await page.goto('/');
  await link.click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09&ansicht=triage/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(coverPosts).toBe(0);
});

test('phone status or Heute action opens triage with the missing amount and performs no cover write', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route('**/api/budget/2026-09', async (route) => {
    const response = await route.fetch();
    const body: BudgetMonthView = await response.json();
    body.summary.toBeAssignedCents = 0;
    body.summary.envelopes = body.summary.envelopes.map((e) => ({ ...e, freeCents: 0 }));
    delete body.budgetMoney;
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  const chip =
    (page.viewportSize()?.width ?? Infinity) <= 767
      ? page.locator('.m-status').getByRole('link', { name: /\d+ überzogen/ })
      : page.locator('.heute-attention').getByRole('link', { name: 'Plan prüfen', exact: true });
  let coverPosts = 0;
  await page.route('**/api/budget/2026-09/move', async (route) => {
    coverPosts += 1;
    await route.fulfill({ status: 409, json: { error: 'Unexpected chip write' } });
  });
  await expect(chip).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await chip.click();
  await expect(page).toHaveURL(/\/plan\/monat\?/);
  const destination = new URL(page.url());
  expect(destination.searchParams.get('monat')).toBe('2026-09');
  expect(destination.searchParams.get('ansicht')).toBe('triage');
  await expect(page.locator('.cover-missing')).toContainText('Es fehlen');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(coverPosts).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The plan page the link opened still fetches the stubbed month; end the stub before the
  // context closes so that in-flight route.fetch is not reported as a failure.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
