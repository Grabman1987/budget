import AxeBuilder from '@axe-core/playwright';
import { inboxItem, openDatabase } from '@budget/db';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test.setTimeout(120_000);
test('source summaries leave decisions clear and retain grouped, filtered, paged movement actions', async ({
  page,
  isolatedLedger,
}, info) => {
  const opened = openDatabase(isolatedLedger.databasePath);
  try {
    for (let i = 0; i < 101; i++)
      opened.db
        .insert(inboxItem)
        .values({
          id: `movement-${String(i).padStart(3, '0')}`,
          kind: 'import',
          title: 'Quellbewegung: Zuordnung fehlt',
          refType: 'read_source',
          refId: 'crypto',
          detail: JSON.stringify({ id: `synthetic-${i}`, reason: 'mapping_required' }),
          createdAt: '2026-10-01T12:00:00Z',
        })
        .run();
    opened.db
      .insert(inboxItem)
      .values({
        id: 'format',
        kind: 'other',
        title: 'Quellbewegung: Datenformat prüfen',
        refType: 'read_source',
        refId: 'crypto',
        detail: JSON.stringify({ reason: 'schema' }),
        createdAt: '2026-10-01T12:00:00Z',
      })
      .run();
    opened.db
      .insert(inboxItem)
      .values({
        id: 'balance',
        kind: 'import',
        title: 'Quellsaldo: Bestand prüfen',
        refType: 'read_source',
        refId: 'crypto',
        detail: JSON.stringify({ reason: 'difference' }),
        createdAt: '2026-10-01T12:00:00Z',
      })
      .run();
  } finally {
    opened.close();
  }
  await page.goto('/konten/posteingang');
  const summary = page.getByRole('link', { name: 'Krypto-Lesequelle: 102 Bewegungen zu prüfen' });
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('inbox-row')).toHaveCount(1);
  await expect(page.getByTestId('inbox-row')).toContainText('Quellsaldo');
  expect((await (await page.request.get('/api/inbox/count')).json()).count).toBe(1);
  expect((await (await page.request.get('/api/heute')).json()).attention.inboxCount).toBe(1);
  if (info.project.name === 'mobile')
    expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath(`inbox-${info.project.name}.png`),
    fullPage: true,
  });
  await summary.click();
  await expect(page).toHaveURL(/einstellungen\/datenquellen#crypto-source-title/);
  const source = page.getByRole('region', { name: 'Krypto-Lesequelle', exact: true });
  await source.getByLabel('Bewegungen nach Titel').selectOption('Quellbewegung: Zuordnung fehlt');
  const group = source.getByRole('button', {
    name: /Quellbewegung: Zuordnung fehlt.*101 Aufgaben/,
  });
  await group.click();
  await expect(source.getByTestId('inbox-row')).toHaveCount(100);
  await source.getByRole('button', { name: /Weitere anzeigen/ }).click();
  await expect(source.getByTestId('inbox-row')).toHaveCount(101);
  await source
    .getByTestId('inbox-row')
    .last()
    .getByRole('button', { name: 'Als erledigt markieren' })
    .click();
  await expect(group).toHaveCount(0);
  await expect(source.getByTestId('inbox-row')).toHaveCount(100);
  await page.locator('.toast.is-open').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(group).toBeVisible();
  // Resolution removes the last network page; undo makes that page available again.
  await source.getByRole('button', { name: /Weitere anzeigen/ }).click();
  await expect(source.getByTestId('inbox-row')).toHaveCount(101);
  await source
    .getByLabel('Bewegungen nach Titel')
    .selectOption('Quellbewegung: Datenformat prüfen');
  await source
    .getByRole('button', { name: /Quellbewegung: Datenformat prüfen.*Einzelpunkte anzeigen/ })
    .click();
  await expect(source.getByTestId('inbox-row')).toHaveCount(1);
  await expect(
    source.getByText('Die Bewegung konnte nicht gelesen werden.', { exact: false }),
  ).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      ),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`source-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  }
  await page.goto('/konten/posteingang/balance');
  await page.getByRole('button', { name: 'Als erledigt markieren' }).click();
  await page.goto('/konten/posteingang');
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('inbox-row')).toHaveCount(0);
  expect((await (await page.request.get('/api/inbox/count')).json()).count).toBe(0);
});
