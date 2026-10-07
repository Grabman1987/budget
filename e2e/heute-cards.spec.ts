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
  await expect(cards.nth(1)).toContainText(`Einnahmen ${eur(data.monthResult.earnedCents)}`);
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
      for (const box of boxes) expect(box.height).toBeLessThanOrEqual(120);
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
      expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y);
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
  await cards.nth(1).getByRole('link').click();
  await expect(page).toHaveURL(/\/reports\/onepager\?monat=2026-09/);
  await expect(page.getByRole('heading', { name: 'Monats-One-Pager', exact: true })).toBeVisible();
});
