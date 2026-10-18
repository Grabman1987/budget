import { expect, type Page } from '@playwright/test';

/**
 * Konten › Prüfen opens on one part ("Umsätze" or "Aufgaben", #561); the rest sits behind the other.
 * Selects a part and asserts it is the pressed one before the caller acts on its rows.
 */
export async function openPruefenPart(page: Page, part: 'Umsätze' | 'Aufgaben') {
  const button = page
    .getByRole('group', { name: 'Teil von Prüfen' })
    .getByRole('button', { name: new RegExp(`^${part} · \\d+$`) });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}
