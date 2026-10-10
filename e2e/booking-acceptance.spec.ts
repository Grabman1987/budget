import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test } from './isolated-ledger';
import { sampleTest } from './sample';

test.use({ ledgerToday: '2026-10-09' });

async function evidence(page: Page, info: TestInfo, name: string, scope: Locator) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const file = info.outputPath(`${name}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        sha,
        worktreeChanges: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
        viewport: page.viewportSize(),
        reducedMotion: await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
        theme: name,
        browser: info.project.use.browserName ?? 'chromium',
        aria: await scope.ariaSnapshot(),
      },
      null,
      2,
    ),
  );
  await info.attach(name, { path: file, contentType: 'application/json' });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: !name.startsWith('booking'),
  });
}

test('German date, arithmetic, defaults, height and visible save persist exact cents', async ({
  page,
  request,
  baseURL,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Kasse Muster',
    type: 'cash',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Bedarf Muster',
    kind: 'variable',
    class: 'need',
  });
  const { payee } = await post('/payees', { name: 'Laden Muster', defaultCategoryId: category.id });
  await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    payeeId: payee.id,
    date: '2026-10-01',
    amountCents: -321,
  });
  await page.goto('/?panel=buchung');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  const date = dialog.getByLabel('Datum', { exact: true });
  const save = dialog.getByRole('button', { name: 'Speichern', exact: true });
  await expect(amount).toBeFocused();
  await expect(date).toHaveValue('09.10.2026');
  await amount.fill('1.234,56+0,01');
  await amount.press('Enter');
  await expect(amount).toHaveValue('1.234,57');
  const receiver = dialog.getByLabel('Empfänger', { exact: true });
  await expect(receiver).toBeFocused();
  await receiver.fill('Laden Mus');
  await expect(
    dialog.getByRole('option', { name: 'Laden Muster Bedarf Muster', exact: true }),
  ).toBeVisible();
  await receiver.press('Enter');
  await expect(dialog.getByLabel('Bezahlt von', { exact: true })).toHaveValue(account.id);
  await expect(dialog.getByLabel('Kategorie', { exact: true })).toHaveValue(category.name);
  await expect(dialog.getByRole('button', { name: 'bestätigt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('button', { name: 'Gestern', exact: true }).click();
  await expect(date).toHaveValue('08.10.2026');
  await dialog.getByRole('button', { name: 'Heute', exact: true }).click();
  await expect(date).toHaveValue('09.10.2026');
  await dialog.getByRole('button', { name: 'Datum…', exact: true }).click();
  await expect(date).toBeFocused();
  await date.fill('07.10.2026');
  await date.press('Tab');
  await expect(dialog.getByLabel('Budgetmonat')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    await expect(save).toBeInViewport({ ratio: 1 });
    // A default category adds Available and suggestion rows; Mehr remains in the body scroller.
    await dialog.locator('summary').scrollIntoViewIfNeeded();
    await expect(dialog.locator('summary')).toBeInViewport({ ratio: 1 });
    await expect(save).toBeInViewport({ ratio: 1 });
    await dialog.locator('.bk-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(amount).toBeInViewport({ ratio: 1 });
    await expect(date).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    if (info.project.name === 'mobile') {
      expect(box!.height).toBeLessThanOrEqual(844 * 0.88 + 1);
      const small = await dialog.locator('button, input, select, summary').evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            name: el.getAttribute('aria-label') ?? el.textContent,
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          }))
          .filter((box) => box.width < 44 || box.height < 44),
      );
      expect(small).toEqual([]);
    }
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    await evidence(page, info, `booking-${theme}`, dialog);
  }
  // Expanded content scrolls inside the sheet; the save action stays visible.
  await dialog.locator('summary').click();
  await dialog.getByLabel('Notiz').fill('Synthetische Abnahme');
  await expect(save).toBeInViewport({ ratio: 1 });
  await evidence(page, info, 'booking-dark-expanded', dialog);
  await save.click();
  await expect(dialog).toBeHidden();
  const bookings = (await (await request.get('/api/bookings')).json()).items;
  const saved = bookings.filter((b: { memo: string }) => b.memo === 'Synthetische Abnahme');
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    date: '2026-10-07',
    amountCents: -123457,
    accountId: account.id,
    payeeId: payee.id,
    status: 'confirmed',
  });
  expect(saved[0].splits).toEqual([
    expect.objectContaining({ categoryId: category.id, amountCents: -123457 }),
  ]);
});

test('keyboard reaches labelled controls, traps focus, cancels and returns to opener', async ({
  page,
  request,
  baseURL,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  const response = await request.post('/api/accounts', {
    headers: { origin: baseURL! },
    data: { name: 'Kasse Muster', type: 'cash', openingDate: '2026-01-01', openingBalanceCents: 0 },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto('/');
  const opener = page
    .getByRole('link', { name: /^(Buchung|Buchung erfassen)$/ })
    .filter({ visible: true });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Buchung erfassen' });
  const amount = dialog.getByLabel('Betrag', { exact: true });
  await expect(amount).toBeFocused();
  await amount.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  await expect(amount).toBeFocused();
  await amount.fill('12,34');
  await amount.press('Tab');
  await expect(dialog.getByLabel('Empfänger', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Bezahlt von', { exact: true })).toBeFocused();
  for (const name of ['Heute', 'Gestern', 'Datum…']) {
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Datum', { exact: true })).toBeFocused();
  for (const name of ['vorgemerkt', 'bestätigt']) {
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Kategorie', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('summary')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Aufteilen' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Wiederholen')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Notiz')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Auslage für Kontakt')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Speichern und neu' })).toBeFocused();
  const save = dialog.getByRole('button', { name: 'Speichern', exact: true });
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'Markierung: keine', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Tab');
  for (const name of ['Ausgabe', 'Einnahme', 'Umbuchung', 'Schließen']) {
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(amount).toBeFocused();
  const motion = await dialog.evaluate((el) =>
    [el, ...el.querySelectorAll('*')].flatMap((node) => {
      const style = getComputedStyle(node);
      return [style.animationDuration, style.transitionDuration]
        .flatMap((value) => value.split(',').map(parseFloat))
        .filter((seconds) => seconds > 0.000011);
    }),
  );
  expect(motion).toEqual([]);
  expect(
    await dialog.evaluate(
      (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    ),
  ).toBe(0);
  await amount.press('Escape');
  const ask = dialog.getByRole('alertdialog', { name: 'Eingaben verwerfen?' });
  await expect(ask).toBeVisible();
  const keep = ask.getByRole('button', { name: 'Weiter bearbeiten' });
  await expect(keep).toBeFocused();
  await keep.press('Shift+Tab');
  await expect(ask.getByRole('button', { name: 'Verwerfen', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keep).toBeFocused();
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await evidence(page, info, 'booking-discard-focus', dialog);
  await keep.press('Enter');
  await expect(ask).toBeHidden();
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue('12,34');
  await amount.press('Escape');
  await expect(keep).toBeFocused();
  await keep.press('Tab');
  const discard = ask.getByRole('button', { name: 'Verwerfen', exact: true });
  await expect(discard).toBeFocused();
  await discard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect((await (await request.get('/api/bookings')).json()).items).toEqual([]);
});

sampleTest(
  'dark Heute text and chart status remain readable without colour alone',
  async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/');
    const chart = page.getByTestId('heute-balance-chart');
    await expect(chart).toBeVisible();
    const inspection = chart.locator('..');
    await inspection.focus();
    for (let i = 0; i < 40; i++) await inspection.press('ArrowRight');
    await expect(page.locator('.chart-tooltip')).toContainText('Prognose');
    await expect(page.locator('main .l-actual').first()).toHaveCSS('stroke-dasharray', 'none');
    await expect(page.locator('main .l-forecast').first()).toHaveCSS(
      'stroke-dasharray',
      '7px, 5px',
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await evidence(page, info, 'heute-dark', page.locator('main'));
  },
);
