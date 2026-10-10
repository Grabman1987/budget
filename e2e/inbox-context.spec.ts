import AxeBuilder from '@axe-core/playwright';
import { inboxItem, insertTracked, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.setTimeout(120_000);

test('inbox periods, repeated causes and warning details preserve context and open tasks', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    for (const [id, date, reason] of [
      ['history', '2026-09-30', 'mapping_required'],
      ['check-a', '2026-10-01', 'mapping_required'],
      ['check-b', '2026-10-02', 'mapping_required'],
      ['format', '2026-10-02', 'schema'],
    ])
      insertTracked(
        opened.db,
        inboxItem,
        {
          id: id!,
          kind: 'import',
          title: 'Synthetische Datenprüfung',
          refType: 'read_source',
          refId: 'synthetic-source',
          detail: JSON.stringify({ reason, source: { id } }),
          createdAt: `${date}T12:00:00.000Z`,
        },
        { actor: 'e2e' },
      );
  } finally {
    opened.close();
  }
  await page.goto('/plan/monat?monat=2026-09');
  const header = page.locator(info.project.name === 'mobile' ? '.m-head' : '.topbar');
  await header.getByRole('link', { name: /^Posteingang/ }).click();
  await expect(page).toHaveURL(/\/konten\/posteingang/);
  await expect(page.getByRole('dialog', { name: 'Posteingang', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zur vorherigen Ansicht' }).click();
  await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09$/);
  await header.getByRole('link', { name: /^Posteingang/ }).click();
  await page.getByLabel('Zeitraum der Aufgaben').selectOption('current');
  await expect(page.getByText('4 offen', { exact: true })).toBeVisible();
  await expect(page.getByTestId('inbox-row')).toHaveCount(1);
  const group = page.getByRole('button', { name: /Synthetische Datenprüfung.*2 Aufgaben/ });
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.click();
  await expect(page.getByTestId('inbox-row')).toHaveCount(3);
  const detailLink = page
    .getByTestId('inbox-row')
    .filter({ hasText: '01.10.2026' })
    .getByRole('link', { name: 'Warnung erklären' });
  await detailLink.click();
  await expect(page).toHaveURL(/\/konten\/posteingang\/check-a/);
  await page.getByText('Quelldaten und Zuordnung anzeigen').click();
  await expect(page.locator('.source-inbox-detail pre')).toContainText('check-a');
  await expect(page.getByRole('link', { name: 'Datenquelle prüfen' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`inbox-detail-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  }
  await page.reload();
  await page.getByRole('link', { name: 'Zurück zum Posteingang' }).click();
  await expect(page.getByLabel('Zeitraum der Aufgaben')).toHaveValue('current');
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await detailLink.click();
  await page.goBack();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Zeitraum der Aufgaben').selectOption('historical');
  await expect(page.getByTestId('inbox-row')).toHaveCount(1);
  await expect(page.getByTestId('inbox-row')).toContainText('30.09.2026');
  await page.getByLabel('Zeitraum der Aufgaben').selectOption('all');
  const response = await page.request.get('/api/inbox');
  expect((await response.json()).entries).toHaveLength(4);
  await page.goto('/konten/posteingang/check-b?aufgaben=historical');
  await expect(page.locator('.source-inbox-detail')).toBeVisible();
  await page.getByRole('link', { name: 'Zurück zum Posteingang' }).click();
  await expect(page.getByLabel('Zeitraum der Aufgaben')).toHaveValue('historical');
});

test('repeated data checks retain whole-cause counts across network pages', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    for (let index = 0; index < 101; index++)
      insertTracked(
        opened.db,
        inboxItem,
        {
          id: `repeated-${String(index).padStart(3, '0')}`,
          kind: 'import',
          title: 'Wiederholte Zuordnung',
          refType: 'read_source',
          refId: 'synthetic-source',
          detail: JSON.stringify({ reason: 'mapping_required', key: `synthetic-${index}` }),
          createdAt: '2026-10-01T12:00:00.000Z',
        },
        { actor: 'e2e' },
      );
  } finally {
    opened.close();
  }
  await page.goto('/konten/posteingang?aufgaben=current');
  const group = page.getByRole('button', { name: /Wiederholte Zuordnung.*101 Aufgaben/ });
  await expect(group).toBeVisible();
  await expect(page.getByTestId('inbox-row')).toHaveCount(0);
  await expect(page.getByText('100 von 101 geladen', { exact: false })).toBeVisible();
  await group.click();
  await expect(page.getByTestId('inbox-row')).toHaveCount(100);
  await page.getByRole('button', { name: /Weitere anzeigen/ }).click();
  await expect(page.getByTestId('inbox-row')).toHaveCount(101);
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  const last = page.getByTestId('inbox-row').last().getByRole('link', { name: 'Warnung erklären' });
  await last.click();
  await expect(page).toHaveURL(/repeated-100/);
  const resolve = page.getByRole('button', { name: 'Als erledigt markieren' });
  await expect(resolve).toBeVisible();
  await resolve.click();
  await expect(resolve).toHaveCount(0);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(resolve).toBeVisible();
  await page.getByRole('link', { name: 'Zurück zum Posteingang' }).click();
  await expect(page.getByTestId('inbox-row')).toHaveCount(101);
  expect((await (await page.request.get('/api/inbox')).json()).count).toBe(101);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'mobile') {
    for (const control of [group, page.getByLabel('Zeitraum der Aufgaben'), last]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({
    path: info.outputPath(`inbox-groups-${info.project.name}.png`),
    fullPage: false,
  });
});
