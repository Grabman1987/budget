import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

/**
 * Plan › Monat end to end on the real server: assign inline, cover cash overspending from the
 * triage bar, credit overspending as new card debt (not red), move money in the envelope panel,
 * undo, month rollover and "Geld verteilen" with a ghost value. Desktop and phone share the
 * database, so every name carries the project and only the own envelopes are asserted.
 */

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const month = today.slice(0, 7);
const toast = (page: Page) => page.locator('.toast.is-open');
const row = (page: Page, name: string) => page.locator('tr.prow', { hasText: name });
const available = (page: Page, name: string) => row(page, name).locator('.col-avail');

async function post(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(`/api${path}`, { data, headers: { origin: MAIN_URL } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, { id: string }>;
}

test('plan: assign, cover, card debt, move, undo, rollover, distribute', async ({
  page,
}, testInfo) => {
  // Unique per run: retries and --repeat-each write into the same database.
  const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
  const { request } = page;
  const giro = (
    await post(request, '/accounts', {
      name: `Giro Plan ${tag}`,
      type: 'checking',
      openingDate: `${month}-01`,
      openingBalanceCents: 100_000,
    })
  )['account']!;
  const card = (
    await post(request, '/accounts', {
      name: `Karte Plan ${tag}`,
      type: 'credit_card',
      openingDate: `${month}-01`,
    })
  )['account']!;
  const group = (await post(request, '/categories/groups', { name: `Plan ${tag}` }))['group']!;
  const cat = async (name: string, extra: object) =>
    (
      await post(request, '/categories', {
        name,
        groupId: group.id,
        class: 'need',
        stage: 2,
        ...extra,
      })
    )['category']!;
  const food = `Lebensmittel P ${tag}`;
  const cafe = `Café P ${tag}`;
  const cinema = `Kino P ${tag}`;
  const foodCat = await cat(food, {
    target: { validFrom: month, target: { kind: 'monthly', amountCents: 30_000 } },
  });
  await cat(cafe, { class: 'want' });
  const cinemaCat = await cat(cinema, { class: 'want' });
  await post(request, '/categories', {
    name: `Kartenzahlung ${tag}`,
    groupId: group.id,
    kind: 'card_payment',
    cardAccountId: card.id,
  });
  const book = (accountId: string, categoryId: string, amountCents: number) =>
    post(request, '/bookings', {
      type: 'booking',
      accountId,
      date: today,
      amountCents,
      categoryId,
    });
  await book(giro.id, foodCat.id, -5_000);
  await book(card.id, cinemaCat.id, -3_000);

  await page.goto(`/plan/monat?monat=${month}`);
  // Cash overspending: red row and a triage entry; credit overspending: new card debt, not red.
  await expect(row(page, food)).toHaveClass(/is-over/);
  await expect(available(page, food)).toHaveText('−50,00 €');
  await expect(row(page, cinema)).not.toHaveClass(/is-over/);
  await expect(row(page, cinema)).toContainText('neue Kartenschuld 30,00 €');
  await expect(page.locator('.triage')).toContainText(`${food} ist überzogen`);

  // Assign inline with the arithmetic field.
  await page.getByRole('button', { name: `Zugewiesen 0,00 € für ${cafe} ändern` }).click();
  await page.getByLabel(`Zugewiesen für ${cafe}. Rechnen erlaubt, +50 addiert.`).fill('60+40');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText(`${cafe}: 0,00 € → 100,00 € zugewiesen`);
  await expect(available(page, cafe)).toHaveText('100,00 €');

  // Cover the overspending from Café in the triage bar.
  await page.getByLabel(`Aus Envelope für ${food}`).selectOption({ label: `${cafe} · 100,00 €` });
  await page
    .locator('.triage tr', { hasText: food })
    .getByRole('button', { name: 'Decken' })
    .click();
  await expect(toast(page)).toContainText(`50,00 € von ${cafe} zu ${food} verschoben`);
  await expect(available(page, food)).toHaveText('0,00 €');
  await expect(available(page, cafe)).toHaveText('50,00 €');

  // Move 20 € in the envelope panel, then undo it.
  await row(page, cafe)
    .getByRole('button', { name: new RegExp(cafe) })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: cafe });
  await panel.getByRole('button', { name: 'Von hier weg' }).click();
  await panel.getByLabel('Nach', { exact: true }).selectOption({ label: `${food} · 0,00 €` });
  await panel.getByLabel('Betrag', { exact: true }).fill('20');
  await panel.getByRole('button', { name: 'Verschieben' }).click();
  await expect(toast(page)).toContainText(`20,00 € von ${cafe} zu ${food} verschoben`);
  await expect(available(page, food)).toHaveText('20,00 €');
  await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
  await expect(available(page, food)).toHaveText('0,00 €');
  await expect(available(page, cafe)).toHaveText('50,00 €');

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

  // Month rollover: the 50 € left in Café are carried, nothing is assigned yet.
  await page.getByRole('button', { name: 'Nächster Monat' }).click();
  await expect(available(page, cafe)).toHaveText('50,00 €');
  await expect(row(page, cafe).locator('.col-assign')).toContainText('0,00 €');

  // Geld verteilen: the target of Lebensmittel shows as a ghost value and is taken with one click.
  await page.getByRole('button', { name: 'Geld verteilen' }).click();
  await page.getByRole('button', { name: `Vorschlag 300,00 € für ${food} übernehmen` }).click();
  await expect(toast(page)).toContainText('300,00 € verteilt');
  await expect(available(page, food)).toHaveText('300,00 €');
});
