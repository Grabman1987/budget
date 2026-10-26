import AxeBuilder from '@axe-core/playwright';
import { expect, type Request } from '@playwright/test';
import { test } from './isolated-ledger';

test('calendar-year scenario: literal December parity, dated inspection and compact accessible layout', async ({
  page,
  isolatedLedger,
}, info) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api${path}`, {
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await post('/accounts', {
    name: 'Synthetisches Jahreskonto',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100_001,
  });
  const { group } = await post('/categories/groups', { name: 'Synthetische Jahresgruppe' });
  await post('/categories', {
    name: 'Synthetische Jahreskategorie',
    groupId: group.id,
    class: 'want',
    kind: 'variable',
  });
  for (const event of [
    {
      name: 'Monatliche Ausgabe',
      date: '2026-10-31',
      amountCents: -10_001,
      recurrence: 'monthly',
      recurrenceUntil: '2026-12-31',
    },
    { name: 'Geplante Gutschrift', date: '2026-11-30', amountCents: 2_003, recurrence: 'once' },
    { name: 'Dezembergebühr', date: '2026-12-31', amountCents: -1, recurrence: 'once' },
  ])
    await post('/liquidity/events', {
      ...event,
      categoryId: null,
      accountId: null,
      enabled: true,
      recurrenceMonths: [],
    });
  const writes: string[] = [];
  const record = (request: Request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      writes.push(request.method());
  };
  page.on('request', record);
  await page.goto('/plan/jahr?monat=2026-11');
  const lead = page.getByTestId('scenario-year-end');
  const chart = page.getByTestId('year-scenario-chart');
  // 1000.01 - 3 × 100.01 + 20.03 - 0.01 = 720.00, independently calculated.
  await expect(lead).toHaveText('720,00 €');
  await expect(chart).toHaveAttribute('aria-label', /Dezember 720,00 €/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await expect(page.locator('.year-events')).not.toHaveAttribute('open');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const geometry = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      screen: innerHeight,
      sections: [
        ...document.querySelectorAll(
          'main > *, .plan-year > *, .year-planning > *, .year-sheet > *, .year-scenario-lead dd > *',
        ),
      ].map((element) => ({
        name: element.className,
        height: element.getBoundingClientRect().height,
        width: element.getBoundingClientRect().width,
      })),
    }));
    await page.screenshot({
      path: info.outputPath(`year-layout-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(geometry.height, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.screen * 2);
    expect(
      (await new AxeBuilder({ page }).include('main').analyze()).violations.map(
        (violation) => violation.id,
      ),
    ).toEqual([]);
    const targets = await page
      .locator(
        '.year-planning button:visible, .year-planning summary:visible, .year-sheet button:visible, .year-sheet select:visible',
      )
      .evaluateAll((elements) =>
        elements.map((element) => ({
          name: element.textContent,
          height: element.getBoundingClientRect().height,
        })),
      );
    if (page.viewportSize()!.width <= 767)
      expect(targets.filter((target) => target.height < 44)).toEqual([]);
    const summary = await page.locator('.year-events > summary').boundingBox();
    const create = await page
      .getByRole('button', { name: 'Ereignis planen', exact: true })
      .boundingBox();
    const controls = await page.locator('.year-event-controls').boundingBox();
    expect(summary!.x + summary!.width).toBeLessThanOrEqual(create!.x);
    expect(create!.y + create!.height).toBeLessThanOrEqual(controls!.y + controls!.height);
    await page.locator('.year-events > summary').click({ trial: true });
    await page.getByRole('button', { name: 'Ereignis planen', exact: true }).click({ trial: true });
    await page.screenshot({
      path: info.outputPath(`year-scenario-${info.project.name}-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.locator('.year-events > summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).include('main').analyze()).violations.map(
        (violation) => violation.id,
      ),
    ).toEqual([]);
    await page.getByRole('checkbox', { name: 'Geplante Gutschrift im Szenario' }).click({
      trial: true,
    });
    await page.getByRole('button', { name: 'Geplante Gutschrift bearbeiten' }).click({
      trial: true,
    });
    await page.locator('.year-events > summary').click();
  }
  const markerX = Number(await chart.locator('g > line.axis-dashed').nth(1).getAttribute('x1'));
  await chart.click({ position: { x: markerX, y: 70 } });
  await expect(page.locator('.chart-tooltip[role=status]')).toContainText('Monatliche Ausgabe');
  await expect(page.locator('.chart-tooltip[role=status]')).toContainText('Geplante Gutschrift');
  await expect(page.locator('.chart-tooltip[role=status]')).toContainText('30.11.2026');
  await chart.locator('..').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.chart-tooltip[role=status]')).toContainText('720,00 €');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.chart-tooltip[role=status]')).toContainText('Geplante Gutschrift');
  await page.keyboard.press('Escape');
  await page.locator('.chart-data-table > summary').click();
  const december = page
    .locator('.chart-data-table tbody tr')
    .filter({ hasText: '31.12.2026' })
    .filter({ hasText: 'Monatsende' });
  await expect(december.locator('.chart-data-value')).toHaveText('720,00 €');
  await page.locator('.year-events > summary').click();
  expect(
    await page
      .locator('.year-event-list .event-check')
      .evaluateAll((elements) =>
        elements.every((element) => element.getBoundingClientRect().height >= 44),
      ),
  ).toBe(true);
  await page.getByRole('checkbox', { name: 'Geplante Gutschrift im Szenario' }).uncheck();
  await expect(lead).toHaveText('699,97 €');
  await expect(chart).toHaveAttribute('aria-label', /Dezember 699,97 €/);
  await expect(december.locator('.chart-data-value')).toHaveText('699,97 €');
  await page.getByRole('button', { name: 'Ohne Auswahl' }).click();
  await expect(lead).toHaveText('1.000,01 €');
  await expect(december.locator('.chart-data-value')).toHaveText('1.000,01 €');
  await page.getByRole('button', { name: 'Mit Auswahl' }).click();
  await expect(lead).toHaveText('699,97 €');
  expect(writes).toEqual([]);
});
