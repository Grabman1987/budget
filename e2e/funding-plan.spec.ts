import { expect } from '@playwright/test';
import { test } from './coverage-pilot-fixture';
import { fundingTemplate } from '@budget/domain';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark'] as const) {
  test(`funding plan ${theme}: exact rates, saved snapshot, guarded inputs and savings handoff`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const before = await (await request.get('/api/savings-plans?ended=1')).json();
    const initial = await (await request.get('/api/portfolio/funding-plan')).json();
    expect(initial.plan).toBeNull();
    const post = async (path: string, data: unknown) => {
      const r = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
      expect(r.ok()).toBe(true);
      return r.json();
    };
    const created = await post('/securities', {
      name: `Planfonds ${theme} ${info.project.name}`,
      kind: 'fund',
      currency: 'EUR',
    });
    {
      await page.goto('/vermoegen/portfolio/sparplaene');
      await page
        .getByText('Anlageplan: Vermögen, Sparrate und nächste Käufe', { exact: true })
        .click();
      const scope = page.locator('.funding-content');
      await scope.getByLabel('Monatliche Sparrate (€)', { exact: true }).fill('400');
      await scope.getByLabel('Einmalig neu investieren (€)', { exact: true }).fill('10.000');
      await scope
        .getByLabel('Global: Instrument', { exact: true })
        .selectOption(created.security.id);
      await expect(
        scope
          .getByRole('table', { name: 'Aufteilung deines Anlageplans' })
          .getByRole('row')
          .filter({ hasText: 'Bitcoin' }),
      ).toContainText('20,00');
      await expect(
        scope
          .getByRole('table', { name: 'Aufteilung deines Anlageplans' })
          .getByRole('row')
          .filter({ hasText: 'Bitcoin' }),
      ).toContainText('520,00');
      await scope.getByLabel('Global: EUR-Briefkurs je Stück', { exact: true }).fill('-1');
      await expect(scope.getByRole('alert')).toBeVisible();
      await expect(
        scope.getByRole('button', { name: 'Anlageplan speichern', exact: true }),
      ).toBeDisabled();
      await expect(scope.getByRole('table', { name: 'Aufteilung deines Anlageplans' })).toHaveCount(
        0,
      );
      await scope.getByLabel('Global: EUR-Briefkurs je Stück', { exact: true }).fill('100');
      const saveResponse = page.waitForResponse(
        (r) => r.url().endsWith('/api/portfolio/funding-plan') && r.request().method() === 'PUT',
      );
      await scope.getByRole('button', { name: 'Anlageplan speichern', exact: true }).click();
      const response = await saveResponse;
      expect(response.ok()).toBe(true);
      await expect(scope.getByRole('button', { name: /Änderungen verwerfen/ })).toHaveCount(0);
      await page.reload();
      await page
        .getByText('Anlageplan: Vermögen, Sparrate und nächste Käufe', { exact: true })
        .click();
      await expect(scope.getByLabel('Monatliche Sparrate (€)', { exact: true })).toHaveValue(
        '400,00',
      );
      await expect(scope.getByLabel('Einmalig neu investieren (€)', { exact: true })).toHaveValue(
        '10.000,00',
      );
      await expect(scope.getByLabel('Gewählte Stufe')).toHaveValue('2');
      await expect(
        scope.getByRole('columnheader', { name: 'Monatsrate', exact: true }),
      ).toBeVisible();
      await scope.getByText('Stufen und Zielgewichte bearbeiten', { exact: true }).click();
      await expect(
        scope.getByRole('columnheader', { name: 'Ab Anlagevermögen (€)', exact: true }),
      ).toBeVisible();
      await scope.getByText('Stufen und Zielgewichte bearbeiten', { exact: true }).click();
      expect(
        (await new AxeBuilder({ page }).include('.funding-planner').analyze()).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await scope
        .getByRole('heading', { name: 'Dein Anlageplan' })
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath(`funding-inputs-${theme}.png`) });
      await scope
        .getByRole('heading', { name: '3. Sparraten und nächste Käufe' })
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath(`funding-results-${theme}.png`) });
      await scope.getByRole('button', { name: 'Sparplan vorbereiten', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Sparplan anlegen', exact: true });
      await expect(dialog.getByLabel('Instrument', { exact: true })).toHaveValue(
        created.security.id,
      );
      await expect(dialog.getByLabel('Monatliche Rate', { exact: true })).toHaveValue('200,00');
      await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
      expect(await (await request.get('/api/savings-plans?ended=1')).json()).toEqual(before);
    }
  });
}

test('funding snapshot recovers from a real concurrent write and protects unknown positions and privacy', async ({
  page,
  request,
  baseURL,
}) => {
  const plan = fundingTemplate();
  plan.rows[0]!.securityId = 'unavailable-instrument';
  plan.rows[0]!.valueCents = 500000;
  const initial = await (await request.get('/api/portfolio/funding-plan')).json();
  const put = (revision: string, next: typeof plan) =>
    request.put('/api/portfolio/funding-plan', {
      headers: { origin: baseURL! },
      data: { revision, plan: next },
    });
  const saved = await put(initial.revision, plan);
  expect(saved.ok()).toBe(true);
  const state = await saved.json();
  await page.goto('/vermoegen/portfolio/sparplaene');
  await page.getByText('Anlageplan: Vermögen, Sparrate und nächste Käufe', { exact: true }).click();
  const scope = page.locator('.funding-content');
  await scope.getByRole('button', { name: 'Zugeordnete Depotwerte übernehmen' }).click();
  await expect(scope.getByRole('status')).toContainText('Instrumentzuordnung ist nicht verfügbar');
  await expect(scope.getByLabel('Global: Marktwert (€)', { exact: true })).toHaveValue('5.000,00');
  await scope.getByLabel('Monatliche Sparrate (€)', { exact: true }).fill('400');
  plan.monthlyCents = 12000;
  expect((await put(state.revision, plan)).ok()).toBe(true);
  const conflict = page.waitForResponse(
    (r) => r.url().endsWith('/api/portfolio/funding-plan') && r.request().method() === 'PUT',
  );
  await scope.getByRole('button', { name: 'Anlageplan speichern', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(scope.getByLabel('Monatliche Sparrate (€)', { exact: true })).toHaveValue('400');
  await scope.getByRole('button', { name: /Änderungen verwerfen/ }).click();
  await expect(scope.getByLabel('Monatliche Sparrate (€)', { exact: true })).toHaveValue('120,00');
  await page.keyboard.press('Control+Shift+H');
  await expect(scope.getByLabel('Global: Marktwert (€)', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await expect(scope.getByLabel('Gewählte Stufe').locator('option:checked')).not.toContainText(
    '50.000',
  );
  await expect(
    scope.getByRole('table', { name: 'Aufteilung deines Anlageplans' }),
  ).not.toContainText('60,00');
});
