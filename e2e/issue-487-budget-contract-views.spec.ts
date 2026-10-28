import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase, schema } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

function seed(path: string) {
  const opened = openDatabase(path);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents)
      VALUES ('giro','Synthetic checking','checking','budget',1,'2026-08-01',-5000);
      INSERT INTO category_group (id,name) VALUES ('food','Synthetic group'),('bank','Bank und Gebühren');
      INSERT INTO category (id,group_id,name,class,kind)
      VALUES ('food','food','Synthetic food','need','variable'),('fee','bank','Synthetic fee','need','variable');
      INSERT INTO envelope_month (category_id,month,assigned_cents) VALUES ('food','2026-09',30001);
    `);
    for (const [categoryId, date, amountCents] of [
      ['food', '2026-09-10', -30001],
      ['fee', '2026-08-10', -691],
    ] as const) {
      createBooking(
        opened.db,
        { accountId: 'giro', date, amountCents, splits: [{ categoryId, amountCents }] },
        { actor: 'synthetic-487' },
      );
    }
    // Stored observations: the view must never reconstruct a missing historical forecast.
    for (const categoryId of [null, 'food']) {
      opened.db
        .insert(schema.planSnapshot)
        .values({
          id: categoryId ?? 'total',
          month: '2026-09',
          day: 15,
          categoryId,
          plannedCents: 30001,
          spentCents: 15000,
          projectedCents: 30000,
        })
        .run();
    }
  } finally {
    opened.close();
  }
}

async function inspect(page: Page, info: TestInfo, label: string) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('.report-view-switch button').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`${label}-${theme}.png`), fullPage: true });
  }
}

async function privacy(page: Page, hidden: boolean) {
  const profile = page.locator('.m-profile > summary');
  const phone = await profile.isVisible();
  if (phone) await profile.click();
  const button = page.getByRole('button', { name: 'Beträge verbergen', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', String(!hidden));
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(hidden));
  if (phone) await profile.click();
}

async function masked(page: Page, bodyId: string, clearAmount: RegExp, clearVerdict: string) {
  await expect(page.getByTestId(bodyId)).toContainText('••• €');
  await expect(page.getByTestId('report-verdict')).toContainText('•••');
  await expect(page.getByTestId('report-verdict')).not.toHaveText(clearVerdict);
  const exposed = await page.locator('body').evaluate((body) => {
    const attributes = [body, ...body.querySelectorAll('*')].flatMap((element) =>
      [...element.attributes]
        .filter(
          (attribute) =>
            attribute.name.startsWith('aria-') || ['title', 'alt', 'value'].includes(attribute.name),
        )
        .map((attribute) => attribute.value),
    );
    return [body.textContent ?? '', ...attributes].join('\n');
  });
  expect(exposed).not.toMatch(clearAmount);
}

test('Budgettreue retains exact plan and stored forecast bodies, quality, month and query intent', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  const adherence = await (await request.get('/api/reports/spending/adherence?month=2026-09')).json();
  expect(adherence).toMatchObject({
    month: '2026-09',
    planCents: 30001,
    istCents: 30001,
    restCents: 0,
  });
  const accuracy = await (await request.get('/api/reports/planning-accuracy?month=2026-09')).json();
  expect(accuracy).toMatchObject({
    month: '2026-09',
    reliableFrom: '2026-11',
    summary: { count: 1, hits: 1 },
  });
  expect(accuracy.categories).toEqual([
    expect.objectContaining({
      categoryId: 'food',
      plannedCents: 30001,
      projectedCents: 30000,
      actualCents: 30001,
      deviationCents: -1,
    }),
  ]);
  await page.goto('/reports/budgettreue?monat=2026-09');
  await expect(page.getByTestId('ba-over')).toBeVisible();
  const budget = await page.getByTestId('budget-adherence').innerText();
  await inspect(page, info, 'budget');
  await page.goto('/reports/planungstreue?monat=2026-09');
  await expect(page.getByTestId('planning-accuracy')).toContainText('Erst ab November 2026 belastbar');
  const forecast = await page.getByTestId('planning-accuracy').innerText();
  const verdict = await page.getByTestId('report-verdict').innerText();
  await page.goto(
    '/reports/budgettreue?monat=2026-09&zeitraum=1J&darstellung=planungstreue&ansicht=saved-id&exakt=true&projekt=project-id',
  );
  await expect(page.getByTestId('planning-accuracy')).toHaveText(forecast, { useInnerText: true });
  await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
  await expect(page.getByTestId('planning-accuracy')).toContainText(
    'Fehlende Prognosen werden nicht nachträglich geschätzt.',
  );
  const drill = page.getByRole('link', { name: 'Synthetic food', exact: true });
  await expect(drill).toHaveAttribute('href', /kategorie=food.*von=2026-09-01.*bis=2026-09-30/);
  await expect(page.getByRole('link', { name: 'September 2026', exact: true })).toHaveAttribute(
    'href',
    /\/reports\/budgettreue\?/,
  );
  await inspect(page, info, 'planning');
  await page.getByRole('button', { name: 'Plan und Ist', exact: true }).click();
  await expect(page.getByTestId('budget-adherence')).toHaveText(budget, { useInnerText: true });
  const query = new URL(page.url()).searchParams;
  for (const [key, value] of Object.entries({
    monat: '2026-09',
    zeitraum: '1J',
    darstellung: 'budget',
    ansicht: 'saved-id',
    exakt: 'true',
    projekt: 'project-id',
  })) {
    expect(query.get(key)).toBe(value);
  }
  await page.reload();
  await expect(page.getByTestId('ba-over')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('planning-accuracy')).toHaveText(forecast, { useInnerText: true });
  await page.getByRole('button', { name: 'Vormonat', exact: true }).click();
  await expect(page).toHaveURL(/monat=2026-08/);
  await expect(page.getByTestId('planning-accuracy')).toContainText(
    'Für diesen Monat liegt noch kein Vergleich vor.',
  );

  await page.goto('/reports/budgettreue?monat=2026-09');
  await expect(page.getByTestId('budget-adherence')).toHaveText(budget, { useInnerText: true });
  await expect(page.getByTestId('budget-adherence')).toContainText('300,01 €');
  const budgetVerdict = await page.getByTestId('report-verdict').innerText();
  await privacy(page, true);
  await masked(page, 'budget-adherence', /300[,.]01/, budgetVerdict);
  await page.getByRole('button', { name: 'Planungstreue', exact: true }).click();
  await masked(page, 'planning-accuracy', /300[,.]0[01]/, verdict);
  await privacy(page, false);
  await expect(page.getByTestId('planning-accuracy')).toHaveText(forecast, { useInnerText: true });
  await expect(page.getByTestId('planning-accuracy')).toContainText('300,01 €');
  await expect(page.getByTestId('planning-accuracy')).toContainText('300,00 €');
  await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
  await page.getByRole('button', { name: 'Plan und Ist', exact: true }).click();
  await expect(page.getByTestId('budget-adherence')).toHaveText(budget, { useInnerText: true });
  await expect(page.getByTestId('report-verdict')).toHaveText(budgetVerdict, { useInnerText: true });
});

test('Verträge und Kosten retains separate source periods, subtotal coverage and legacy bodies', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  seed(isolatedLedger.databasePath);
  const costs = await (await request.get('/api/reports/spending/costs')).json();
  expect(costs).toMatchObject({
    asOf: '2026-10-02',
    from: '2026-08-01',
    to: '2026-09-30',
    totalCents: 691,
    modeledInterestMissingFxPeriods: 0,
  });
  expect(costs.months).toEqual(['2026-08', '2026-09']);
  const contracts = await (await request.get('/api/reports/spending/contracts')).json();
  expect(contracts).toMatchObject({
    asOf: '2026-10-02',
    boundMonthlyCents: 0,
    unconvertedCount: 0,
  });
  await page.goto('/reports/abos');
  await expect(page.getByTestId('contracts-report')).toContainText('Noch keine Verträge');
  const contractBody = await page.getByTestId('contracts-report').innerText();
  await inspect(page, info, 'contracts');
  await page.goto('/reports/kosten');
  await expect(page.getByTestId('bc-total')).toHaveText('6,91 €');
  const bankBody = await page.getByTestId('bank-costs-report').innerText();
  const verdict = await page.getByTestId('report-verdict').innerText();
  await page.goto(
    '/reports/abos?monat=2020-01&zeitraum=1M&darstellung=bankkosten&ansicht=saved-id&exakt=true&projektUngueltig=true',
  );
  await expect(page.getByTestId('bank-costs-report')).toHaveText(bankBody, { useInnerText: true });
  await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
  await expect(page.getByTestId('bc-components')).toContainText(
    'Gebucht: 6,91 € · aus Konditionen geschätzt: 0,00 €',
  );
  await expect(page.getByTestId('bc-coverage')).toContainText('nicht die vollständige Gesamtbelastung');
  await expect(page.getByTestId('bc-coverage')).toContainText('02.10.2026: 1');
  await inspect(page, info, 'bank-costs');
  await page.reload();
  await expect(page.getByTestId('bank-costs-report')).toHaveText(bankBody, { useInnerText: true });
  await page.getByRole('button', { name: 'Verträge', exact: true }).click();
  await expect(page.getByTestId('contracts-report')).toHaveText(contractBody, { useInnerText: true });
  const query = new URL(page.url()).searchParams;
  for (const [key, value] of Object.entries({
    monat: '2020-01',
    zeitraum: '1M',
    darstellung: 'vertraege',
    ansicht: 'saved-id',
    exakt: 'true',
    projektUngueltig: 'true',
  })) {
    expect(query.get(key)).toBe(value);
  }
  await page.goBack();
  await expect(page.getByTestId('bank-costs-report')).toHaveText(bankBody, { useInnerText: true });

  await expect(page.getByTestId('bc-total')).toHaveText('6,91 €');
  await expect(page.getByTestId('report-verdict')).toContainText('6,91 €');
  await privacy(page, true);
  await expect(page.getByTestId('bc-total')).toHaveText('••• €');
  await masked(page, 'bank-costs-report', /6[,.]91/, verdict);
  await page.getByRole('button', { name: 'Verträge', exact: true }).click();
  // This fixture has no contracts; only the bank reader's known money is asserted for privacy.
  await expect(page.getByTestId('contracts-report')).toContainText('Noch keine Verträge');
  await page.getByRole('button', { name: 'Bank- und Zinskosten', exact: true }).click();
  await expect(page.getByTestId('bc-total')).toHaveText('••• €');
  await masked(page, 'bank-costs-report', /6[,.]91/, verdict);
  await privacy(page, false);
  await expect(page.getByTestId('bc-total')).toHaveText('6,91 €');
  await expect(page.getByTestId('bank-costs-report')).toHaveText(bankBody, { useInnerText: true });
  await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
});
