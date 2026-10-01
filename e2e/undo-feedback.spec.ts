import { inboxItem, insertTracked, openDatabase, updateTracked } from '@budget/db';
import { expect, test } from '@playwright/test';
import { DB_MAIN } from '../playwright.config';

test('shared redo refusal stays visible in the original toast and preserves source state', async ({
  page,
}, info) => {
  const id = `redo-feedback-${info.project.name}-${info.retry}`;
  const title = `Quelle ${id}`;
  const { db, close } = openDatabase(DB_MAIN);
  try {
    insertTracked(db, inboxItem, { id, kind: 'stale_value', title }, { actor: 'e2e' });
  } finally {
    close();
  }
  await page.goto('/konten/posteingang');
  const row = page.getByTestId('inbox-row').filter({ hasText: title });
  await row.getByRole('button', { name: 'Als erledigt markieren' }).click();
  await expect(row).toHaveCount(0);
  const toast = page.locator('.toast.is-open');
  await toast.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toBeVisible();
  const source = openDatabase(DB_MAIN);
  try {
    updateTracked(
      source.db,
      inboxItem,
      [id],
      { detail: 'Neuere Quellenprüfung' },
      { actor: 'source' },
    );
  } finally {
    source.close();
  }
  await toast.getByRole('button', { name: 'Wiederholen' }).click();
  await expect(toast).toHaveText('Wiederholen nicht möglich. Bitte prüfe den aktuellen Stand.');
  await expect(toast.getByRole('button')).toHaveCount(0);
  await expect(row).toBeVisible();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`undo-feedback-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  }
  await page.reload();
  await expect(row).toContainText('Neuere Quellenprüfung');
  await row.getByRole('button', { name: 'Als erledigt markieren' }).click();
  await expect(row).toHaveCount(0);
});
