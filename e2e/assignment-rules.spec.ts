import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SAMPLE_NOW } from './sample';

test('assignment editor saves, tests, toggles and undoes on the real API', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date(SAMPLE_NOW));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  const name = `Zuordnung Shop ${info.project.name} ${info.retry}`;
  await page.goto('/einstellungen/zuordnung');
  await page.getByRole('button', { name: 'Regel erstellen', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Zuordnungsregel erstellen' });
  await editor.getByLabel('Regelname').fill(name);
  await editor.getByLabel('Text', { exact: true }).fill(`Shop ${info.project.name}`);
  await editor.getByLabel('Kategorie setzen').selectOption('e2e-essen');
  await editor.getByRole('button', { name: 'Gegen Historie testen' }).click();
  await expect(editor.getByText('Trifft auf 0 Buchungen zu.')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('.assignment-editor').analyze()).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const frame = await editor.boundingBox();
  const head = await editor.locator('.assignment-editor-head').boundingBox();
  const foot = await editor.locator('.assignment-editor-foot').boundingBox();
  expect(head!.y).toBeGreaterThanOrEqual(frame!.y);
  expect(foot!.y + foot!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
  expect(foot!.y + foot!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({
    path: `test-results/assignment-editor-${info.project.name}-light.png`,
    fullPage: false,
  });
  await page.evaluate(() => {
    document.documentElement.dataset['theme'] = 'dark';
  });
  await page.screenshot({
    path: `test-results/assignment-editor-${info.project.name}-dark.png`,
    fullPage: false,
  });
  await editor.getByRole('button', { name: 'Regel speichern' }).click();
  await expect(editor).toBeHidden();
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: new RegExp(name) }) });
  await expect(row).toContainText('aktiv');
  await row.getByRole('button', { name: new RegExp('Deaktivieren') }).click();
  await expect(row).toContainText('deaktiviert');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(row).toContainText('Vorschlag');
  await expect(row.getByRole('button', { name: new RegExp('Deaktivieren') })).toBeVisible();
  await row.getByRole('button', { name: new RegExp('Bearbeiten') }).click();
  await expect(page.getByRole('dialog', { name: 'Zuordnungsregel bearbeiten' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Zuordnungsregel bearbeiten' })).toBeHidden();
  await expect(row.getByRole('button', { name: new RegExp('Bearbeiten') })).toBeFocused();
  expect((await new AxeBuilder({ page }).include('.assignment-page').analyze()).violations).toEqual(
    [],
  );
  await row.getByRole('button', { name: new RegExp('Entfernen') }).click();
  await expect(row).toHaveCount(0);
});

test('bank suggestions show actions, reject cleanly and offer learning after confirmation', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(SAMPLE_NOW));
  const candidateId = '10000000-0000-4000-8000-000000000042';
  const revision = 'a'.repeat(64),
    candidateRevision = 'b'.repeat(64);
  let confirmed = false;
  let body: unknown;
  const rule = {
    id: 'synthetic-rule',
    priority: 0,
    revision,
    name: 'Shop A zuordnen',
    enabled: true,
    automatic: true,
    unavailable: null,
    match: { mode: 'all', conditions: [{ type: 'contains', text: 'Shop A' }] },
    actions: { categoryId: 'e2e-essen', memo: 'Shopnotiz', flag: 'blue' },
  };
  await page.route('**/api/inbox', (route) =>
    route.fulfill({
      json: {
        asOf: '2026-09-17',
        count: confirmed ? 0 : 1,
        entries: confirmed
          ? []
          : [
              {
                id: candidateId,
                type: 'stored',
                kind: 'import',
                title: 'Bankumsatz prüfen',
                detail: 'Shop A · −12,01 €',
                refType: 'bank-sync-candidate',
                refId: candidateId,
                urgent: false,
                createdAt: '2026-09-17T02:30:00Z',
              },
            ],
      },
    }),
  );
  await page.route('**/api/assignment-rules/candidates/**', (route) =>
    route.fulfill({
      json: {
        candidate: { id: candidateId },
        candidateRevision,
        cleanup: { cleaned: 'Shop A', payeeId: null, payeeName: null, learned: false },
        existingTransfer: null,
        suggestions: [rule],
      },
    }),
  );
  await page.route('**/api/bank-sync/candidates/**/confirm', (route) => {
    body = route.request().postDataJSON();
    confirmed = true;
    return route.fulfill({ json: { groupId: 'synthetic-group', bookingId: 'synthetic-booking' } });
  });
  await page.route('**/api/assignment-rules/bookings/**/learn', (route) =>
    route.fulfill({
      json: {
        draft: {
          name: 'Shop A',
          enabled: true,
          automatic: false,
          match: rule.match,
          actions: rule.actions,
        },
      },
    }),
  );
  await page.goto('/konten/posteingang');
  await expect(page.getByText('Notiz: Shopnotiz')).toBeVisible();
  expect(confirmed).toBe(false);
  await page.getByRole('button', { name: 'Vorschlag ablehnen' }).click();
  await expect(page.getByLabel('Kategorie', { exact: true })).toBeVisible();
  await page.getByLabel('Regelvorschlag').selectOption('synthetic-rule');
  await page.getByRole('button', { name: 'Als Buchung bestätigen' }).click();
  await expect(page.getByRole('button', { name: 'Regel daraus erstellen' })).toBeVisible();
  expect(body).toEqual({ categoryId: null, ruleId: rule.id, revision, candidateRevision });
  await page.getByRole('button', { name: 'Regel daraus erstellen' }).click();
  const editor = page.getByRole('dialog', { name: 'Zuordnungsregel erstellen' });
  await expect(editor.getByLabel('Regelname')).toHaveValue('Shop A');
  await expect(editor.getByLabel('Automatisch übernehmen')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
});
