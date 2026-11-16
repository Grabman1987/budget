import { retainBudgetCostInflationReaders } from './budget-cost-inflation-controls';
import { openHeuteReview } from './heute-visual-fixture';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  openDatabase,
  accounts,
  categories,
  createEntity,
  createBooking,
  capturePlanSnapshot,
  schema,
} from '@budget/db';
import { test } from './isolated-ledger';

test('retired forecast bookmarks retain snapshot facts, Budgettreue drilldown and the Heute note', async ({
  page,
  request,
  isolatedLedger,
}) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  const ctx = { actor: 'tester' };
  try {
    accounts.create(
      opened.db,
      {
        id: 'accuracy-cash',
        name: 'Synthetic cash',
        type: 'cash',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-07-01',
        openingBalanceCents: 100_000,
      },
      ctx,
    );
    createEntity(
      opened.db,
      schema.categoryGroup,
      { id: 'accuracy-group', name: 'Synthetic group' },
      ctx,
    );
    categories.create(
      opened.db,
      { id: 'accuracy-food', name: 'Synthetic food', groupId: 'accuracy-group', class: 'need' },
      ctx,
    );
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      opened.db
        .insert(schema.envelopeMonth)
        .values({ categoryId: 'accuracy-food', month, assignedCents: 30_000 })
        .run();
      createBooking(
        opened.db,
        {
          accountId: 'accuracy-cash',
          date: `${month}-10`,
          amountCents: -15_000,
          splits: [{ categoryId: 'accuracy-food', amountCents: -15_000 }],
        },
        ctx,
      );
      capturePlanSnapshot(opened.db, month, `${month}-15`);
      createBooking(
        opened.db,
        {
          accountId: 'accuracy-cash',
          date: `${month}-20`,
          amountCents: -15_000,
          splits: [{ categoryId: 'accuracy-food', amountCents: -15_000 }],
        },
        ctx,
      );
    }
  } finally {
    opened.close();
  }
  await page.goto('/reports/planungstreue?monat=2026-09');
  const accuracy = await (await request.get('/api/reports/planning-accuracy?month=2026-09')).json();
  expect(accuracy.summary).toMatchObject({ count: 3, hits: 3 });
  expect(accuracy.categories).toEqual([
    expect.objectContaining({ categoryId: 'accuracy-food', actualCents: 30000 }),
  ]);
  await expect(page.getByTestId('budget-adherence')).toBeVisible();
  await expect(page.getByTestId('planning-accuracy')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute('data-theme', value),
      theme,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/planning-accuracy-${test.info().project.name}-${theme}.png`,
      fullPage: true,
    });
  }
  await page.screenshot({
    path: `test-results/planning-accuracy-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Synthetic food' }).click();
  await expect(page).toHaveURL(/\/konten\/buchungen.*kategorie=accuracy-food/);
  await openHeuteReview(page, '/');
  const more = page.getByRole('button', { name: 'Mehr zum Monat' });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  await expect(
    page.getByText(/Deine Hochrechnung lag zuletzt im Schnitt 2 % daneben/),
  ).toBeVisible();
});

test.beforeEach(async ({ page }) => retainBudgetCostInflationReaders(page));
