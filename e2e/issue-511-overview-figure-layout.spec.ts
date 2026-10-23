import { openDatabase, schema } from '@budget/db';
import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

async function create(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(`${origin}/api${path}`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function fixture(request: APIRequestContext, origin: string, databasePath: string) {
  const accounts: Record<string, string> = {};
  for (const [key, name, type, openingBalanceCents] of [
    ['cash', 'Layout clearing', 'checking', 12345],
    ['depot', 'Layout partial depot', 'brokerage', 0],
    ['crypto', 'Layout unpriced crypto', 'crypto', 0],
    ['large', 'Layout large estimate', 'brokerage', 0],
  ] as const) {
    const result = await create(request, origin, '/accounts', {
      name,
      type,
      openingDate: '2026-01-01',
      openingBalanceCents,
      ...(key === 'depot' ? { referenceAccountId: accounts['cash'] } : {}),
    });
    accounts[key] = result.account.id;
  }
  const priced = (
    await create(request, origin, '/securities', {
      name: 'Layout executed security',
      kind: 'stock',
      currency: 'EUR',
    })
  ).security;
  await create(request, origin, '/trades', {
    accountId: accounts['depot'],
    securityId: priced.id,
    date: '2026-09-17',
    kind: 'buy',
    unitsE8: 200_000_000,
    amountCents: 2468,
    feeCents: 99,
    taxCents: 0,
  });
  for (const [key, amountCents] of [
    ['cash', -500],
    ['depot', -123],
  ] as const)
    await create(request, origin, '/bookings', {
      type: 'booking',
      accountId: accounts[key],
      date: '2026-09-17',
      amountCents,
      splits: [{ amountCents, categoryId: null }],
    });
  const unknown = (
    await create(request, origin, '/securities', {
      name: 'Layout unknown coin',
      kind: 'crypto',
      currency: 'EUR',
    })
  ).security;
  const opened = openDatabase(databasePath);
  try {
    for (const [key, costBasisCents] of [
      ['depot', null],
      ['crypto', null],
      ['large', 123456789],
    ] as const)
      opened.db
        .insert(schema.holding)
        .values({
          id: `layout-unknown-${key}`,
          accountId: accounts[key]!,
          securityId: unknown.id,
          asOf: '2026-09-17',
          unitsE8: 100_000_000,
          ...(costBasisCents === null ? {} : { costBasisCents }),
        })
        .run();
  } finally {
    opened.close();
  }
}

async function knownOnlyFixture(request: APIRequestContext, origin: string, databasePath: string) {
  const account = (
    await create(request, origin, '/accounts', {
      name: 'Layout large estimate',
      type: 'brokerage',
      openingDate: '2026-01-01',
    })
  ).account;
  const security = (
    await create(request, origin, '/securities', {
      name: 'Layout known cost',
      kind: 'crypto',
      currency: 'EUR',
    })
  ).security;
  const opened = openDatabase(databasePath);
  try {
    opened.db
      .insert(schema.holding)
      .values({
        id: 'layout-known-only',
        accountId: account.id,
        securityId: security.id,
        asOf: '2026-09-17',
        unitsE8: 100_000_000,
        costBasisCents: 123456789,
      })
      .run();
  } finally {
    opened.close();
  }
}

function accountRow(page: Page, name: string) {
  return page
    .locator('tr.overview-account-row')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
}

async function record(page: Page, info: TestInfo, phase: string) {
  const geometry = await page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      pointer: matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
      deviceScaleFactor: devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints,
      cells: [...document.querySelectorAll('.account-overview-577 .kc-num')].map((cell) => ({
        text: cell.textContent,
        box: box(cell),
        parts: [
          ...cell.querySelectorAll(
            '[data-testid="account-value"], [data-testid="account-group-value"], button',
          ),
        ].map((child) => {
          const range = document.createRange();
          range.selectNodeContents(child);
          return {
            tag: child.tagName,
            text: child.textContent,
            box: box(child),
            textRects: [...range.getClientRects()].map((rect) => ({
              left: rect.left,
              right: rect.right,
            })),
          };
        }),
      })),
      popovers: [...document.querySelectorAll('.term-popover:popover-open')].map(box),
    };
  });
  const path = info.outputPath(`${phase}.json`);
  await writeFile(
    path,
    JSON.stringify(
      {
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
        phase,
        contextProfile: phase.startsWith('desktop-layout-')
          ? { isMobile: false, hasTouch: false, deviceScaleFactor: 1 }
          : {
              isMobile: info.project.use.isMobile ?? false,
              hasTouch: info.project.use.hasTouch ?? false,
              deviceScaleFactor: info.project.use.deviceScaleFactor ?? 1,
            },
        ...geometry,
      },
      null,
      2,
    ),
  );
  await info.attach(phase, { path, contentType: 'application/json' });
  await page.screenshot({
    path: info.outputPath(`${phase}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  return geometry;
}

async function containedFigure(cell: Locator) {
  const bounds = await cell.evaluate((element) => {
    const parent = element.getBoundingClientRect();
    return [
      ...element.querySelectorAll(
        '[data-testid="account-value"], [data-testid="account-group-value"], button',
      ),
    ].flatMap((child) => {
      const range = document.createRange();
      range.selectNodeContents(child);
      return [child.getBoundingClientRect(), ...range.getClientRects()].map((rect) => ({
        left: rect.left,
        right: rect.right,
        cellLeft: parent.left,
        cellRight: parent.right,
      }));
    });
  });
  for (const boundsPart of bounds) {
    expect(boundsPart.left).toBeGreaterThanOrEqual(boundsPart.cellLeft);
    expect(boundsPart.right).toBeLessThanOrEqual(boundsPart.cellRight);
  }
}

async function checkFigure(
  page: Page,
  info: TestInfo,
  phase: string,
  row: Locator,
  explanation: string,
  source: Locator = row,
) {
  await containedFigure(row.locator('.kc-num'));
  await containedFigure(source.locator('.kc-num, td').first());
  const marker = source.getByRole('button', { name: /^Bewertungsgrundlage ·/ });
  const markerBox = await marker.boundingBox();
  expect(markerBox).not.toBeNull();
  expect(markerBox!.width).toBeGreaterThanOrEqual(44);
  expect(markerBox!.height).toBeGreaterThanOrEqual(44);
  await marker.focus();
  const popup = page.locator(`[id="${await marker.getAttribute('aria-describedby')}"]`);
  await expect(popup).toBeVisible();
  await expect(popup).toContainText(explanation);
  const focused = await record(page, info, `${phase}-focused`);
  for (const box of focused.popovers) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(focused.viewport.width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(focused.viewport.height);
  }
  expect(focused.popovers).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(popup).not.toBeVisible();
  const escaped = await record(page, info, `${phase}-escaped`);
  expect(escaped.scrollWidth).toBeLessThanOrEqual(escaped.viewport.width);
  await containedFigure(row.locator('.kc-num'));
}

async function wholeAmount(amount: Locator) {
  const lines = await amount.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).length;
  });
  expect(lines).toBe(1);
}

async function checkOverview(page: Page, info: TestInfo, label: string) {
  await page.goto('/konten');
  await page.evaluate(() => document.fonts.ready);
  const partial = accountRow(page, 'Layout partial depot');
  const unknown = accountRow(page, 'Layout unpriced crypto');
  const large = accountRow(page, 'Layout large estimate');
  await expect(partial.getByTestId('account-value')).toHaveText('≈ 24,68 €');
  // 12345 - 2468 gross - 99 fee - 500 checking booking - 123 linked depot cash = 9155.
  await expect(accountRow(page, 'Layout clearing').getByTestId('account-value')).toHaveText(
    '91,55 €',
  );
  await expect(unknown.getByTestId('account-value')).toHaveText('Nicht verfügbar');
  for (const row of [partial, unknown, large])
    await row.getByRole('button', { name: /^Details zu / }).click();
  await expect(
    unknown
      .locator('xpath=following-sibling::tr[1]')
      .getByText('Wertpapierkurs fehlt', { exact: true }),
  ).toHaveText('Wertpapierkurs fehlt');
  await expect(large.getByTestId('account-value')).toHaveText('≈ 1.234.567,89 €');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const before = await record(page, info, `${label}-${theme}-before-focus`);
    expect(before.scrollWidth).toBeLessThanOrEqual(before.viewport.width);
    await wholeAmount(large.getByTestId('account-value'));
    for (const [row, name, explanation] of [
      [partial, 'partial', 'Bewertung fehlt'],
      [unknown, 'unknown', 'Bewertung fehlt'],
      [large, 'large', 'Einstandswert als Schätzung'],
    ] as const) {
      await checkFigure(
        page,
        info,
        `${label}-${theme}-${name}`,
        row,
        explanation,
        row.locator('xpath=following-sibling::tr[1]'),
      );
    }
  }
}

async function checkKnownGroup(page: Page, info: TestInfo, label: string) {
  await page.goto('/konten');
  await page.evaluate(() => document.fonts.ready);
  const account = accountRow(page, 'Layout large estimate');
  const group = page.locator('tr.kgroup#kg-investments');
  await expect(account.getByTestId('account-value')).toHaveText('≈ 1.234.567,89 €');
  await expect(group.getByTestId('account-group-value')).toHaveText('≈ 1.234.567,89 €');
  await account.getByRole('button', { name: /^Details zu / }).click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const before = await record(page, info, `${label}-${theme}-known-group-before-focus`);
    expect(before.scrollWidth).toBeLessThanOrEqual(before.viewport.width);
    await wholeAmount(account.getByTestId('account-value'));
    await wholeAmount(group.getByTestId('account-group-value'));
    await checkFigure(
      page,
      info,
      `${label}-${theme}-known-account`,
      account,
      'Einstandswert als Schätzung',
      account.locator('xpath=following-sibling::tr[1]'),
    );
    await checkFigure(
      page,
      info,
      `${label}-${theme}-known-group`,
      group,
      'Einstandswert als Schätzung',
    );
  }
}

for (const scenario of [
  {
    title:
      'partly unpriced account figures and source controls stay within their columns and viewport',
    seed: fixture,
    check: checkOverview,
  },
  {
    title:
      'known estimated account and group figures retain whole large amounts beside bounded source controls',
    seed: knownOnlyFixture,
    check: checkKnownGroup,
  },
])
  test(scenario.title, async ({ page, browser, request, isolatedLedger, ledgerToday }, info) => {
    await scenario.seed(request, isolatedLedger.origin, isolatedLedger.databasePath);
    const desktop = await browser.newContext({
      baseURL: isolatedLedger.origin,
      storageState: await page.context().storageState(),
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    try {
      const desktopPage = await desktop.newPage();
      await desktopPage.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
      await scenario.check(desktopPage, info, 'desktop-layout');
    } finally {
      await desktop.close();
    }
    await scenario.check(page, info, 'configured');
  });
