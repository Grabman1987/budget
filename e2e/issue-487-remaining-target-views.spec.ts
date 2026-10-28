import AxeBuilder from '@axe-core/playwright';
import { createBooking, INCOME_TYPES, openDatabase } from '@budget/db';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';
import { sampleTest } from './sample';

async function portfolioTitleVisible(page: Page, info: TestInfo) {
  const title =
    info.project.name === 'desktop'
      ? page.locator('.titleblock-report h1')
      : page.locator('.m-title-text');
  await expect(title).toBeVisible();
  await expect(title).toHaveText('Portfolio-Auswertung');
  const geometry = await title.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const clipping = [];
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const x = /^(hidden|clip|auto|scroll)$/.test(style.overflowX);
      const y = /^(hidden|clip|auto|scroll)$/.test(style.overflowY);
      if (x || y)
        clipping.push({
          x,
          y,
          left: box.left + parent.clientLeft,
          right: box.left + parent.clientLeft + parent.clientWidth,
          top: box.top + parent.clientTop,
          bottom: box.top + parent.clientTop + parent.clientHeight,
        });
    }
    return {
      clipping,
      width: innerWidth,
      height: innerHeight,
      text: [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
    };
  });
  expect(geometry.text.length).toBeGreaterThan(0);
  for (const text of geometry.text) {
    expect(text.left).toBeGreaterThanOrEqual(0);
    expect(text.right).toBeLessThanOrEqual(geometry.width);
    expect(text.top).toBeGreaterThanOrEqual(0);
    expect(text.bottom).toBeLessThanOrEqual(geometry.height);
    for (const clip of geometry.clipping) {
      if (clip.x) {
        expect(text.left).toBeGreaterThanOrEqual(clip.left);
        expect(text.right).toBeLessThanOrEqual(clip.right);
      }
      if (clip.y) {
        expect(text.top).toBeGreaterThanOrEqual(clip.top);
        expect(text.bottom).toBeLessThanOrEqual(clip.bottom);
      }
    }
  }
}

async function monthlyTableReachable(page: Page, info: TestInfo) {
  const table = page.getByTestId('contributions-months');
  const region = page.getByRole('region', { name: 'Monatswerte', exact: true });
  await expect(table).toBeVisible();
  await expect(region).toHaveAttribute('tabindex', '0');
  const cells = await table.locator('tbody th, tbody td').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      return {
        text: element.textContent,
        left: box.left,
        right: box.right,
        lines: text.map((rect) => ({ left: rect.left, right: rect.right })),
      };
    }),
  );
  expect(cells.length).toBeGreaterThanOrEqual(6);
  for (const cell of cells) {
    expect(cell.lines, cell.text ?? '').toHaveLength(1);
    expect(cell.lines[0]!.left).toBeGreaterThanOrEqual(cell.left);
    expect(cell.lines[0]!.right).toBeLessThanOrEqual(cell.right);
  }
  const overflow = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
  if (info.project.name !== 'desktop') expect(overflow).toBe(true);
  if (overflow) {
    await region.evaluate((element) => { element.scrollLeft = 0; });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await region.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const end = await region.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element.querySelector('tbody tr:last-child td:last-child')!);
      const text = range.getBoundingClientRect();
      return {
        left: box.left + element.clientLeft,
        right: box.left + element.clientLeft + element.clientWidth,
        textLeft: text.left,
        textRight: text.right,
      };
    });
    expect(end.textLeft).toBeGreaterThanOrEqual(end.left);
    expect(end.textRight).toBeLessThanOrEqual(end.right);
    await region.evaluate((element) => { element.scrollLeft = 0; });
  }
}

async function inspect(page: Page, info: TestInfo, label: string) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('.report-view-switch button').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
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

async function noClearMoney(page: Page, amount: RegExp) {
  const exposed = await page
    .locator('body')
    .evaluate((body) =>
      [
        body.textContent ?? '',
        ...[body, ...body.querySelectorAll('*')].flatMap((element) =>
          [...element.attributes]
            .filter(
              (attribute) =>
                attribute.name.startsWith('aria-') ||
                ['title', 'alt', 'value'].includes(attribute.name),
            )
            .map((attribute) => attribute.value),
        ),
      ].join('\n'),
    );
  expect(exposed).not.toMatch(amount);
  await expect(page.getByTestId('report-verdict')).toContainText('•••');
}

test('487 global project results retain literal August cents and require an explicit scope change', async ({
  page,
  request,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('giro','Synthetic checking','checking','budget',1,'2026-08-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind) VALUES ('cost','g','Synthetic cost','need','variable');
      INSERT INTO project (id,name) VALUES ('a','Synthetic A'),('b','Synthetic B');
    `);
    for (const [projectId, amountCents] of [
      ['a', 100001],
      ['b', 200002],
      ['a', -10000],
      ['b', -20000],
      [null, 50003],
    ] as const) {
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date: '2026-08-15',
          projectId,
          amountCents,
          splits: [
            {
              amountCents,
              ...(amountCents > 0
                ? { incomeTypeId: INCOME_TYPES.side.id }
                : { categoryId: 'cost' }),
            },
          ],
        },
        { actor: 'synthetic-487' },
      );
    }
    opened.sqlite.exec("UPDATE project SET archived_at='2026-09-01' WHERE id='b'");
  } finally {
    opened.close();
  }
  const period = '2026-08..2026-08';
  const response = await request.get(`/api/projects/report?period=${period}`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    months: ['2026-08'],
    total: { incomeCents: 300003, costCents: 30000, resultCents: 270003 },
    sideIncome: { incomeCents: 350006 },
    unassignedSideIncome: { incomeCents: 50003 },
  });
  await page.goto(`/reports/projekte?zeitraum=${period}`);
  await expect(page.getByTestId('projects-report')).toContainText('2.700,03');
  const body = await page.getByTestId('projects-report').innerText();
  const verdict = await page.getByTestId('report-verdict').innerText();
  await page.goto(
    `/reports/einnahmen-ausgaben?monat=2026-08&zeitraum=${period}&darstellung=income&projekt=a&ansicht=saved-id&exakt=true`,
  );
  await expect(page.getByTestId('income-total')).toHaveText('1.000,01 €');
  await page.getByRole('button', { name: 'Projekt-Ergebnisse', exact: true }).click();
  await expect(page.getByTestId('projects-report')).toHaveCount(0);
  await expect(page.getByText('Ein Projekt ist ausgewählt.', { exact: false })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('projekt')).toBe('a');
  await page.goBack();
  await expect(page.getByTestId('income-total')).toHaveText('1.000,01 €');
  await page.getByRole('button', { name: 'Projekt-Ergebnisse', exact: true }).click();
  await page.getByRole('button', { name: 'Alle Projekte zeigen', exact: true }).click();
  await expect(page.getByTestId('projects-report')).toHaveText(body, { useInnerText: true });
  await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
  await expect(page.getByTestId('projects-report')).toContainText('Synthetic B · archiviert');
  await expect(page.getByTestId('projects-report')).toContainText('3.500,06 €');
  await expect(page.getByTestId('projects-report')).toContainText('500,03 €');
  await expect(page).toHaveTitle(/Einnahmen und Cashflow/);
  if (info.project.name !== 'desktop')
    await expect(page.locator('.m-title-text')).toHaveText('Einnahmen und Cashflow');
  for (const [key, value] of Object.entries({
    monat: '2026-08',
    zeitraum: period,
    darstellung: 'projekte',
    ansicht: 'saved-id',
    exakt: 'true',
  }))
    expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  await inspect(page, info, 'global-projects');
  await privacy(page, true);
  await expect(page.getByTestId('projects-report')).toContainText('••• €');
  await noClearMoney(page, /2[.\s]?700[,.]03|3[.\s]?500[,.]06|500[,.]03/);
  await privacy(page, false);
  await expect(page.getByTestId('projects-report')).toHaveText(body, { useInnerText: true });
  await page.reload();
  await expect(page.getByTestId('projects-report')).toHaveText(body, { useInnerText: true });
  await page.goto(
    `/reports/einnahmen-ausgaben?monat=2026-08&zeitraum=${period}&darstellung=projekte&projekt=`,
  );
  await expect(page.getByRole('alert')).toContainText('Projektfilter ist ungültig');
  await expect(page.getByTestId('projects-report')).toHaveCount(0);
  await page.goto(
    `/reports/einnahmen-ausgaben?monat=2026-08&zeitraum=${period}&darstellung=projekte&projekt=deleted-id`,
  );
  await expect(page.getByText('Ein Projekt ist ausgewählt.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('projects-report')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('projekt')).toBe('deleted-id');
});

for (const [view, legacy, bodySelector] of [
  ['rendite', 'prendite', '.portfolio-performance-report'],
  ['verteilung', 'pallocation', '.portfolio-allocation-report'],
  ['einzahlungen', 'peinzahlungen', '.portfolio-contributions-report'],
] as const) {
  sampleTest(
    `487 Portfolio ${view} retains the existing complete reader, source verdict and period`,
    async ({ page }, info) => {
      await page.goto(`/reports/${legacy}?zeitraum=1J&trend=true`);
      const body = page.locator(bodySelector);
      await expect(body).toBeVisible();
      await expect(page.getByTestId('report-verdict')).toBeVisible();
      // Wait for the existing reader, rather than snapshotting its loading placeholder.
      await expect(body.locator('section')).not.toHaveCount(0);
      if (view === 'rendite') {
        await expect(body.locator('.benchmark-choices')).toBeVisible();
        await expect(body.locator('.benchmark-choices')).not.toContainText('Lädt …');
      }
      if (view === 'einzahlungen') await monthlyTableReachable(page, info);
      const content = await body.innerText();
      const verdict = await page.getByTestId('report-verdict').innerText();
      await page.goto(
        `/reports/pallocation?zeitraum=1J&darstellung=${view}&ansicht=saved-id&exakt=true&projekt=retained-id&trend=true`,
      );
      await expect(body).toHaveText(content, { useInnerText: true });
      await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
      await expect(page).toHaveTitle(/Portfolio-Auswertung/);
      await portfolioTitleVisible(page, info);
      if (view === 'einzahlungen') await monthlyTableReachable(page, info);
      if (info.project.name !== 'desktop')
        await expect(page.locator('.m-title-text')).toHaveText('Portfolio-Auswertung');
      if (view === 'einzahlungen')
        await expect(page.getByTestId('report-trend-line')).not.toHaveCount(0);
      await expect(
        page
          .getByRole('group', { name: 'Ansicht der Portfolio-Auswertung' })
          .getByRole('button', { pressed: true }),
      ).toHaveText(
        view === 'rendite'
          ? 'Rendite & Risiko'
          : view === 'verteilung'
            ? 'Verteilung über Zeit'
            : 'Einzahlungen und Wert',
      );
      for (const [key, value] of Object.entries({
        zeitraum: '1J',
        darstellung: view,
        ansicht: 'saved-id',
        exakt: 'true',
        projekt: 'retained-id',
      }))
        expect(new URL(page.url()).searchParams.get(key)).toBe(value);
      await inspect(page, info, `portfolio-${view}`);
      await page.reload();
      await expect(body).toHaveText(content, { useInnerText: true });
    },
  );
}

test('487 Portfolio switching preserves literal performance and contribution amounts, query and privacy', async ({
  page,
}, info) => {
  const seen: string[] = [];
  const performance = {
    from: '2026-08-01',
    to: '2026-08-31',
    days: 31,
    monthCount: 1,
    startValueCents: 100001,
    contributionsCents: 20002,
    gainCents: 30003,
    endValueCents: 150006,
    ttwror: 0.123,
    ttwrorAnnualised: 0.456,
    xirr: 0.121,
  };
  const history = {
    ...performance,
    daily: [
      { date: '2026-08-01', valueCents: 100001, investedCents: 100001 },
      { date: '2026-08-31', valueCents: 150006, investedCents: 120003 },
    ],
    months: [
      {
        from: '2026-08-01',
        to: '2026-08-31',
        startValueCents: 100001,
        valueCents: 150006,
        inflowsCents: 20002,
        outflowsCents: 0,
        gainCents: 30003,
      },
    ],
    years: [{ year: 2026, performance }],
  };
  await page.route('**/api/portfolio?*', (route) => {
    seen.push(new URL(route.request().url()).search);
    return route.fulfill({
      json: {
        portfolio: {
          period: '2026-08..2026-08',
          view: 'securities',
          positions: [],
          performance,
          contributionHistory: history,
          realizedGainCents: 691,
          realizedGainComplete: false,
        },
      },
    });
  });
  await page.goto(
    '/reports/pallocation?darstellung=rendite&zeitraum=2026-08..2026-08&ansicht=saved-id&exakt=true',
  );
  await expect(page.getByTestId('period-ttwror')).toHaveText('+12,3 %');
  await expect(page.locator('.performance-metrics')).toContainText('+45,6 %');
  await expect(page.locator('.performance-metrics')).toContainText('+12,1 %');
  await expect(page.getByTestId('realized-gain')).toHaveText('+6,91 €');
  await expect(page.locator('.portfolio-performance-report')).toContainText(
    'Quellenhinweise unvollständig',
  );
  const verdict = await page.getByTestId('report-verdict').innerText();
  await privacy(page, true);
  await noClearMoney(page, /300[,.]03|1[.\s]?500[,.]06|6[,.]91/);
  await page.getByRole('button', { name: 'Einzahlungen und Wert', exact: true }).click();
  await expect(page.getByTestId('contributions-end-value')).toHaveText('••• €');
  await noClearMoney(page, /300[,.]03|1[.\s]?500[,.]06/);
  await privacy(page, false);
  await expect(page.getByTestId('contributions-end-value')).toHaveText('1.500,06 €');
  await expect(page.getByTestId('contributions-months')).toContainText('+300,03 €');
  await expect(page.getByTestId('contributions-period')).toHaveText(
    '01.08.2026 bis 31.08.2026 · 31 Tage',
  );
  expect(seen).toContain(
    '?period=2026-08..2026-08&view=securities&history=performance&provenance=valuation-v1',
  );
  expect(seen).toContain('?period=2026-08..2026-08&view=securities&history=contributions');
  await page.goBack();
  await expect(page.getByTestId('period-ttwror')).toHaveText('+12,3 %');
  await expect(page.getByTestId('realized-gain')).toHaveText('+6,91 €');
  await expect(page.getByTestId('report-verdict')).toHaveText(verdict, { useInnerText: true });
  for (const [key, value] of Object.entries({
    ansicht: 'saved-id',
    exakt: 'true',
    zeitraum: '2026-08..2026-08',
    darstellung: 'rendite',
  }))
    expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  await inspect(page, info, 'literal-portfolio');
});
