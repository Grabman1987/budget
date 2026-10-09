import { expect as baseExpect, sampleTest as test } from './sample';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import type { Heute } from '../apps/web/src/heute/api';
import type { InboxView } from '../apps/web/src/inbox/api';

// Heute, Plan and the envelope page each aggregate the whole ledger; under parallel load that
// takes longer than the default 5 s.
const expect = baseExpect.configure({ timeout: 45_000 });

test('one synthetic month has the same overspent count in Heute, Plan, inbox and badge', async ({
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
  expect(badge.count).toBe(inbox.count);

  await page.goto('/');
  const bar = page.locator(info.project.name === 'mobile' ? '.m-head' : '.topbar');
  const chip = bar.getByRole('link', {
    name: new RegExp(`^${count} Envelopes überzogen, .* zu decken – Überziehungen prüfen$`),
  });
  await expect(chip).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.heute-attention')).not.toContainText('überzogen');
  await expect(chip).toHaveAttribute('href', /\/plan\/monat/);
  await page.screenshot({ path: info.outputPath('heute.png'), fullPage: true });
  await chip.click();
  await expect(page).toHaveURL(/\/plan\/monat\?/);
  const triageUrl = new URL(page.url());
  expect(triageUrl.searchParams.get('monat')).toBe('2026-09');
  expect(triageUrl.searchParams.get('ansicht')).toBe('triage');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.triage')).toContainText(`${count} Envelopes überzogen`);

  await page.goto('/plan/monat?monat=2026-09&ansicht=triage');
  await expect(page.locator('.triage')).toContainText(`${count} Envelopes überzogen`);
  await expect(
    page.getByRole('button', { name: /^Überziehungen prüfen/ }).locator('.count'),
  ).toContainText(String(count));
  await expect(page.locator('tr.prow.is-over')).toHaveCount(count);
  await page.screenshot({ path: info.outputPath('plan.png'), fullPage: true });

  await page.goto('/konten/posteingang');
  await expect(
    page.locator('.kgroup', { hasText: 'Überzogene Kategorien' }).locator('.kgcount'),
  ).toHaveText(String(count));
  const rows = page.getByTestId('inbox-row').filter({ hasText: 'ist überzogen' });
  await expect(rows).toHaveCount(count);
  await expect(rows.getByRole('link', { name: 'Decken', exact: true })).toHaveCount(count);
  await expect(rows.getByRole('button', { name: 'Als erledigt markieren' })).toHaveCount(0);
  await expect(
    page
      .locator(info.project.name === 'mobile' ? '.m-head' : '.topbar')
      .getByRole('link', { name: /^Posteingang,/ }),
  ).toHaveAttribute('aria-label', `Posteingang, ${badge.count} offen`);
  await page.screenshot({ path: info.outputPath('inbox.png'), fullPage: true });
  await rows.getByRole('link', { name: 'Decken', exact: true }).first().click();
  await expect(page).toHaveURL(/\/plan\/monat\/envelope\/[^?]+\?.*monat=2026-09/);
  // Envelope details are a page now; the cover controls open from its edit button.
  await page.getByRole('button', { name: 'Zuweisen oder verschieben' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Decken oder verschieben' })).toBeVisible();
});

test('top-bar link opens triage with the missing amount and performs no cover write', async ({
  page,
}, info) => {
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
  const bar = page.locator(info.project.name === 'mobile' ? '.m-head' : '.topbar');
  const chip = bar.getByRole('link', { name: /Envelopes überzogen/ });
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
