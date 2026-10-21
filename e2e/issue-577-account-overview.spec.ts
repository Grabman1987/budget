import AxeBuilder from '@axe-core/playwright';
import { openDatabase, reconcileAccount, schema } from '@budget/db';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-21' });

function seed(databasePath: string) {
  const opened = openDatabase(databasePath);
  try {
    const rows = [
      {
        id: 'overview-alpha',
        name: 'Synthetic Alpha',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: 12345,
      },
      {
        id: 'overview-bravo',
        name: 'Synthetic Bravo',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: -345,
      },
      {
        id: 'overview-reference',
        name: 'Synthetic Reference',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: 0,
      },
      {
        id: 'overview-card',
        name: 'Synthetic Card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: -2000,
      },
      {
        id: 'overview-loan',
        name: 'Synthetic Loan',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingBalanceCents: -6000,
      },
      {
        id: 'overview-manual',
        name: 'Synthetic Investment',
        type: 'p2p',
        role: 'investment',
        onBudget: false,
        openingBalanceCents: 15000,
      },
      {
        id: 'overview-depot',
        name: 'Synthetic Depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        referenceAccountId: 'overview-reference',
        openingBalanceCents: 0,
      },
      {
        id: 'overview-usd',
        name: 'Synthetic USD',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingBalanceCents: 4321,
      },
      {
        id: 'overview-closed',
        name: 'Synthetic Closed',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: 7777,
        closedAt: '2026-10-21',
      },
    ] satisfies Array<Omit<typeof schema.account.$inferInsert, 'openingDate'>>;
    // Separate inserts retain the actual reference-account foreign-key order.
    for (const [sortOrder, row] of rows.entries())
      opened.db
        .insert(schema.account)
        .values({ ...row, openingDate: '2026-09-01', sortOrder })
        .run();
    opened.db
      .insert(schema.security)
      .values({ id: 'overview-fund', name: 'Synthetic Fund', kind: 'etf', currency: 'EUR' })
      .run();
    opened.db
      .insert(schema.holding)
      .values({
        id: 'overview-holding',
        accountId: 'overview-depot',
        securityId: 'overview-fund',
        asOf: '2026-09-20',
        unitsE8: 100000000,
      })
      .run();
    opened.db
      .insert(schema.price)
      .values({
        securityId: 'overview-fund',
        date: '2026-10-20',
        priceMicro: 20000000,
        currency: 'EUR',
        source: 'manual',
      })
      .run();
    opened.db
      .insert(schema.fxRate)
      .values({
        date: '2026-10-21',
        currency: 'USD',
        rateMicro: 1234567,
        source: 'Saldo 123,45 EUR',
      })
      .run();
    for (const id of ['overview-alpha', 'overview-bravo', 'overview-card', 'overview-loan']) {
      const amount = rows.find((row) => row.id === id)!.openingBalanceCents;
      reconcileAccount(
        opened.db,
        { accountId: id, date: '2026-10-21', statementBalanceCents: amount, today: '2026-10-21' },
        { actor: 'test' },
      );
    }
  } finally {
    opened.close();
  }
}

async function contained(locator: Locator, minimum: number) {
  await expect(locator).toBeVisible();
  const metrics = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centre = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      owned: centre === element || (centre !== null && element.contains(centre)),
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(0);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.width).toBeGreaterThanOrEqual(minimum);
  expect(metrics.height).toBeGreaterThanOrEqual(minimum);
  expect(metrics.owned).toBe(true);
}

async function scene(
  page: Page,
  info: TestInfo,
  profile: 'desktop' | 'configured',
  theme: 'light' | 'dark',
) {
  await page.goto('/konten');
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  const scope = page.locator('.account-overview-577');
  await expect(page.getByTestId('budget-accounts-balance')).toHaveText('120,00 €');
  await expect(scope.getByRole('link', { name: '4 von 8 Konten geprüft' })).toBeVisible();
  await expect(scope.locator('[data-account-id]')).toHaveCount(8);
  await expect(scope.getByText('Synthetic Closed', { exact: true })).toHaveCount(0);
  await expect(scope.locator('.grp-title')).toHaveText([
    'Budget-Konten',
    'Kreditkarten',
    'Kredite',
    'Investments',
  ]);
  await expect(
    scope.locator('[data-account-id="overview-card"] [data-testid="account-value"]'),
  ).toHaveText('−20,00 €');
  await expect(
    scope.locator('[data-account-id="overview-loan"] [data-testid="account-value"]'),
  ).toHaveText('−60,00 €');
  await expect(
    scope.locator('[data-account-id="overview-depot"] [data-testid="account-value"]'),
  ).toHaveText('20,00 €');
  const initial = await scope.evaluate((element) => ({
    viewport: { width: innerWidth, height: innerHeight },
    coarse: matchMedia('(pointer: coarse)').matches,
    scrollWidth: document.documentElement.scrollWidth,
    rows: [...element.querySelectorAll('[data-account-id]')].map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        id: row.getAttribute('data-account-id'),
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
      };
    }),
  }));
  expect(initial.scrollWidth).toBeLessThanOrEqual(initial.viewport.width);
  if (profile === 'desktop') {
    expect(initial.viewport).toEqual({ width: 1440, height: 900 });
    expect(initial.coarse).toBe(false);
    const checkColumnLeft = await scope
      .getByRole('columnheader', { name: 'Prüfstand', exact: true })
      .evaluate(
        (header) =>
          header.getBoundingClientRect().left + parseFloat(getComputedStyle(header).paddingLeft),
      );
    for (const badge of await scope.locator('.overview-check').all()) {
      const badgeLeft = await badge.evaluate((element) => element.getBoundingClientRect().left);
      expect(Math.abs(badgeLeft - checkColumnLeft)).toBeLessThanOrEqual(1);
    }
    for (const row of initial.rows) {
      expect(row.height).toBeGreaterThanOrEqual(36);
      expect(row.height).toBeLessThanOrEqual(44);
      expect(row.top).toBeGreaterThanOrEqual(0);
      expect(row.bottom).toBeLessThanOrEqual(900);
    }
  } else {
    expect(initial.viewport.width).toBe(390);
    for (const group of await scope.locator('.overview-group').all()) {
      const label = await group.locator('.grp-title').boundingBox();
      const amount = await group.getByTestId('account-group-value').boundingBox();
      expect(label).not.toBeNull();
      expect(amount).not.toBeNull();
      expect(label!.y + label!.height).toBeGreaterThan(amount!.y);
      expect(amount!.y + amount!.height).toBeGreaterThan(label!.y);
    }
  }
  // Actual targets, not hidden descendants with misleading layout boxes.
  for (const target of await scope
    .locator('.overview-account-link, .overview-row-details .btn')
    .all()) {
    await target.scrollIntoViewIfNeeded();
    await contained(target, profile === 'configured' ? 44 : 36);
  }
  const axe = await new AxeBuilder({ page })
    .include('.account-overview-577')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);

  const seriesResponse = await page.request.get(
    '/api/accounts/series?from=2026-09-21&to=2026-10-21&quality=1',
  );
  expect(seriesResponse.status()).toBe(200);
  const series = (await seriesResponse.json()) as {
    quality: Record<string, Record<string, { known: boolean; missing: string | null }>>;
  };
  expect(series.quality['overview-depot']?.['2026-09-21']).toMatchObject({
    known: false,
    missing: 'price',
  });
  expect(series.quality['overview-depot']?.['2026-10-21']).toMatchObject({
    known: true,
    missing: null,
  });
  await scope.getByRole('button', { name: 'Details zu Synthetic Depot' }).click();
  const detail = scope.locator('.overview-detail');
  await expect(detail.getByRole('link', { name: 'Synthetic Reference' })).toHaveAttribute(
    'href',
    '/konten/overview-reference',
  );
  const chart = detail.getByRole('group', {
    name: 'Synthetic Depot · Kontoverlauf der letzten 30 Tage',
    exact: true,
  });
  await chart.focus();
  await expect(page.locator('.chart-tooltip')).toContainText('Wertpapierkurs/Einstand fehlt');
  // The shared chart uses bounded arrow navigation; inspect the actual final dated point.
  for (let index = 0; index < 30; index += 1) await chart.press('ArrowRight');
  await expect(page.locator('.chart-tooltip')).toContainText('20,00 €');
  await expect(page.locator('.chart-tooltip')).toContainText('21.10.2026');
  if (profile === 'desktop') {
    const keyboardTooltip = (await page.locator('.chart-tooltip').textContent())!;
    const svg = chart.locator('svg');
    const bounds = (await svg.boundingBox())!;
    await svg.hover({ position: { x: 1, y: bounds.height / 2 } });
    await expect(page.locator('.chart-tooltip')).toContainText('Wertpapierkurs/Einstand fehlt');
    await expect(page.locator('.chart-tooltip')).toContainText('21.09.2026');
    await svg.hover({ position: { x: bounds.width - 1, y: bounds.height / 2 } });
    await expect(page.locator('.chart-tooltip')).toContainText('20,00 €');
    await expect(page.locator('.chart-tooltip')).toContainText('21.10.2026');
    await expect(page.locator('.chart-tooltip')).toHaveText(keyboardTooltip);
  }
  await detail.getByText('Tabelle anzeigen', { exact: true }).click();
  const values = detail.getByRole('region', { name: /dargestellte Werte/ });
  await expect(values).toContainText('Kontowert inkl. Depot-Cash (EUR)');
  await expect(values).toContainText('20,00 €');
  await chart.press('Escape');
  await scope.getByRole('button', { name: 'Details zu Synthetic Depot' }).click();

  await scope.getByRole('button', { name: 'Details zu Synthetic USD' }).click();
  await expect(scope.locator('.overview-detail')).toContainText('Saldo 123,45 EUR');
  await page.keyboard.press('Control+Shift+H');
  await expect(page.getByTestId('budget-accounts-balance')).toContainText('•••');
  const leaks = await scope.evaluate((element) => {
    const pattern = /[+−-]?\d[\d.,\s]*(?:Mio\.\s*)?(€|EUR|USD)(?![A-Z])/g;
    return [
      element.textContent ?? '',
      ...[...element.querySelectorAll('[aria-label], [title]')].map(
        (node) => `${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('title') ?? ''}`,
      ),
    ].flatMap((text) => [...text.matchAll(pattern)].map((match) => match[0]));
  });
  expect(leaks).toEqual([]);
  await page.keyboard.press('Control+Shift+H');
  await expect(scope.locator('.overview-detail')).toContainText('Saldo 123,45 EUR');
  await scope.getByRole('button', { name: 'Details zu Synthetic USD' }).click();

  // A real audited order write and its actual grouped Undo, never a mocked transport.
  await scope.getByRole('button', { name: 'Reihenfolge ändern', exact: true }).click();
  const order = () =>
    scope.locator('#kg-budget').locator('..').locator('[data-account-id] .kname').allTextContents();
  expect(await order()).toEqual(['Synthetic Alpha', 'Synthetic Bravo', 'Synthetic Reference']);
  await scope.getByRole('button', { name: 'Synthetic Alpha nach unten' }).click();
  const toast = page
    .locator('.toast.is-open')
    .filter({ hasText: 'Reihenfolge der Konten gespeichert.' });
  await expect(toast).toBeVisible();
  await expect.poll(order).toEqual(['Synthetic Bravo', 'Synthetic Alpha', 'Synthetic Reference']);
  await toast.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(order).toEqual(['Synthetic Alpha', 'Synthetic Bravo', 'Synthetic Reference']);
  await scope.getByRole('button', { name: 'Fertig', exact: true }).click();
  await page.reload();
  await page.evaluate((value) => {
    document.documentElement.dataset['theme'] = value;
  }, theme);
  await expect(page.getByTestId('budget-accounts-balance')).toHaveText('120,00 €');
  await expect.poll(order).toEqual(['Synthetic Alpha', 'Synthetic Bravo', 'Synthetic Reference']);
  await page.getByTestId('budget-accounts-balance').scrollIntoViewIfNeeded();
  const screenshot = info.outputPath(`account-overview-${profile}-${theme}.png`);
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await info.attach('Account overview', { path: screenshot, contentType: 'image/png' });
  const metrics = info.outputPath(`account-overview-${profile}-${theme}.json`);
  await writeFile(
    metrics,
    JSON.stringify(
      {
        ...initial,
        engine: page.context().browser()!.browserType().name(),
        project: info.project.name,
        profile,
        theme,
        transport: 'real API reorder and Undo',
      },
      null,
      2,
    ),
  );
  await info.attach('Account overview metrics', { path: metrics, contentType: 'application/json' });
}

for (const profile of ['desktop', 'configured'] as const)
  for (const theme of ['light', 'dark'] as const) {
    test(`account overview ${profile} ${theme} preserves scope, quality, privacy and real order Undo`, async ({
      page,
      browser,
      isolatedLedger,
      ledgerToday,
    }, info) => {
      seed(isolatedLedger.databasePath);
      if (profile === 'configured') {
        const inherited = page.viewportSize();
        expect(inherited).not.toBeNull();
        // Keep the canonical engine/input model and visible height; only desktop CI narrows to390.
        await page.setViewportSize({ width: 390, height: inherited!.height });
        await scene(page, info, profile, theme);
        return;
      }
      const context = await browser.newContext({
        baseURL: isolatedLedger.origin,
        storageState: isolatedLedger.storageState,
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      try {
        const desktop = await context.newPage();
        await desktop.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
        await scene(desktop, info, profile, theme);
      } finally {
        await context.close();
      }
    });
  }
