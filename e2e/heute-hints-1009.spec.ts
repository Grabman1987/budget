import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect as baseExpect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import type { RuleBook } from '../apps/web/src/rules/api';

const expect = baseExpect.configure({ timeout: 15_000 });

test('Today keeps payday first, unknown counts explicit and additional steps consistent', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const data: Heute = await (await page.request.get('/api/heute?month=2026-09')).json();
  data.financeCheck = {
    counts: { ok: 0, warn: 1, bad: 2, notEvaluated: 3, total: 6 },
    keyRules: [],
    actionRules: [
      {
        code: 'R02',
        name: 'Notgroschen',
        valueText: '2,5 Monate',
        actionText: 'Notgroschen aufstocken.',
      },
    ],
  };
  data.attention.inboxCount = 2;
  const book: RuleBook = await (await page.request.get('/api/rules')).json();
  for (const rule of book.rules) {
    if (rule.code === 'R02') {
      rule.latest = {
        asOf: '2026-09-17',
        status: 'bad',
        valueText: '2,5 Monate',
        actionNeeded: true,
        actionText: 'Notgroschen aufstocken.',
      };
    }
    if (['R04', 'R05', 'R06'].includes(rule.code)) {
      rule.enabled = true;
      rule.latest = null;
      rule.unavailableReason = 'Monatliche Ausgaben fehlen.';
    }
  }
  await page.route('**/api/rules', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: book });
    else await route.continue();
  });
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: data }));
  await page.route('**/api/savings-plans/execution-proposals*', (route) =>
    route.fulfill({ json: { proposals: [] } }),
  );
  await page.goto('/?monat=2026-09');
  const first = page.locator('.heute-answer').first();
  await expect(first.getByRole('heading', { name: 'Frei bis Gehalt', exact: true })).toBeVisible();
  await expect(first).toContainText('Bis 15.10. · noch 28 Tage');
  await expect(first).toContainText('Nächster erwarteter Geldeingang: 30.09. · 3.812,00 €');
  const more = page.getByRole('button', { name: /Mehr zum Monat/ });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  await expect(page.locator('.heute-next-steps')).toContainText('Keine zusätzlichen Schritte.');
  await expect(page.locator('.heute-next-steps')).toContainText('Braucht Aufmerksamkeit');
  await expect(page.locator('.heute-check-counts')).toContainText('0 erfüllt');
  await expect(page.locator('.heute-check-counts')).toContainText('1 Warnung');
  await expect(page.locator('.heute-check-counts')).toContainText('2 verletzt');
  await expect(page.locator('.heute-check-counts')).toContainText('3 nicht auswertbar');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.heute-answers')
          .include('.heute-check-counts')
          .analyze()
      ).violations,
    ).toEqual([]);
    const dir = 'docs/evidence/heute-hints-1009';
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${info.project.name}-${theme}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.getByRole('link', { name: 'Fehlende Angaben ansehen' }).click();
  await expect(page).toHaveURL(/regelwerk#rw-pending$/);
  await expect(page.locator('#rw-pending')).toBeFocused();
  await expect(page.locator('#rw-pending').locator('..')).toContainText('Nicht prüfbar:');
  await page.goBack();
  await page.getByRole('link', { name: 'Handeln', exact: true }).click();
  await expect(page).toHaveURL(/regelwerk#rule-result-R02$/);
  const finding = page.locator('#rule-result-R02');
  await expect(finding).toBeFocused();
  await expect(finding).toContainText('Ist: 2,5 Monate');
  await expect(finding).toContainText('Schwelle: min. 3, Ziel 6 Monate');
  await expect(finding.getByRole('link', { name: 'Im Plan aufstocken' })).toBeVisible();
  await expect(finding.getByRole('button', { name: /^Einstellen R02/ })).toBeVisible();
  const actionBox = await finding.getByRole('link').boundingBox();
  expect(actionBox!.height).toBeGreaterThanOrEqual(44);
  await finding.getByRole('link', { name: 'Im Plan aufstocken' }).click();
  await expect(page).toHaveURL(/\/plan\/monat/);
});

test('tiny actual income stays the denominator and offers a completed comparison', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-09-17T10:00:00Z'));
  await page.route('**/api/budget/2026-09', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.summary.incomeCents = 1_000;
    await route.fulfill({ response, json: data });
  });
  await page.goto('/plan/monat?monat=2026-09');
  const split = page.getByRole('region', { name: '50/30/20', exact: true });
  await expect(split).toContainText('Eingeschränkte Vergleichsbasis');
  await expect(split).toContainText('Ist-Einnahmen im Planmonat September 2026: 10,00 €');
  await expect(split).toContainText('Erwartete Einnahmen sind nicht enthalten.');
  await expect(split).not.toContainText('Bedarf über 50 %');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const link = split.getByRole('link', { name: 'Abgeschlossenen Monat August 2026 vergleichen' });
  const box = await link.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page).toHaveURL(/\/reports\/onepager\?monat=2026-08/);
  await expect(page.getByTestId('onepager-split')).toBeVisible();
});
