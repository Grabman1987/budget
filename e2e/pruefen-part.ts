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

/** Open the actual source disclosure before acting on its retained task rows (#566). */
export async function openPruefenSource(
  page: Page,
  source: 'Konten prüfen' | 'Plan' | 'Belege ohne Buchung' | 'Gehaltszettel' | 'Weitere Aufgaben',
) {
  const part = page
    .getByRole('group', { name: 'Teil von Prüfen' })
    .getByRole('button', { name: /^Aufgaben · \d+$/ });
  // Re-selecting the active part intentionally clears the product's `gruppe` URL state.
  // Preserve that state when opening its source after returning from a warning detail.
  if ((await part.getAttribute('aria-pressed')) !== 'true') await part.click();
  await expect(part).toHaveAttribute('aria-pressed', 'true');
  const button = page
    .getByRole('region', { name: 'Aufgaben nach Quelle', exact: true })
    .getByRole('button', { name: new RegExp(`^${source} (öffnen|schließen)$`) });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}
