import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  createTestDatabase,
  portfolioStrategyView,
  recordStrategyMonthlyDecision,
  saveStrategyConfiguration,
  strategyConfiguration,
} from '@budget/db';
import {
  seedStrategyTestPortfolio,
  strategyTestConfiguration,
  strategyTestEvidence,
  STRATEGY_TEST_AS_OF,
} from '../packages/db/src/repos/portfolio-strategy-fixture';

/** UI uses a synthetic projection; repository/API tests separately exercise persisted writes. */
function projection() {
  const opened = createTestDatabase();
  try {
    seedStrategyTestPortfolio(opened);
    saveStrategyConfiguration(
      opened.db,
      { config: strategyTestConfiguration(), revision: strategyConfiguration(opened.db).revision },
      '2026-09-30',
      { actor: 'test', groupId: 'config' },
    );
    recordStrategyMonthlyDecision(
      opened.db,
      strategyTestEvidence(),
      '2026-09',
      STRATEGY_TEST_AS_OF,
      strategyConfiguration(opened.db).revision,
      { actor: 'test', groupId: 'decision' },
    );
    return portfolioStrategyView(opened.db, STRATEGY_TEST_AS_OF, strategyTestEvidence());
  } finally {
    opened.close();
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`strategy ${theme}: exact preview, keyboard expansion, separate rebalance and editable rate`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const data = projection();
    await page.route('**/api/portfolio-strategy', (route) => route.fulfill({ json: data }));
    await page.route('**/api/portfolio-strategy/configuration', async (route) => {
      const body = route.request().postDataJSON();
      expect(body.config.contributionCents).toBe(12345);
      expect(body.config.includeFreeCash).toBe(false);
      expect(body.revision).toBe(data.revision);
      data.config = body.config;
      await route.fulfill({ json: { groupId: 'synthetic-ui-save', changedCount: 1 } });
    });
    await page.goto('/vermoegen/portfolio/sparplaene');
    const toggle = page.getByText('Trendstrategie: monatliche Ziele und nächste Käufe', {
      exact: true,
    });
    await toggle.focus();
    await page.keyboard.press('Enter');
    const scope = page.getByRole('region', { name: 'Trendstrategie', exact: true });
    await expect(scope.getByRole('heading', { name: /Dein nächster Sparplan/ })).toContainText(
      '100,00',
    );
    await expect(scope).toContainText('Die Vorschau ist vorläufig.');
    const table = scope.getByRole('table', {
      name: 'Aktuelle EUR-Werte und verbindliche Zielgewichte',
    });
    await expect(
      table.getByRole('row').filter({ hasText: 'Kurzlaufende EUR-Staatsanleihen' }),
    ).toContainText('94,87');
    const category = table.getByText('Globale Aktien', { exact: true });
    await category.focus();
    await page.keyboard.press('Enter');
    await expect(table.getByText(/Testfonds global/)).toBeVisible();
    await expect(
      scope.getByRole('heading', { name: 'Rebalancing · getrennt von der Sparrate' }),
    ).toBeVisible();
    await expect(scope).toContainText('Verkauf 100,00');
    await scope.getByText('Bereits ausgeführtes Rebalancing bestätigen', { exact: true }).click();
    await expect(scope).toContainText('Noch keine passenden erfassten Ausführungen vorhanden.');
    expect(
      (await new AxeBuilder({ page }).include('[aria-label="Trendstrategie"]').analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await scope.getByRole('heading', { name: /Dein nächster Sparplan/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`strategy-preview-${theme}.png`) });
    await scope.getByRole('button', { name: 'Strategie einstellen', exact: true }).click();
    await scope.getByLabel('Monatliche Rate in EUR', { exact: true }).fill('123,45');
    await expect(
      scope.getByLabel('Positives saldiertes Anlageguthaben zusätzlich zur Rate einbeziehen'),
    ).not.toBeChecked();
    expect(
      (await new AxeBuilder({ page }).include('.strategy-settings').analyze()).violations,
    ).toEqual([]);
    await scope.getByRole('button', { name: 'Einstellungen speichern', exact: true }).click();
    await expect(scope.getByRole('heading', { name: /Dein nächster Sparplan/ })).toContainText(
      '123,45',
    );
  });
}

test('strategy exposes missing evidence without guessed buys and recovers from a read error', async ({
  page,
}) => {
  const data = projection();
  data.binding = null;
  data.contribution = null;
  data.rebalance = null;
  data.monthlyCandidate = null;
  data.provider = null;
  data.dailyPreview = { status: 'unavailable', reason: 'trusted_provider_unconfigured' };
  data.diagnostics = ['binding_decision_unavailable'];
  let failed = true;
  await page.route('**/api/portfolio-strategy', (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: 'synthetic-outage', message: 'Synthetischer Lesefehler' },
        })
      : route.fulfill({ json: data }),
  );
  await page.goto('/vermoegen/portfolio/sparplaene');
  await page
    .getByText('Trendstrategie: monatliche Ziele und nächste Käufe', { exact: true })
    .click();
  const scope = page.getByRole('region', { name: 'Trendstrategie', exact: true });
  await expect(scope.getByRole('alert')).toBeVisible();
  failed = false;
  await scope.getByRole('button', { name: /Erneut|Wiederholen/ }).click();
  await expect(scope).toContainText(
    'Die verlässliche Quelle für USD-Kursindex und US-Handelskalender ist noch nicht angeschlossen.',
  );
  await expect(
    scope.getByRole('button', { name: 'Verbindliche Monatsentscheidung speichern' }),
  ).toHaveCount(0);
  await expect(
    scope.getByRole('table').getByRole('row').filter({ hasText: 'Globale Aktien' }),
  ).toContainText('Nicht verfügbar');
});
