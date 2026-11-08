import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { test as isolatedTest } from './isolated-ledger';
import { MAIN_URL } from '../playwright.config';
import { shiftMonth } from '../apps/web/src/nav/month';
import { eur } from '../apps/web/src/ledger/format';

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
const available = (page: Page, name: string) => row(page, name).locator('.col-avail .pill');
const categoryCoverAction = (page: Page, name: string) =>
  (page.viewportSize()?.width ?? 1024) < 768
    ? row(page, name).getByRole('button', { name: /^Deckung für .* wählen · Verfügbar / })
    : row(page, name).getByRole('button', { name: `${name} decken` });

async function postTo(
  request: APIRequestContext,
  path: string,
  data: unknown,
  origin: string = MAIN_URL,
) {
  const res = await request.post(`/api${path}`, { data, headers: { origin } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, { id: string }>;
}
const post = (request: APIRequestContext, path: string, data: unknown) =>
  postTo(request, path, data);

isolatedTest(
  'plan: distinguish an empty target inventory from zero and reached targets',
  async ({ page, baseURL }, testInfo) => {
    const month = '2026-10';
    const origin = baseURL!;
    const { request } = page;
    const post = (path: string, data: unknown) => postTo(request, path, data, origin);
    const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
    const group = (await post('/categories/groups', { name: `Zielstatus ${tag}` }))['group']!;
    const category = (
      await post('/categories', {
        name: `Ohne Monatsziel ${tag}`,
        groupId: group.id,
        class: 'need',
        stage: 2,
        target: {
          validFrom: '2026-11',
          target: { kind: 'monthly', amountCents: 0 },
        },
      })
    )['category']!;
    const hidden = await request.patch(`/api/categories/${category.id}`, {
      data: { hidden: true },
      headers: { origin },
    });
    expect(hidden.ok(), await hidden.text()).toBe(true);

    await page.goto(`/plan/monat?monat=${month}`);
    const card = page.getByTestId('income-targets');
    const openIncome = async () => {
      const disclosure = page.locator('#inspector-income');
      if (!(await disclosure.evaluate((element) => element.hasAttribute('open'))))
        await disclosure.locator(':scope > summary').click();
      await expect(disclosure).toHaveAttribute('open', '');
      await expect(card).toBeVisible();
    };
    await openIncome();
    await expect(card).toContainText('Noch nicht eingerichtet.');
    const checkCardPresentation = async (state: 'empty' | 'zero') => {
      const viewport = page.viewportSize();
      expect(viewport).toBeTruthy();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        'the plan page should not scroll horizontally',
      ).toBe(true);

      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        const axe = await new AxeBuilder({ page })
          .include('[data-testid="income-targets"]')
          .analyze();
        expect(axe.violations.map((violation) => violation.id)).toEqual([]);
        await card.screenshot({
          path: testInfo.outputPath(`income-targets-${state}-${viewport!.width}-${scheme}.png`),
        });
      }
    };
    await checkCardPresentation('empty');
    const readBudget = async () => {
      const response = await request.get(`/api/budget/${month}`);
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as {
        incomeTargets: { targetsCents: number; unfundedCategoryIds: string[] };
        summary: {
          envelopes: Array<{
            categoryId: string;
            needCents: number;
            target: { amountCents: number } | null;
          }>;
        };
      };
    };
    let budget = await readBudget();
    expect(budget.incomeTargets.targetsCents).toBe(0);
    expect(
      budget.summary.envelopes.find((row) => row.categoryId === category.id)?.target,
    ).toBeNull();

    const zeroTarget = await request.put(`/api/categories/${category.id}/target`, {
      data: { validFrom: month, target: { kind: 'monthly', amountCents: 0 } },
      headers: { origin },
    });
    expect(zeroTarget.ok(), await zeroTarget.text()).toBe(true);
    await page.reload();
    await openIncome();
    await expect(card).toContainText('Alle Monatsziele sind finanziert.');
    await checkCardPresentation('zero');
    budget = await readBudget();
    expect(
      budget.summary.envelopes.find((row) => row.categoryId === category.id)?.target,
    ).toMatchObject({ amountCents: 0 });

    await post('/accounts', {
      name: `Konto Zielstatus ${tag}`,
      type: 'checking',
      openingDate: `${month}-01`,
      openingBalanceCents: 10_000,
    });
    const reached = (
      await post('/categories', {
        name: `Erreichtes Monatsziel ${tag}`,
        groupId: group.id,
        class: 'need',
        stage: 2,
        target: {
          validFrom: month,
          target: { kind: 'monthly', amountCents: 10_000 },
        },
      })
    )['category']!;
    const assigned = await request.put(`/api/budget/${month}/assigned`, {
      data: { items: [{ categoryId: reached.id, assignedCents: 10_000 }] },
      headers: { origin },
    });
    expect(assigned.ok(), await assigned.text()).toBe(true);
    await page.reload();
    await openIncome();
    await expect(card).toContainText('Alle Monatsziele sind finanziert.');
    budget = await readBudget();
    expect(budget.summary.envelopes.find((row) => row.categoryId === reached.id)).toMatchObject({
      needCents: 0,
      target: { amountCents: 10_000 },
    });
    expect(budget.incomeTargets.unfundedCategoryIds).not.toContain(reached.id);
  },
);

// Isolated ledger: the cover step's "fest verplant" figures must not depend on expected payments
// or pending bookings other specs create in the shared database. Its today is pinned.
isolatedTest(
  'plan: assign, cover, card debt, move, undo, rollover, distribute',
  async ({ page, baseURL }, testInfo) => {
    const today = '2026-10-02';
    const month = today.slice(0, 7);
    const origin = baseURL!;
    test.setTimeout(60_000);
    // Unique per run: retries and --repeat-each write into the same database.
    const tag = `${testInfo.project.name}-${Date.now().toString(36).slice(-5)}`;
    const { request } = page;
    const post = (path: string, data: unknown) => postTo(request, path, data, origin);
    const giro = (
      await post('/accounts', {
        name: `Giro Plan ${tag}`,
        type: 'checking',
        openingDate: `${month}-01`,
        openingBalanceCents: 100_000,
      })
    )['account']!;
    // Explicit fixture: the shared database's total free money moves with other tests, so give
    // this test its own overdraft headroom and the cover cap can never be 0 here.
    const limited = await request.patch(`/api/accounts/${giro.id}`, {
      data: { overdraftLimitCents: 10_000_000 },
      headers: { origin },
    });
    expect(limited.ok(), await limited.text()).toBe(true);
    const card = (
      await post('/accounts', {
        name: `Karte Plan ${tag}`,
        type: 'credit_card',
        openingDate: `${month}-01`,
      })
    )['account']!;
    const group = (await post('/categories/groups', { name: `Plan ${tag}` }))['group']!;
    const cat = async (name: string, extra: object) =>
      (
        await post('/categories', {
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
    await post('/categories', {
      name: `Kartenzahlung ${tag}`,
      groupId: group.id,
      kind: 'card_payment',
      cardAccountId: card.id,
    });
    const book = (accountId: string, categoryId: string, amountCents: number) =>
      post('/bookings', {
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
    await expect(row(page, cinema).locator('.pname')).toHaveAttribute(
      'title',
      /neue Kartenschuld 30,00 €/,
    );
    // #587: the cover actions open from the Zu verteilen disclosure; no chip in the head.
    await expect(page.locator('.plan-chip-scroll')).not.toContainText('überzogen');
    await page.locator('.plan-tba').click();
    await expect(page.locator('.triage')).toContainText('2 Envelopes überzogen');
    await expect(page.locator('.triage')).not.toContainText(food);
    await page.locator('.plan-tba').click();

    // Assign inline with the arithmetic field.
    if (testInfo.project.name === 'mobile') {
      await row(page, cafe).locator('.plan-available').click();
      await page.getByLabel('Zugewiesen', { exact: true }).fill('60+40');
      await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    } else {
      await page.getByRole('button', { name: `Zugewiesen 0,00 € für ${cafe} ändern` }).click();
      await page.getByLabel(`Zugewiesen für ${cafe}. Rechnen erlaubt, +50 addiert.`).fill('60+40');
      await page.keyboard.press('Enter');
    }
    await expect(toast(page)).toContainText(`${cafe}: 0,00 € → 100,00 € zugewiesen`);
    await expect(available(page, cafe)).toHaveText('100,00 €');

    // Compact control beside the figure opens the existing cover panel.
    const money = await request.get(`/api/budget/${month}`);
    const cap = ((await money.json()) as { budgetMoney?: { coverCapCents: number } }).budgetMoney
      ?.coverCapCents;
    expect(cap, `cover cap before covering: ${cap}`).toBeGreaterThanOrEqual(10_000);
    await categoryCoverAction(page, food).click();
    const coverPanel = page.getByRole('complementary', { name: 'Plan-Inspektor' });
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

    // Read details on their own page; input opens a form dialog.
    await row(page, cafe).getByRole('button', { name: cafe, exact: true }).first().click();
    await page.getByRole('link', { name: 'Verlauf und Buchungen' }).click();
    await expect(page).toHaveURL(/\/plan\/monat\/envelope\//);
    await page.getByRole('button', { name: 'Zuweisen oder verschieben' }).click();
    const panel = page.getByRole('dialog', { name: cafe });
    await panel.getByRole('button', { name: 'Von hier weg' }).click();
    await panel.getByLabel('Nach', { exact: true }).selectOption({ label: `${food} · 0,00 €` });
    await panel.getByLabel('Betrag', { exact: true }).fill('20');
    await panel.getByRole('button', { name: 'Verschieben' }).click();
    await expect(toast(page)).toContainText(`20,00 € von ${cafe} zu ${food} verschoben`);
    await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
    await expect(available(page, food)).toHaveText('20,00 €');
    await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
    await expect(available(page, food)).toHaveText('0,00 €');
    await expect(available(page, cafe)).toHaveText('50,00 €');

    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);

    // Month rollover: the 50 € left in Café are carried, nothing is assigned yet.
    const nextMonth = shiftMonth(month, 1);
    const nextBudget = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/budget/${nextMonth}` &&
        response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'Nächster Monat' }).click();
    // The same carry is visible in both months. Wait for navigation before distributing,
    // otherwise the click can still reach the old month's body while the new one loads.
    await expect(page).toHaveURL(new RegExp(`monat=${nextMonth}`));
    const nextData = await (await nextBudget).json();
    // Synchronise with the new read, not the identical category carry in the previous month.
    await expect(page.getByTestId('to-be-assigned')).toHaveText(
      eur(nextData.summary.toBeAssignedCents),
    );
    await expect(available(page, cafe)).toHaveText('50,00 €');
    await expect(row(page, cafe).locator('.col-assign')).toContainText('0,00 €');

    // Geld verteilen: the target of Lebensmittel shows as a ghost value and is taken with one click.
    await page.getByRole('button', { name: 'Geld verteilen' }).click();
    if ((await page.locator('.app').getAttribute('data-budget-redesign')) === '1')
      await page.getByRole('button', { name: 'Wasserfall-Assistent' }).click();
    await page.getByRole('button', { name: `Vorschlag 300,00 € für ${food} übernehmen` }).click();
    await expect(toast(page)).toContainText('300,00 € verteilt');
    await expect(available(page, food)).toHaveText('300,00 €');
  },
);

test('plan: a negative assignment stays editable, Escape keeps it, Decken permits overdraft planning', async ({
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
  const phone = testInfo.project.name === 'mobile';
  const field = phone
    ? page.getByLabel('Zugewiesen', { exact: true })
    : page.getByLabel(`Zugewiesen für ${name}. Rechnen erlaubt, +50 addiert.`);
  const edit = () =>
    phone
      ? row(page, name).locator('.plan-available').click()
      : row(page, name)
          .getByRole('button', { name: /^Zugewiesen .* ändern$/ })
          .click();
  const commit = () =>
    phone
      ? page.getByRole('button', { name: 'Übernehmen', exact: true }).click()
      : page.keyboard.press('Enter');
  // The pre-filled "−50,00" is the value, not "50 less": Enter keeps it and writes nothing.
  await edit();
  await expect(field).toHaveValue('−50,00');
  await commit();
  if (phone) {
    await expect(field).toHaveValue('−50,00');
    await page.keyboard.press('Escape');
  }
  await expect(field).toHaveCount(0);
  // Escape leaves without writing, also not through the blur of the field going away.
  await edit();
  await field.fill('99');
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(row(page, name).locator('.col-assign')).toContainText('−50,00 €');
  expect(writes).toEqual([]);
  // A sign typed first is a change: −50 + 20 = −30, written once (Enter, not again on blur).
  await edit();
  if (phone) await field.fill('−50+20');
  else await page.keyboard.type('+20');
  await commit();
  await expect(toast(page)).toContainText(`${name}: −50,00 € → −30,00 € zugewiesen`);
  expect(writes).toHaveLength(1);

  // Explicit cover from Zu verteilen remains available and previews overdraft planning.
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
  await categoryCoverAction(page, trip).click();
  const coverPanel = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  await coverPanel.getByLabel('Aus', { exact: true }).selectOption('');
  await expect(coverPanel.getByTestId('cover-remaining')).toContainText('(Dispo)');
  await expect(coverPanel.getByRole('button', { name: /^Decken ·/ })).toBeEnabled();
  const axe = await new AxeBuilder({ page }).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  expect(writes).toHaveLength(1);
});

isolatedTest(
  'plan: over-assignment, move and goal filling keep exact cents and Undo',
  async ({ page, baseURL }) => {
    const month = '2026-10';
    const origin = baseURL!;
    const { request } = page;
    const post = (path: string, data: unknown) => postTo(request, path, data, origin);
    await post('/accounts', {
      name: 'Synthetic plan overdraft',
      type: 'checking',
      openingDate: `${month}-01`,
      openingBalanceCents: 1_000,
    });
    const group = (await post('/categories/groups', { name: 'Synthetic plan goals' })).group!;
    const name = 'Synthetic target';
    const category = (
      await post('/categories', {
        name,
        groupId: group.id,
        class: 'want',
        stage: 5,
        target: { validFrom: month, target: { kind: 'monthly', amountCents: 2_001 } },
      })
    ).category!;
    const accountsBefore = await (await request.get('/api/accounts')).json();
    const read = async () => (await (await request.get(`/api/budget/${month}`)).json()).summary;
    await page.goto(`/plan/monat?monat=${month}`);
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    const hero = page.getByTestId('to-be-assigned');
    await expect(hero).toHaveText('10,00 €');
    const phone = page.viewportSize()!.width < 768;
    if (phone) await row(page, name).locator('.plan-available').click();
    else
      await row(page, name)
        .getByRole('button', { name: /^Zugewiesen .* ändern/ })
        .click();
    const field = phone
      ? page.getByLabel('Zugewiesen', { exact: true })
      : page.getByLabel(`Zugewiesen für ${name}. Rechnen erlaubt, +50 addiert.`);
    await field.fill('12,01');
    await expect(page.getByRole('status').filter({ hasText: '(Dispo)' })).toContainText('−2,01 €');
    await expect(field).toHaveAttribute('aria-invalid', 'false');
    if (phone) await page.getByRole('button', { name: 'Übernehmen', exact: true }).click();
    else await field.press('Enter');
    await expect(hero).toHaveText('−2,01 €');
    await expect(toast(page)).toContainText('(Dispo)');
    expect((await read()).assignedCents).toBe(1_201);
    expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
    await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
    await expect(hero).toHaveText('10,00 €');

    // The API permits a move beyond available money before the next goal assignment.
    const moved = await request.post(`/api/budget/${month}/move`, {
      headers: { origin },
      data: { fromId: null, toId: category.id, amountCents: 1_501 },
    });
    expect(moved.ok()).toBe(true);
    const movedBody = await moved.json();
    expect(movedBody.toBeAssignedCents).toBe(-501);
    await page.reload();
    // All targets remain actionable at negative Zu verteilen, with a non-blocking preview.
    await page.locator('.plan-menu-verteilen > summary').click();
    await page.getByRole('button', { name: 'Alle Ziele füllen', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Alle Ziele füllen' });
    await expect(preview.getByRole('status').filter({ hasText: '(Dispo)' })).toContainText(
      '−10,01 €',
    );
    await preview.getByRole('button', { name: '5,00 € zuweisen' }).click();
    await expect(hero).toHaveText('−10,01 €');
    expect((await read()).assignedCents).toBe(2_001);
    const splitDisclosure = page.locator('[data-overview-section="split"]');
    if (!(await splitDisclosure.evaluate((element) => element.hasAttribute('open'))))
      await splitDisclosure.locator(':scope > summary').click();
    await expect(page.getByRole('list', { name: 'Zustand des Monats' })).not.toContainText(
      'Nichts ist überzogen',
    );
    await expect(page.locator('.split-band .sb-legend')).not.toContainText(
      /-\d+ %|−\d+ %|\b[1-9]\d{3,} %/,
    );

    expect(await (await request.get('/api/accounts')).json()).toEqual(accountsBefore);
    await toast(page).getByRole('button', { name: 'Rückgängig' }).click();
    await expect(hero).toHaveText('−5,01 €');
    const undone = await request.post('/api/undo', {
      headers: { origin },
      data: { groupId: movedBody.groupId },
    });
    expect(undone.ok()).toBe(true);
    await page.reload();
    await expect(hero).toHaveText('10,00 €');
    expect((await read()).assignedCents).toBe(0);
    const axe = await new AxeBuilder({ page }).include('main').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  },
);
