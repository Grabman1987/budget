import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * Issue #583: the capture dialog is a wide two-column card on desktop (head left, booking lines
 * right), the note is always visible, "Mehr ▾" holds Projekt and Markierung and is open exactly
 * when one of them is filled, and at most three category suggestions sit in one line.
 */

const desktop = (info: TestInfo) => info.project.name === 'desktop';

async function choose(scope: Locator, label: string, search: string, option: RegExp | string) {
  await scope.getByLabel(label, { exact: true }).fill(search);
  await scope.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
}

type Api = (path: string, data: unknown) => Promise<{ [key: string]: { id: string } }>;

function api(
  request: Parameters<Parameters<typeof test>[2]>[0]['request'],
  baseURL: string | undefined,
): Api {
  return async (path, data) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
}

async function openNew(page: Page, accountId: string) {
  await page.goto(`/?panel=buchung&konto=${accountId}`);
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByLabel('Betrag', { exact: true })).toBeFocused();
  return dialog;
}

for (const scenario of ['category', 'outlay', 'percent', 'amount', 'several'] as const) {
  test(`two columns, no scrolling for up to two lines: ${scenario}`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    test.skip(!desktop(info), 'The two-column card is the desktop layout (1440 x 900).');
    const post = api(request, baseURL);
    const tag = `${info.project.name}-${scenario}-${info.retry}`;
    const { account } = await post('/accounts', {
      name: `Zweispalt Muster ${tag}`,
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    });
    const { contact } = await post('/contacts', { name: `Kontakt Zweispalt ${tag}` });
    const dialog = await openNew(page, account.id);
    const amount = dialog.getByLabel('Betrag', { exact: true });
    await amount.fill('120');
    await dialog.getByLabel('Empfänger', { exact: true }).fill(`Laden Muster ${tag}`);
    if (scenario === 'outlay') await choose(dialog, 'Kategorie', contact.name, /^Für Kontakt/);
    else await choose(dialog, 'Kategorie', 'Essen', /^Essen/);
    if (scenario === 'percent' || scenario === 'amount') {
      await dialog.getByRole('button', { name: 'Teilen ▾' }).click();
      await dialog.getByLabel('Kontakt 1.1', { exact: true }).selectOption(contact.id);
      if (scenario !== 'percent')
        await dialog
          .getByRole('group', { name: 'Anteilart 1.1', exact: true })
          .getByRole('button', { name: 'Betrag', exact: true })
          .click();
    }
    if (scenario === 'several') {
      await dialog.getByRole('button', { name: '+ Weitere Kategorie', exact: true }).click();
      await dialog.getByLabel('Betrag 1', { exact: true }).fill('100');
      await choose(
        dialog.getByRole('group', { name: 'Zeile 2', exact: true }),
        'Kategorie 2',
        'Reise',
        /^Reise/,
      );
      await dialog.getByLabel('Betrag 2', { exact: true }).fill('20');
    }

    await page.screenshot({
      path: `docs/evidence/issue-583-capture-two-column/${scenario}-desktop.png`,
    });
    const box = async (locator: Locator) => (await locator.boundingBox())!;
    const dialogBox = await box(dialog);
    expect(dialogBox.width).toBeGreaterThanOrEqual(940);
    expect(dialogBox.width).toBeLessThanOrEqual(962);
    const [betrag, empfaenger, konto, datum, wiederholen, notiz, kategorie] = await Promise.all(
      [
        amount,
        dialog.getByLabel('Empfänger', { exact: true }),
        dialog.getByLabel('Bezahlt von'),
        dialog.getByLabel('Datum', { exact: true }),
        dialog.getByLabel('Wiederholen'),
        dialog.getByLabel('Notiz'),
        dialog.getByLabel(scenario === 'several' ? 'Kategorie 1' : 'Kategorie', { exact: true }),
      ].map(box),
    );
    // Left column: Betrag, Empfänger, Bezahlt von, Datum, Notiz share one left edge and stack.
    // (the amount input itself starts after its sign, so Empfänger is the reference edge)
    for (const left of [konto, datum, notiz])
      expect(Math.abs(left!.x - empfaenger!.x)).toBeLessThan(2);
    expect(betrag!.x).toBeLessThan(empfaenger!.x + empfaenger!.width / 2);
    expect(betrag!.y).toBeLessThan(empfaenger!.y);
    expect(empfaenger!.y).toBeLessThan(konto!.y);
    expect(konto!.y).toBeLessThan(datum!.y);
    expect(datum!.y).toBeLessThan(notiz!.y);
    // Datum 2/3, Wiederholen 1/3 of the row, side by side.
    expect(wiederholen!.x).toBeGreaterThan(datum!.x + datum!.width);
    expect(Math.abs(wiederholen!.y - datum!.y)).toBeLessThan(2);
    // Right column: the lines start to the right of the whole head and at the top.
    expect(kategorie!.x).toBeGreaterThan(betrag!.x + betrag!.width);
    expect(kategorie!.x).toBeGreaterThan(wiederholen!.x + wiederholen!.width - 1);
    // Notiz is one line and always visible (not folded into Mehr).
    expect(notiz!.height).toBeLessThan(60);
    expect(await dialog.locator('details.kmore').getByLabel('Notiz').count()).toBe(0);
    // No scrolling: the body shows everything and the card stays inside the viewport.
    const body = dialog.locator('.bk-body');
    expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    const fresh = await box(dialog);
    expect(fresh.y).toBeGreaterThanOrEqual(0);
    expect(fresh.y + fresh.height).toBeLessThanOrEqual(900);
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeInViewport({
      ratio: 1,
    });
  });
}

test('at most three suggestions in one line without overflow; Mehr and Notiz', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(Math.max(90_000, info.timeout));
  const post = api(request, baseURL);
  const tag = `${info.project.name}-${info.retry}`;
  const { account } = await post('/accounts', {
    name: `Vorschlag Muster ${tag}`,
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const dialog = await openNew(page, account.id);
  await dialog.getByLabel('Betrag', { exact: true }).fill('12');
  await choose(dialog, 'Kategorie', 'Essen', /^Essen/);
  const rail = dialog.getByRole('group', { name: 'Vorschläge' });
  const chips = rail.getByRole('button');
  expect(await chips.count()).toBeLessThanOrEqual(3);
  expect(await chips.count()).toBeGreaterThan(0);
  expect(await rail.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const ys = await chips.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().y)),
  );
  expect(new Set(ys).size).toBe(1);
  const railBox = (await rail.boundingBox())!;
  const chipBoxes = await chips.evaluateAll((els) =>
    els.map((el) => {
      const { x, width, height } = el.getBoundingClientRect();
      return { right: x + width, height };
    }),
  );
  for (const chip of chipBoxes) {
    expect(chip.right).toBeLessThanOrEqual(railBox.x + railBox.width + 1);
    expect(chip.height).toBeGreaterThanOrEqual(44);
  }

  // The note is a visible textarea; Mehr is closed and offers Projekt and Markierung.
  const note = dialog.getByLabel('Notiz');
  await expect(note).toBeVisible();
  const more = dialog.locator('details.kmore');
  await expect(more).not.toHaveAttribute('open', /.*/);
  await expect(more.locator('summary')).toHaveText('Mehr ▾');
  await expect(more.locator('summary')).toHaveAccessibleName('Mehr');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open', '');
  await expect(more.getByLabel('Markierung', { exact: true })).toBeVisible();
  // The flag shortcut stays first in the head, with its old name.
  await expect(dialog.locator('.bk-head').getByRole('button').first()).toHaveAccessibleName(
    'Markierung: keine',
  );

  // Both flag controls show the same value.
  await more.getByLabel('Markierung', { exact: true }).selectOption('blue');
  await expect(dialog.getByRole('button', { name: 'Markierung: Blau' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Markierung: Blau' }).click();
  await dialog.getByRole('menuitemradio', { name: /Gelb/ }).click();
  await expect(more.getByLabel('Markierung', { exact: true })).toHaveValue('yellow');

  // Phone and desktop: no horizontal page scroll, targets of 44 px, no Axe violation.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(await dialog.locator('.bk-body').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    const small = await dialog
      .locator('button, input:not([aria-hidden="true"]), select, textarea, summary')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            name: el.getAttribute('aria-label') ?? el.textContent,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          }))
          .filter((b) => b.width < 44 || b.height < 44),
      );
    expect(small).toEqual([]);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
  }
  if (desktop(info))
    await page.screenshot({
      path: `docs/evidence/issue-583-capture-two-column/capture-${info.project.name}.png`,
    });
});

test('Mehr is open on load exactly when Markierung or Projekt is filled', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(Math.max(90_000, info.timeout));
  const post = api(request, baseURL);
  const tag = `${info.project.name}-${info.retry}`;
  const { account } = await post('/accounts', {
    name: `Mehr Muster ${tag}`,
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { project } = await post('/projects', { name: `Projekt Muster ${tag}` });
  const book = async (extra: Record<string, unknown>, day: string) =>
    (
      await post('/bookings', {
        type: 'booking',
        accountId: account.id,
        date: day,
        amountCents: -1000,
        status: 'confirmed',
        splits: [{ amountCents: -1000, categoryId: 'e2e-essen' }],
        ...extra,
      })
    )['id'] as unknown as string;
  const cases = [
    { extra: {}, day: '2026-02-01', open: false },
    { extra: { flag: 'red' }, day: '2026-02-02', open: true },
    { extra: { projectId: project.id }, day: '2026-02-03', open: true },
  ];
  for (const { extra, day, open } of cases) {
    const id = await book(extra, day);
    await page.goto(`/konten/buchungen?buchung=${id}`);
    await page
      .getByRole('button', { name: `Buchung am ${day.slice(8)}.02. bearbeiten ·`, exact: false })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
    await expect(dialog).toBeVisible();
    const more = dialog.locator('details.kmore');
    if (open) await expect(more).toHaveAttribute('open', '');
    else await expect(more).not.toHaveAttribute('open', /.*/);
  }
});
