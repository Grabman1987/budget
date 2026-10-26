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
  const data: Heute = await (
    await page.request.get('/api/heute?month=2026-09&period=payday')
  ).json();
  if ('unavailable' in data.financeCheck) throw new Error('Expected evaluated synthetic rules');
  const liveCounts = data.financeCheck.counts;
  expect(liveCounts.ok + liveCounts.warn + liveCounts.bad + liveCounts.notEvaluated).toBe(
    liveCounts.total,
  );
  data.financeCheck = {
    counts: { ok: 0, warn: 1, bad: 2, notEvaluated: 3, total: 6 },
    keyRules: [],
    actionRules: [
      {
        code: 'R02',
        name: 'Notgroschen',
        status: 'bad',
        valueText: '2,5 Monate',
        actionText: 'Notgroschen aufstocken.',
      },
      {
        code: 'R15',
        name: 'Spekulativer Anteil',
        status: 'bad',
        valueText: 'Über Schwelle',
        actionText: 'Anteil prüfen.',
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
  await page.goto('/?monat=2026-09&period=payday');
  // #571: Zu verteilen leads; Frei bis Gehalt is the middle Kennzahl in the mode Bis Gehalt.
  const first = page.locator('.heute-kennzahl').first();
  await expect(first.getByRole('heading', { name: 'Zu verteilen', exact: true })).toBeVisible();
  const payday = page.locator('.heute-kennzahl').nth(1);
  await expect(payday.getByRole('heading', { name: 'Frei bis Gehalt', exact: true })).toBeVisible();
  await expect(payday).toContainText('Bis 15.10. · noch 28 Tage');
  // The next salary stays marked on the forecast and named in the derivation of Frei bis Gehalt.
  await expect(
    page.getByTestId('liquidity-chart').getByTestId('liquidity-mark-gehalt'),
  ).toBeAttached();
  await payday.getByRole('button', { name: 'Herleitung Frei bis Gehalt' }).click();
  await expect(payday).toContainText('Nächster erwarteter Geldeingang: 30.09. · 3.812,00 €');
  const more = page.getByRole('button', { name: /Mehr zum Monat/ });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  await expect(page.getByRole('heading', { name: 'Nächste Schritte' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Zu tun' })).toContainText('2 unter Prüfen');
  const tasks = page.getByRole('region', { name: 'Zu tun' });
  await expect(page.getByRole('region', { name: 'Finanz-Check', exact: true })).toHaveCount(0);
  await expect(tasks.locator('.attention-row').filter({ hasText: 'Regelbefund' })).toHaveCount(1);
  await expect(tasks).toContainText('2 Regelbefunde zum Handeln');
  await tasks.locator('.attention-availability summary').click();
  await expect(tasks.locator('.attention-availability')).toContainText(
    '3 Regeln konnten nicht ausgewertet werden.',
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('.heute-answers')
          .include('.heute-attention')
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
  await tasks.getByRole('link', { name: 'Regeln prüfen' }).click();
  await expect(page).toHaveURL(/\/einstellungen\/regelwerk$/);
  await expect(page.locator('#rw-pending').locator('..')).toContainText('Nicht prüfbar:');
  await page.goBack();
  await page.getByRole('link', { name: 'Handeln', exact: true }).click();
  await expect(page).toHaveURL(/regelwerk#rule-result-R02$/);
  const finding = page.locator('#rule-result-R02');
  await expect(finding).toBeFocused();
  await expect(finding).toContainText('Ist: 2,5 Monate');
  await expect(finding).toContainText('Schwelle: min. 3, Ziel 6 Monate');
  await expect(finding.getByRole('link', { name: 'Im Plan aufstocken' })).toBeVisible();
  await expect(finding.getByRole('link', { name: /^Einstellen R02/ })).toHaveAttribute(
    'href',
    /\/einstellungen\/regelwerk\/R02/,
  );
  const actionBox = await finding.getByRole('link', { name: 'Im Plan aufstocken' }).boundingBox();
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
  await page.locator('.inspector-section > summary').filter({ hasText: '50/30/20' }).click();
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
