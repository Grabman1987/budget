import AxeBuilder from '@axe-core/playwright';
import { REPORT_GROUPS } from '../apps/web/src/nav/reports-catalog';
import { sampleTest, expect } from './sample';
import type { Locator, Page, Request } from '@playwright/test';
import { addDays, lastDayOfMonth } from '@budget/domain';
import { SAMPLE_NOW } from './sample';
import { eur, longDay } from '../apps/web/src/ledger/format';
import { contactBalanceLine } from '../apps/web/src/contacts/contact-balance';
import { goalReportRows } from '../apps/web/src/pages/goals-progress-model';
import type { GoalView } from '../apps/web/src/budget/goals-api';
import type { Occurrence } from '../apps/web/src/expected/api';
import { money, paymentGroups } from '../apps/web/src/expected/expected-model';

/** Explicit owner-retired wrappers keep their actual area/source contract, without a fake Fazit. */
async function retiredArea(page: Page, id: 'vorschau' | 'sparziele' | 'kontakte') {
  const path = id === 'vorschau' ? '/plan/erwartet' : id === 'sparziele' ? '/plan/sparziele' : '/konten/kontakte';
  await expect(page).toHaveURL((url) => url.pathname === path && url.searchParams.get('monat') === '2026-08');
  // Plan's actual title is the selected calendar month; the body identifies its area.
  await expect(page.getByRole('heading', { level: 1, name: id === 'kontakte' ? /^(Konten|Kontakte)$/ : 'August 2026', exact: true }).first()).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  let amount: Locator | undefined;
  let expected = '';
  if (id === 'vorschau') {
    await expect(page.getByRole('button', { name: 'Anstehend', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const today = SAMPLE_NOW.slice(0, 10);
    const response = await page.request.get(`/api/expected/occurrences?from=${addDays(today, -31)}&to=${addDays(today, 90)}`);
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as { occurrences: Occurrence[] };
    // Rates change only group sums, never the native-currency row identity or membership.
    const rows = paymentGroups(data.occurrences, today, {}, 35).flatMap((group) => group.rows);
    const actual = page.locator('.xp tr.prow');
    await expect(actual).toHaveCount(rows.length);
    if (rows.length) await expect(page.getByRole('heading', { name: 'Wiederkehrende Zahlungen', exact: true })).toBeVisible();
    for (let i = 0; i < rows.length; i++) {
      const source = rows[i]!;
      await expect(actual.nth(i)).toContainText(source.name);
      await expect(actual.nth(i)).toContainText(longDay(source.dueDate));
      await expect(actual.nth(i).locator('.col-num')).toContainText(money(source.amountCents, source.currency, source.kind === 'inflow'));
    }
    if (rows.length) { amount = actual.first().locator('.col-num'); expected = money(rows[0]!.amountCents, rows[0]!.currency, rows[0]!.kind === 'inflow'); }
    else await expect(page.getByText('In den nächsten 35 Tagen ist nichts fällig.')).toBeVisible();
  } else if (id === 'sparziele') {
    const responses = await Promise.all([
      page.request.get('/api/goals?month=2026-08'),
      page.request.get('/api/categories'),
      page.request.get(`/api/accounts?asOf=${lastDayOfMonth('2026-08')}`),
    ]);
    for (const response of responses) expect(response.ok()).toBe(true);
    const source = (await responses[0]!.json()) as { month: string; goals: GoalView[] };
    const categories = (await responses[1]!.json()) as { categories: Array<{ id: string; name: string; class: string | null }> };
    const accounts = (await responses[2]!.json()) as { accounts: Array<{ id: string; name: string; currency: string }> };
    expect(source.month).toBe('2026-08');
    const rows = goalReportRows(source.goals, categories.categories, accounts.accounts);
    const proven = rows.flatMap((row) => row.progress ? [row.progress] : []);
    const unknown = rows.filter((row) => !row.progress);
    const summary = page.getByTestId('goals-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText((!source.goals.length ? 'Noch keine Sparziele' : proven.length ? `${proven.filter((goal) => goal.status !== 'behind').length} von ${proven.length} im Plan` : 'Keine eindeutig belegten Zielstände') + (unknown.length ? ` · ${unknown.length} ungeklärt` : ''));
    for (const toggle of await page.locator('.goals .grp-toggle[aria-expanded="false"]').all()) await toggle.click();
    await expect(page.locator('.goals tr.prow.grow')).toHaveCount(rows.length);
    for (const source of rows) {
      const row = page.locator('.goals tr.prow.grow').filter({ has: page.locator(`a[href^="/plan/sparziele/${encodeURIComponent(source.id)}?"]`) });
      await expect(row).toContainText(source.name);
      if (source.progress) {
        await expect(row.locator('.col-target')).toHaveText(eur(source.progress.targetCents));
        await expect(row.locator('.col-saved')).toHaveText(eur(source.progress.savedCents));
        await expect(row.locator('.col-missing')).toHaveText(eur(source.progress.remainingCents));
        await expect(row.getByTestId('goal-future-rate')).toHaveText(source.progress.neededMonthlyCents === null ? '–' : eur(source.progress.neededMonthlyCents));
        if (!amount) { amount = row.locator('.col-target'); expected = eur(source.progress.targetCents); }
      } else {
        expect(await row.getAttribute('data-goal-unknown')).not.toBeNull();
        await expect(row).toContainText(source.reason!);
        await expect(row.locator('.pbar, .col-target, .col-saved, .col-missing')).toHaveCount(0);
      }
    }
  } else {
    await expect(page.getByRole('button', { name: 'Offen', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const response = await page.request.get('/api/contacts?history=0');
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as { contacts: Array<{ id: string; name: string; balanceCents: number }> };
    await expect(page.locator('.contacts-table tbody tr')).toHaveCount(data.contacts.length);
    for (const contact of data.contacts) {
      const row = page.locator('.contacts-table tbody tr').filter({ has: page.locator(`a[href^="/konten/kontakte/${encodeURIComponent(contact.id)}"]`) });
      await expect(row.getByRole('link', { name: contact.name, exact: true })).toBeVisible();
      await expect(row.locator('.num')).toHaveText(contactBalanceLine(contact.balanceCents));
      if (!amount && contact.balanceCents !== 0) { amount = row.locator('.num'); expected = contactBalanceLine(contact.balanceCents); }
    }
    if (!data.contacts.length) await expect(page.getByText(/Keine offenen Kontaktbeträge/)).toBeVisible();
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset['theme'] = value; }, theme);
    if (amount) await expect(amount).toContainText(expected);
    await page.keyboard.press('Control+Shift+H');
    if (amount) { await expect(amount).not.toContainText(expected); await expect(amount).toContainText(/•••/); }
    await page.keyboard.press('Control+Shift+H');
    if (amount) await expect(amount).toContainText(expected);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
}

sampleTest.describe.configure({ timeout: 180_000 });
for (const group of REPORT_GROUPS) {
  sampleTest(`Fazit: ${group.name}`, async ({ page }, info) => {
    for (const report of group.items) {
      const retired = report.id === 'vorschau' || report.id === 'sparziele' || report.id === 'kontakte';
      const writes: string[] = [];
      const watch = (request: Request) => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(new URL(request.url()).pathname); };
      if (retired) page.on('request', watch);
      await page.goto(`/reports/${report.id}?monat=2026-08`);
      if (report.id === 'vorschau' || report.id === 'sparziele' || report.id === 'kontakte') {
        await retiredArea(page, report.id);
        page.off('request', watch);
        expect(writes.filter((path) => report.id !== 'vorschau' || path !== '/api/expected/refresh')).toEqual([]);
        continue;
      }
      const verdict = page
        .getByTestId(report.id === 'gesamtuebersicht' ? 'whole-verdict' : 'report-verdict')
        .first();
      await expect(verdict, report.id).toBeVisible({ timeout: 45_000 });
      const text = await verdict.textContent();
      expect(text!.length, report.id).toBeLessThanOrEqual(140);
      expect(text, report.id).not.toMatch(/undefined|NaN|\{\w+\}/);
      const title = (await page.locator('.titleblock').isVisible())
        ? page.locator('.titleblock')
        : page.getByRole('banner');
      expect((await verdict.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      const result = await new AxeBuilder({ page }).include('.report-verdict').analyze();
      expect(result.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`verdict-${group.slug}-${theme}.png`),
        fullPage: true,
      });
    }
  });
}
sampleTest('Fazit: Heute, One-Pager header, reload, month change and privacy', async ({ page }) => {
  await page.goto('/reports/onepager?monat=2026-08');
  const verdicts = page.getByTestId('report-verdict');
  await expect(verdicts).toHaveCount(2, { timeout: 45_000 });
  const text = await verdicts.first().textContent();
  expect(await verdicts.nth(1).textContent()).toBe(text);
  await page.reload();
  await expect(verdicts.first()).toHaveText(text!, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Vormonat', exact: true }).click();
  await expect(verdicts.first()).not.toHaveText(text!, { timeout: 45_000 });
  await page.keyboard.press('Control+Shift+h');
  await expect(verdicts.first()).toContainText('•••');
  expect(await verdicts.first().textContent()).not.toMatch(/\d/);
  await page.goto('/');
  // #268: the open month is marked as an interim state ("Zwischenstand bis TT.MM.", booked result so far).
  await expect(page.getByTestId('report-verdict')).toContainText(
    /Zwischenstand bis \d{2}\.\d{2}\.: gebuchtes Monatsergebnis/,
    { timeout: 45_000 },
  );
  await expect(page.getByTestId('report-verdict')).toContainText('•••');
});

sampleTest('Fazit: One-Pager prints only the sheet verdict', async ({ page }) => {
  await page.goto('/reports/onepager?monat=2026-08');
  await expect(page.getByTestId('report-verdict')).toHaveCount(2, { timeout: 45_000 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('report-verdict').first()).toBeHidden();
  await expect(page.getByTestId('report-verdict').nth(1)).toBeVisible();
});
