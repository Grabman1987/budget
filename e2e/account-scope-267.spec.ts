import AxeBuilder from '@axe-core/playwright';
import { accounts, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('Heute explains sidebar, forecast and net-worth account scopes', async ({
  page,
  isolatedLedger,
}, info) => {
  test.setTimeout(90_000);
  const opened = openDatabase(isolatedLedger.databasePath);
  const ctx = { actor: 'e2e' };
  try {
    for (const account of [
      {
        id: 'scope-budget',
        name: 'Synthetic checking',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: 100_000,
      },
      {
        id: 'scope-card',
        name: 'Synthetic card',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingBalanceCents: -20_000,
      },
      {
        id: 'scope-reserve',
        name: 'Synthetic reserve',
        type: 'savings',
        role: 'reserve',
        onBudget: true,
        openingBalanceCents: 50_000,
      },
      {
        id: 'scope-investment',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingBalanceCents: 40_000,
      },
    ] as const) {
      accounts.create(
        opened.db,
        {
          ...account,
          openingDate: '2026-01-01',
        },
        ctx,
      );
    }
  } finally {
    opened.close();
  }

  const response = await page.request.get('/api/heute');
  expect(response.ok()).toBe(true);
  const heute = await response.json();
  expect(heute.balance.forecast.at(-1).balanceCents).toBe(80_000);
  expect(heute.netWorth.liquidCents).toBe(150_000);
  expect(heute.netWorth.investedCents).toBe(40_000);
  expect(heute.netWorth.debtCents).toBe(-20_000);
  expect(heute.netWorth.totalCents).toBe(170_000);
  expect(heute.lead.freeCents).toBe(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const chart = page.getByTestId('heute-balance-chart');
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute(
    'aria-label',
    /Budget-Konten; Kreditkarten im Budget eingeschlossen; Reservekonten ausgeschlossen/,
  );
  await expect(
    page.getByText(/Kontoprognose bis .*Budget-Konten; Kreditkarten im Budget/),
  ).toBeVisible();
  await expect(page.getByText(/Reservekonten ausgeschlossen/).first()).toBeVisible();
  await expect(page.getByTestId('heute-lead-value')).toHaveAttribute(
    'aria-label',
    /^Frei verfügbar bis Gehalt:/,
  );

  if (info.project.name === 'desktop') {
    const sidebar = page.getByRole('navigation', { name: 'Konten' });
    await expect(sidebar.locator('.acct-group-title')).toHaveText([
      'Budget-Konten',
      'Kreditkarten',
      'Investments',
    ]);
    await expect(sidebar.locator('.acct-group-sub')).toHaveText([
      'Giro, Bargeld, Tagesgeld',
      'Kartensalden',
      'Depot, Krypto, P2P, Sonstiges',
    ]);
    await expect(sidebar.locator('#acct-tree-budget')).toContainText('Synthetic checking');
    await expect(sidebar.locator('#acct-tree-cards')).toContainText('Synthetic card');
    await expect(sidebar.locator('#acct-tree-budget')).toContainText('Synthetic reserve');
    await expect(sidebar.locator('#acct-tree-investments')).toContainText('Synthetic depot');
    await expect(sidebar.locator('#acct-tree-budget').locator('..')).toContainText('1.500 €');
    await expect(sidebar.locator('#acct-tree-cards').locator('..')).toContainText('−200 €');
    await expect(sidebar.locator('#acct-tree-investments').locator('..')).toContainText('400 €');
    await expect(sidebar.getByRole('link', { name: /Synthetic checking/ })).toHaveAttribute(
      'href',
      '/konten/scope-budget',
    );
    await expect(sidebar.getByRole('link', { name: /Synthetic card/ })).toHaveAttribute(
      'href',
      '/konten/scope-card',
    );
  }

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .include('main')
      .include('#sidebar')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`account-scope-heute-${scheme}.png`),
      fullPage: true,
    });
  }

  const privacy =
    info.project.name === 'mobile'
      ? page.locator('.m-head .m-profile').getByRole('button', {
          name: 'Beträge verbergen',
          exact: true,
        })
      : page.getByRole('button', { name: 'Beträge verbergen', exact: true });
  if (info.project.name === 'mobile') await page.locator('.m-head .m-profile summary').click();
  await privacy.click();
  await expect(privacy).toHaveAttribute('aria-pressed', 'true');
  await expect(chart).toHaveAttribute('aria-label', /••• €/);
  if (info.project.name === 'desktop') {
    await expect(page.locator('#acct-tree-budget .acct-amount').first()).toContainText('•••');
  }
  await privacy.click();
  await expect(privacy).toHaveAttribute('aria-pressed', 'false');

  const moreMonth = page.getByRole('button', { name: 'Mehr zum Monat', exact: true });
  if ((await moreMonth.getAttribute('aria-expanded')) === 'false') await moreMonth.click();
  await page
    .getByRole('button', { name: /Liquidität .*Einzelposten zeigen/ })
    .click({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Liquidität', exact: true })).toBeVisible();
  const liquidDetail = page.getByText(
    'Positive Salden aus Budget- und Reservekonten. Negative Kontosalden zählen zu Schulden; ' +
      'das Maß ist kein frei verfügbares Budget.',
  );
  await expect(liquidDetail).toBeVisible();
  const detail = page.getByRole('dialog');
  await expect(detail).toContainText('Synthetic checking');
  await expect(detail).toContainText('Synthetic reserve');
  await expect(detail).not.toContainText('Synthetic card');
  await expect(detail).not.toContainText('Synthetic depot');
  await expect(detail).toContainText('1.500,00 €');

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page })
      .include('main')
      .include('#sidebar')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: info.outputPath(`account-scope-${scheme}.png`),
      fullPage: true,
    });
  }
});
