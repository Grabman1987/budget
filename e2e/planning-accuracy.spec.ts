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

test('Budgettreue shows observed forecasts, sorted category misses and booking drilldown', async ({
  page,
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
  await expect(page.getByRole('heading', { name: /Trefferquote 6 Monate: 3 von 3/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Monatliche Abweichung in Prozent' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic food' })).toHaveAttribute(
    'href',
    /kategorie=accuracy-food/,
  );
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
  await page.goto('/');
  const more = page.getByRole('button', { name: 'Mehr zum Monat' });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  await expect(
    page.getByText(/Deine Hochrechnung lag zuletzt im Schnitt 2 % daneben/),
  ).toBeVisible();
});
