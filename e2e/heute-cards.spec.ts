import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';
import type { Heute } from '../apps/web/src/heute/api';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { eur } from '../apps/web/src/ledger/format';

test('three Kennzahlen use source cents, fit the phone and link to the current source views', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto('/?monat=2026-08');
  const data: Heute = await (await page.request.get('/api/heute?month=2026-08')).json();
  const budget: BudgetMonthView = await (await page.request.get('/api/budget/2026-08')).json();
  const cards = page.locator('.heute-kennzahl');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('heute-kennzahlen').getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Verfügbar im Budget',
    'Nettovermögen',
  ]);
  // The lead figure belongs to Bis Gehalt, which only exists in the current month.
  await expect(page.getByTestId('heute-lead-value')).toHaveCount(0);
  if ('unavailable' in data.netWorth) throw new Error('Synthetic valuation unavailable');
  await expect(cards.nth(2).locator('.heute-answer-value')).toHaveText(
    eur(data.netWorth.totalCents),
  );
  await expect(cards.nth(0).locator('.heute-answer-value')).toHaveText(
    eur(budget.summary.toBeAssignedCents),
  );
  // Verfügbar im Budget is the sum of the envelope amounts that the Plan inspector shows.
  const availableCents = budget.summary.envelopes.reduce(
    (sum, envelope) => sum + envelope.availableCents,
    0,
  );
  await expect(cards.nth(1).locator('.heute-answer-value')).toHaveText(eur(availableCents));
  // The Haushaltseinnahmen of the former Monatsergebnis card sit in the derivation of Zu verteilen.
  const derivation = cards.nth(0).getByRole('button', { name: 'Herleitung Zu verteilen' });
  await derivation.click();
  await expect(cards.nth(0)).toContainText(
    `Haushaltseinnahmen ${eur(data.monthResult.earnedCents)}`,
  );
  await derivation.click();
  const bar = cards.nth(1).locator('.heute-answer-bar');
  await expect(bar).toHaveAttribute(
    'aria-label',
    new RegExp(`Tag ${data.budgetAnswer.day} von ${data.budgetAnswer.daysInMonth}$`),
  );
  // CSSOM serializes percentages to fewer decimals than JavaScript.
  expect(
    await bar
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
  // Current month in Bis Gehalt: the middle Kennzahl is the lead figure of the API.
  const payday: Heute = await (
    await page.request.get('/api/heute?month=2026-09&period=payday')
  ).json();
  await page.goto('/?monat=2026-09&period=payday');
  await expect(cards).toHaveCount(3);
  await expect(page.getByTestId('heute-kennzahlen').getByRole('heading', { level: 2 })).toHaveText([
    'Zu verteilen',
    'Frei bis Gehalt',
    'Nettovermögen',
  ]);
  await expect(page.getByTestId('heute-lead-value')).toHaveCount(1);
  await expect(cards.nth(1).locator('.heute-answer-value')).toHaveText(eur(payday.lead.freeCents));
  await expect(cards.nth(1).locator('.heute-answer-bar')).toHaveAttribute(
    'aria-label',
    new RegExp(`Tag ${payday.budgetAnswer.day} von ${payday.budgetAnswer.daysInMonth}$`),
  );
  await expect(page.getByTestId('liquidity-chart')).toBeVisible();
  const dir = 'docs/evidence/heute-hints-1009/cards';
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
      // The phone shows a compact list: every Kennzahl stays within the former card budget.
      for (const box of boxes) expect(box.height).toBeLessThanOrEqual(120);
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
  await page.getByTestId('heute-lead-value').click();
  await expect(page.locator('#heute-lead-chain')).toBeVisible();
  await cards
    .nth(0)
    .locator('a', { has: page.locator('.heute-answer-value') })
    .click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09/);
  await expect(page.getByTestId('to-be-assigned')).toBeVisible();
});

test('explains plan-rest behind the derivation of the negative payday room on phone and desktop in both themes', async ({
  page,
}, info) => {
  const response = await page.request.get('/api/heute?month=2026-09&period=payday');
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
  // Same figures in both modes: Bis Gehalt shows the lead, Monat the envelope sum.
  await page.route('**/api/heute?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('period=month')
          ? { ...data, stand: { ...data.stand, period: 'month' } }
          : data,
      ),
    }),
  );
  await page.goto('/?monat=2026-09&period=month');
  const month = page.locator('.heute-kennzahl').nth(1);
  await expect(month.getByRole('heading', { name: 'Verfügbar im Budget' })).toBeVisible();
  await month.getByRole('button', { name: 'Herleitung Verfügbar im Budget' }).click();
  await expect(month).toContainText(
    'Ausgabenplan: 600,00 € ausgegeben von 1.000,00 € · Plan-Rest 400,00 €',
  );
  await page.goto('/?monat=2026-09&period=payday');
  const budget = page.locator('.heute-kennzahl').nth(1);
  await expect(budget.getByRole('heading', { name: 'Frei bis Gehalt' })).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toHaveText('−100,00 €');
  const derivation = budget.getByRole('button', { name: 'Herleitung Frei bis Gehalt' });
  await expect(derivation).toHaveAttribute('aria-expanded', 'false');
  await derivation.click();
  await expect(derivation).toHaveAttribute('aria-expanded', 'true');
  const note = page.locator('#kennzahl-frei-bis-gehalt-note');
  await expect(note).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toHaveAttribute(
    'aria-describedby',
    'kennzahl-frei-bis-gehalt-note',
  );
  await expect(note).toContainText('Ausgabenplan: 600,00 € ausgegeben von 1.000,00 €');
  await expect(note).toContainText(
    'Verfügbar in allen Envelopes für Bedarf und Wunsch, abzüglich der Rechnungen, die vor dem Gehalt noch fällig sind',
  );
  await expect(note).toContainText('Plan-Rest 400,00 €');
  await expect(note).toContainText('kein Kontoguthaben');
  await page.getByTestId('heute-lead-value').click();
  await expect(page.locator('#heute-lead-chain')).toContainText('offen bis Gehalt');
  await expect(page.locator('#heute-lead-chain')).toContainText('−100');
  await expect(page.locator('#heute-lead-chain')).toBeVisible();
  const dir = 'docs/evidence/heute-hints-1009/budget';
  mkdirSync(dir, { recursive: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await expect(note).toBeVisible();
    const path = `${dir}/${info.project.name}-${theme}.png`;
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    await info.attach(`Plan-Rest ${info.project.name} ${theme}`, {
      path,
      contentType: 'image/png',
    });
  }
});
