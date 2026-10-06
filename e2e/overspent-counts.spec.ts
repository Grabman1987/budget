import { expect, sampleTest as test } from './sample';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import type { Heute } from '../apps/web/src/heute/api';
import type { InboxView } from '../apps/web/src/inbox/api';

test('one synthetic month has the same overspent count in Heute, Plan, inbox and badge', async ({
  page,
  request,
}, info) => {
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
  const attention = page.locator('.heute-attention');
  await expect(attention).toContainText(`${count} Envelopes überzogen`);
  await expect(attention.locator('[data-overspent]')).toHaveCount(2);
  await attention.getByRole('button', { name: `weitere ${count - 2}` }).click();
  await expect(attention.locator('[data-overspent]')).toHaveCount(count);
  for (const id of ids) await expect(page.locator(`[data-overspent="${id}"]`)).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('heute.png'), fullPage: true });

  await page.goto('/plan/monat?monat=2026-09&ansicht=triage');
  await expect(page.locator('.triage')).toContainText(`${count} Envelopes überzogen`);
  await expect(page.getByRole('button', { name: /^Triage/ }).locator('.count')).toContainText(
    String(count),
  );
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
  await expect(page).toHaveURL(/\/plan\/monat\?.*kategorie=/);
  await expect(page.getByRole('dialog')).toBeVisible();
});
