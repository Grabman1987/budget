import { withShellControls } from './shell-actions';
import AxeBuilder from '@axe-core/playwright';
import { createBooking, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('554 signed group pilot has exact lead/category/Explorer/drill totals and compact accessible defaults', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('budget','Synthetic pilot','checking','budget',1,'2026-08-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic same name'),('other','Synthetic same name');
      INSERT INTO category (id,group_id,name,class,kind) VALUES ('refund','other','Synthetic refund','want','variable'),('zero','other','Synthetic zero','need','variable'),('future','g','Synthetic future','future','saving');
    `);
    for (let i = 0; i < 7; i++) {
      opened.sqlite
        .prepare(
          "INSERT INTO category (id,group_id,name,class,kind) VALUES (?,'g',?,'need','variable')",
        )
        .run(`c${i}`, `Synthetic category ${i}`);
      for (const [date, amount] of [
        ['2026-08-15', 100],
        ['2026-09-03', (i + 1) * 100],
      ] as const)
        createBooking(
          opened.db,
          {
            accountId: 'budget',
            date,
            amountCents: -amount,
            splits: [{ categoryId: `c${i}`, amountCents: -amount }],
          },
          { actor: 'synthetic-fixture' },
        );
    }
    createBooking(
      opened.db,
      {
        accountId: 'budget',
        date: '2026-09-04',
        amountCents: 555,
        splits: [{ categoryId: 'refund', amountCents: 555 }],
      },
      { actor: 'synthetic-fixture' },
    );
    createBooking(
      opened.db,
      {
        accountId: 'budget',
        date: '2026-09-04',
        amountCents: -9999,
        splits: [{ categoryId: 'future', amountCents: -9999 }],
      },
      { actor: 'synthetic-fixture' },
    );
  } finally {
    opened.close();
  }
  const setPrivacy = async (hidden: boolean) => {
    await withShellControls(page, async ({ privacy }) => {
      await expect(privacy).toHaveAttribute('aria-pressed', String(!hidden));
      await privacy.click();
      await expect(privacy).toHaveAttribute('aria-pressed', String(hidden));
    });
  };
  await page.goto('/reports/ausgaben?zeitraum=1M');
  await expect(page.getByTestId('sa-consumption')).toHaveText('22,45 €');
  await expect(page.getByTestId('report-answer')).toContainText(
    '22,45 € netto ausgegeben, 15,45 € mehr',
  );
  await expect(page.locator('.sa-groups > li')).toHaveCount(2);
  await expect(page.locator('[data-group="g"] > .sa-row > .sa-amount')).toHaveText('28,00 €');
  await expect(page.locator('[data-group="other"] > .sa-row > .sa-amount')).toHaveText('−5,55 €');
  await expect(page.locator('.sa-prior-tick').first()).toBeVisible();
  for (const id of ['sa-moves', 'sa-classes', 'sa-explorer'])
    await expect(page.locator(`section[aria-labelledby="${id}"]`)).toHaveAttribute(
      'data-collapsed',
      'true',
    );
  if (info.project.name === 'desktop') {
    const box = await page.locator('[data-testid="spending-analysis"]').boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(1800);
    const lead = await page.getByTestId('sa-consumption').boundingBox();
    expect(lead!.y + lead!.height).toBeLessThanOrEqual(900);
  }
  await page.locator('section[aria-labelledby="sa-classes"] .section-toggle').click();
  await page.reload();
  await expect(page.locator('section[aria-labelledby="sa-classes"]')).not.toHaveAttribute(
    'data-collapsed',
    'true',
  );
  await page.locator('section[aria-labelledby="sa-classes"] .section-toggle').click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (info.project.name !== 'desktop')
      for (const control of await page.locator('.sa-group-name,.sa-amount:visible').all()) {
        await control.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        const r = await control.boundingBox();
        expect(r!.height).toBeGreaterThanOrEqual(44);
        expect(r!.width).toBeGreaterThanOrEqual(44);
        expect(r!.x).toBeGreaterThanOrEqual(0);
        expect(r!.x + r!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(
          await control.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            );
          }),
        ).toBe(true);
      }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`pilot-${theme}-${info.project.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
  await page.locator('[data-group="g"] .sa-group-name').click();
  await expect(page.locator('[data-group="g"] [data-category]:visible')).toHaveCount(7);
  await page.locator('[data-group="other"] .sa-group-name').click();
  await expect(page.locator('[data-category="zero"] > .sa-amount')).toHaveText('0,00 €');
  await expect(page.locator('[data-category="refund"] > .sa-amount')).toHaveText('−5,55 €');
  await page.getByRole('button', { name: 'Tabelle anzeigen', exact: true }).click();
  await expect(page.locator('#sa-data-table tbody tr')).toHaveCount(11);
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await setPrivacy(true);
  await expect(page.getByTestId('sa-consumption')).toHaveText('••• €');
  await expect(page.getByTestId('report-answer')).not.toContainText('22,45');
  await expect(page.locator('[data-group="g"] > .sa-row > .sa-amount')).toHaveText('••• €');
  await setPrivacy(false);
  await expect(page.getByTestId('sa-consumption')).toHaveText('22,45 €');
  await expect(page.locator('[data-group="g"] > .sa-row > .sa-amount')).toHaveText('28,00 €');
  await page.locator('[data-group="g"] > .sa-row > .sa-amount').click();
  await expect(page).toHaveURL(/kategoriegruppe=g/);
  await expect(page.locator('p.ksum')).toContainText('Gruppe netto 28,00 €');
  await expect(page.locator('tr[data-booking]')).toHaveCount(7);
  await page.goBack();
  await expect(page.getByTestId('sa-consumption')).toHaveText('22,45 €');
  await page.locator('section[aria-labelledby="sa-explorer"] .section-toggle').click();
  const explorer = page.getByRole('link', { name: 'In Auswertung öffnen', exact: true });
  await expect(explorer).toHaveAttribute('href', /exakt=true/);
  await explorer.click();
  await expect(page.getByTestId('template-heatmap')).toBeVisible();
  await expect(page.getByTestId('template-heatmap').locator('thead th')).toHaveCount(3);
  await expect(page.locator('[data-template-row="cat:refund"]')).toContainText('−5,55 €');
  await expect(page.locator('[data-template-row="cat:zero"]')).toContainText('0,00 €');
  const facts = await (
    await page.request.get(`${isolatedLedger.origin}/api/reports/spending/analysis?period=1M`)
  ).json();
  expect(facts.consumptionCents).toBe(2245);
  await page.reload();
  await expect(page.locator('[data-template-row="cat:refund"]')).toContainText('−5,55 €');
});
