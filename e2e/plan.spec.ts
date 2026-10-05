import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

/**
 * Plan › Monat end to end on the real server: assign inline, cover cash overspending from the
 * compact row action, credit overspending also red, move money in the envelope panel,
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
  test.setTimeout(60_000);
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
  // Each overspending stays red in its own row; the header only aggregates.
  await expect(row(page, food)).toHaveClass(/is-over/);
  await expect(available(page, food)).toHaveText('−50,00 €');
  await expect(row(page, cinema)).toHaveClass(/is-over/);
  await expect(row(page, cinema)).toContainText('neue Kartenschuld 30,00 €');
  await expect(page.locator('.triage')).toContainText('Envelopes überzogen');
  await expect(page.locator('.triage')).not.toContainText(food);

  // Assign inline with the arithmetic field.
  await page.getByRole('button', { name: `Zugewiesen 0,00 € für ${cafe} ändern` }).click();
  await page.getByLabel(`Zugewiesen für ${cafe}. Rechnen erlaubt, +50 addiert.`).fill('60+40');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText(`${cafe}: 0,00 € → 100,00 € zugewiesen`);
  await expect(available(page, cafe)).toHaveText('100,00 €');

  // Compact control beside the figure opens the existing cover panel.
  await page.getByRole('button', { name: `${food} decken`, exact: true }).click();
  const coverPanel = page.getByRole('dialog', { name: food });
  await coverPanel
    .getByLabel('Aus', { exact: true })
    .selectOption({ label: `${cafe} · 100,00 € · fest verplant 0,00 € · frei 100,00 €` });
  await expect(coverPanel.getByTestId('cover-remaining')).toHaveText(
    `aus ${cafe} · bleibt 50,00 €`,
  );
  await coverPanel.getByRole('button', { name: 'Decken · 50,00 €', exact: true }).click();
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

test('plan: a negative assignment stays editable, Escape keeps it, Decken asks when short', async ({
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
  const { request } = page;
  const group = (await post(request, '/categories/groups', { name: `Plan neg ${tag}` }))['group']!;
  const name = `Rücklage N ${tag}`;
  const category = (
    await post(request, '/categories', { name, groupId: group.id, class: 'want', stage: 5 })
  )['category']!;
  const put = await request.put(`/api/budget/${month}/assigned`, {
    data: { items: [{ categoryId: category.id, assignedCents: -5_000 }] },
    headers: { origin: MAIN_URL },
  });
  expect(put.ok(), await put.text()).toBe(true);
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/budget/')) writes.push(r.url());
  });

  await page.goto(`/plan/monat?monat=${month}`);
  const field = page.getByLabel(`Zugewiesen für ${name}. Rechnen erlaubt, +50 addiert.`);
  const edit = () =>
    row(page, name)
      .getByRole('button', { name: /^Zugewiesen .* ändern$/ })
      .click();
  // The pre-filled "−50,00" is the value, not "50 less": Enter keeps it and writes nothing.
  await edit();
  await expect(field).toHaveValue('−50,00');
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  // Escape leaves without writing, also not through the blur of the field going away.
  await edit();
  await page.keyboard.type('99');
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(row(page, name).locator('.col-assign')).toContainText('−50,00 €');
  expect(writes).toEqual([]);
  // A sign typed first is a change: −50 + 20 = −30, written once (Enter, not again on blur).
  await edit();
  await page.keyboard.type('+20');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText(`${name}: −50,00 € → −30,00 € zugewiesen`);
  expect(writes).toHaveLength(1);

  // Decken from "Zu verteilen" never goes below 0 silently: more card debt than it holds asks.
  const view = (await (await request.get(`/api/budget/${month}`)).json()) as {
    summary: { toBeAssignedCents: number };
  };
  const tba = view.summary.toBeAssignedCents;
  // A fresh envelope, so the card spending is credit overspending (new card debt): cash
  // overspending would lower next month's "Zu verteilen" for the other tests.
  const trip = `Urlaub N ${tag}`;
  const tripCat = (
    await post(request, '/categories', { name: trip, groupId: group.id, class: 'want', stage: 5 })
  )['category']!;
  const card = (
    await post(request, '/accounts', {
      name: `Karte neg ${tag}`,
      type: 'credit_card',
      openingDate: `${month}-01`,
    })
  )['account']!;
  // Only a card with its card payment envelope turns spending over the envelope into card debt.
  await post(request, '/categories', {
    name: `Kartenzahlung neg ${tag}`,
    groupId: group.id,
    kind: 'card_payment',
    cardAccountId: card.id,
  });
  await post(request, '/bookings', {
    type: 'booking',
    accountId: card.id,
    date: today,
    // Far more than "Zu verteilen" holds, even if other tests add money meanwhile.
    amountCents: -(Math.max(tba, 0) + 100_000_000),
    categoryId: tripCat.id,
  });
  await page.reload();
  await page.getByRole('button', { name: `${trip} decken`, exact: true }).click();
  const coverPanel = page.getByRole('dialog', { name: trip });
  if (tba > 0) {
    await coverPanel.getByLabel('Aus', { exact: true }).selectOption('');
    await coverPanel.getByRole('button', { name: /^Decken ·/ }).click();
    const choice = page.getByRole('group', { name: 'Decken aus Zu verteilen' });
    await expect(choice.getByRole('button', { name: /^Nur .* decken$/ })).toBeVisible();
    await expect(choice.getByRole('button', { name: /Trotzdem ganz decken/ })).toHaveCount(0);
    await choice.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(choice).toHaveCount(0);
  } else {
    await expect(coverPanel.getByLabel('Aus').locator('option[value=""]')).toHaveCount(0);
  }
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  expect(writes).toHaveLength(1);
});

test('plan: the guard refuses assigning more than Zu verteilen holds, in the field and the API', async ({
  page,
}, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
  const { request } = page;
  const group = (await post(request, '/categories/groups', { name: `Plan guard ${tag}` }))[
    'group'
  ]!;
  const name = `Schranke G ${tag}`;
  const category = (
    await post(request, '/categories', { name, groupId: group.id, class: 'want', stage: 5 })
  )['category']!;
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/budget/')) writes.push(r.url());
  });

  // The API refuses with 422 and a German message; nothing is written.
  const refused = await request.put(`/api/budget/${month}/assigned`, {
    data: { items: [{ categoryId: category.id, assignedCents: 99_999_999_900 }] },
    headers: { origin: MAIN_URL },
  });
  expect(refused.status()).toBe(422);
  expect(await refused.json()).toMatchObject({
    error: 'category_rule',
    message: expect.stringMatching(/Höchstens|nichts frei/),
  });

  // The inline field refuses too, says why and stays open; no request leaves the page.
  await page.goto(`/plan/monat?monat=${month}`);
  await row(page, name)
    .getByRole('button', { name: /^Zugewiesen .* ändern$/ })
    .click();
  await page.keyboard.type('999999999');
  await page.keyboard.press('Enter');
  const field = page.getByLabel(`Zugewiesen für ${name}. Rechnen erlaubt, +50 addiert.`);
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: /Höchstens|nichts frei/ })).toBeVisible();
  expect(writes).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(row(page, name).locator('.col-assign')).toContainText('0,00 €');

  // The month status never says "Nichts ist überzogen." while the hero says too much assigned.
  const hero = page.getByTestId('to-be-assigned');
  const negative = (await hero.innerText()).trim().startsWith('−');
  const status = page.getByRole('list', { name: 'Zustand des Monats' });
  if (negative) await expect(status).not.toContainText('Nichts ist überzogen');
  await expect(status).toBeVisible();

  // 50/30/20 never shows percentages that mean nothing.
  const split = page.locator('.split-band');
  await expect(split.locator('.sb-legend')).not.toContainText(/-\d+ %|−\d+ %|\b[1-9]\d{3,} %/);

  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
});
