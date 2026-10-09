import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import { eur } from '../apps/web/src/ledger/format';

test('three answer cards use source cents, fit the phone and link to the current source views', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto('/?monat=2026-08');
  const data: Heute = await (await page.request.get('/api/heute?month=2026-08')).json();
  const cards = page.locator('.heute-answer');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('heute-lead-value')).toHaveCount(1);
  if ('unavailable' in data.netWorth) throw new Error('Synthetic valuation unavailable');
  await expect(cards.nth(0).locator('.heute-answer-value')).toHaveText(
    eur(data.netWorth.totalCents),
  );
  await expect(cards.nth(1).locator('.heute-answer-value')).toHaveText(
    eur(data.monthResult.savedCents),
  );
  await expect(cards.nth(2).locator('.heute-answer-value')).toHaveText(eur(data.lead.freeCents));
  await expect(cards.nth(1)).toContainText(
    `Haushaltseinnahmen ${eur(data.monthResult.earnedCents)}`,
  );
  await expect(cards.nth(2)).toContainText(
    `Tag ${data.budgetAnswer.day} von ${data.budgetAnswer.daysInMonth}`,
  );
  // CSSOM serializes percentages to fewer decimals than JavaScript.
  expect(
    await cards
      .nth(2)
      .locator('.heute-answer-marker')
      .evaluate((node) => parseFloat((node as HTMLElement).style.left)),
  ).toBeCloseTo((data.budgetAnswer.day / data.budgetAnswer.daysInMonth) * 100, 3);
  const goal = data.nearestGoal;
  if (goal)
    await expect(page.locator('.heute-nearest-goal')).toHaveText(
      `${goal.name} · gespart ${eur(goal.savedCents)} · fehlt ${eur(goal.remainingCents)}`,
    );
  else await expect(page.locator('.heute-nearest-goal')).toHaveCount(0);
  await expect(page.getByTestId('heute-month-note')).toBeVisible();
  await page.goto('/?monat=2026-09');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('heute-balance-chart')).toBeVisible();
  const dir = 'docs/evidence/heute-cards-1005';
  mkdirSync(dir, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await page.evaluate(() => document.fonts.ready);
    const boxes = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, height: rect.height };
      }),
    );
    if (info.project.name === 'mobile') {
      const incomeExplanation = cards.nth(1).locator('p', {
        hasText: 'Haushaltseinnahmen im September 2026 nach Buchungsdatum.',
      });
      await expect(incomeExplanation).toBeVisible();
      const explanationBox = await incomeExplanation.boundingBox();
      expect(explanationBox).not.toBeNull();
      // Keep the compact card budget, allowing only the newly visible explanation and grid gap.
      expect(boxes[0]!.height).toBeLessThanOrEqual(120);
      expect(boxes[1]!.height - explanationBox!.height - 4).toBeLessThanOrEqual(120);
      expect(boxes[2]!.height).toBeLessThanOrEqual(120);
      expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);
      expect(boxes[2]!.y).toBeGreaterThanOrEqual(boxes[1]!.y + boxes[1]!.height);
    } else expect(boxes.map((box) => box.y)).toEqual([boxes[0]!.y, boxes[0]!.y, boxes[0]!.y]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const axe = await new AxeBuilder({ page }).include('.heute-answers').analyze();
    expect(axe.violations).toEqual([]);
    await page.screenshot({
      path: `${dir}/${info.project.name}-${theme}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await cards.nth(2).getByRole('button').click();
  await expect(page.locator('#heute-lead-chain')).toBeVisible();
  await cards
    .nth(1)
    .locator('a', { has: page.locator('.heute-answer-value') })
    .click();
  await expect(page).toHaveURL(/\/reports\/onepager\?monat=2026-09/);
  await expect(page.getByRole('heading', { name: 'Monats-One-Pager', exact: true })).toBeVisible();
});

test('explains plan-rest beside negative payday room on phone and desktop in both themes', async ({
  page,
}, info) => {
  const response = await page.request.get('/api/heute?month=2026-09');
  expect(response.ok()).toBe(true);
  const data: Heute = await response.json();
  data.lead.freeCents = -10_000;
  data.budgetAnswer = {
    spentCents: 60_000,
    plannedCents: 100_000,
    remainingCents: 40_000,
    day: 17,
    daysInMonth: 30,
  };
  data.lead.needCents = 25_000;
  data.lead.wantCents = 15_000;
  data.lead.openCents = 50_000;
  data.lead.chain = [
    { label: 'Bedarf', value: 25_000 },
    { label: 'Wunsch', value: 15_000, op: '+' },
    { label: 'offen bis Gehalt', value: 50_000, op: '-' },
    { label: 'frei verfügbar', value: -10_000, op: '=', result: true },
  ];
  await page.route('**/api/heute?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }),
  );
  await page.goto('/?monat=2026-09');
  const budget = page.locator('.heute-answer').nth(2);
  await expect(budget.getByRole('heading', { name: 'Frei bis Gehalt' })).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toHaveText('−100,00 €');
  await expect(budget).toContainText(
    'Ausgabenplan: 600,00 € ausgegeben von 1.000,00 € · Plan-Rest 400,00 €',
  );
  await expect(page.getByTestId('heute-lead-value')).toHaveAttribute(
    'aria-describedby',
    'heute-plan-rest-note',
  );
  await expect(page.getByTestId('heute-plan-rest-note')).toContainText('kein Kontoguthaben');
  await expect(page.getByTestId('heute-plan-rest-note')).toContainText(
    'verfügbares Bedarf-/Wunschbudget minus offene Rechnungen',
  );
  await expect(page.getByTestId('heute-plan-rest-note')).toBeVisible();
  await page.getByTestId('heute-lead-value').click();
  await expect(page.locator('#heute-lead-chain')).toContainText('offen bis Gehalt');
  await expect(page.locator('#heute-lead-chain')).toContainText('−100');
  await expect(page.locator('#heute-lead-chain')).toBeVisible();
  const dir = 'docs/evidence/heute-budget-copy-264';
  mkdirSync(dir, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await expect(page.getByTestId('heute-plan-rest-note')).toBeVisible();
    const path = `${dir}/${info.project.name}-${theme}.png`;
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    await info.attach(`Plan-Rest ${info.project.name} ${theme}`, {
      path,
      contentType: 'image/png',
    });
  }
});
