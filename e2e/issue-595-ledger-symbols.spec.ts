import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

async function fixture(request: APIRequestContext, origin: string) {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Symbolik Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Einkauf Muster',
    class: 'need',
    kind: 'variable',
  });
  const checked = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -199,
    payeeName: 'Geprüft Muster',
    categoryId: category.id,
    status: 'confirmed',
  });
  await post(`/accounts/${account.id}/reconciliation`, {
    date: '2026-10-01',
    statementBalanceCents: 99801,
  });
  const ids: string[] = [];
  for (const [i, flag] of ['red', 'orange', 'yellow', 'green', 'blue', 'purple'].entries()) {
    const { id } = await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-02',
      amountCents: -101 - i,
      payeeName: `Form Muster ${i + 1}`,
      categoryId: category.id,
      flag,
      status: i % 2 === 0 ? 'pending' : 'confirmed',
    });
    ids.push(id);
  }
  return { account, category, ids, checkedId: checked.id };
}

test('six flags retain their saved values and undo; status shortcuts compose with existing URL filters', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const { account, category, ids, checkedId } = await fixture(request, baseURL!);
  const originalViewport = page.viewportSize()!;
  if (originalViewport.width === 390) {
    // Preserve the existing unfiltered first-viewport intention at 390x844. Each main-line
    // control must fit above the fixed navigation, rather than a sliver of an obscured row.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/konten/buchungen');
    await expect(page.locator('[data-booking]')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Filter (0)', exact: true })).toBeVisible();
    const first = page.locator('[data-booking]').first();
    const navigation = (await page.locator('.tabbar').boundingBox())!;
    const controls = [];
    for (const [name, control] of [
      ['payee', first.getByRole('button', { name: /bearbeiten/ })],
      ['amount', first.getByRole('button', { name: /Betrag ändern/ })],
      ['flag', first.locator('.kflagbtn')],
    ] as const) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(navigation.y);
      controls.push({ name, ...box });
    }
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      info.outputPath('595-first-viewport.json'),
      JSON.stringify({ viewport: page.viewportSize(), navigation, controls }, null, 2),
    );
    await page.screenshot({
      path: info.outputPath('unfiltered-first-controls-390x844.png'),
      animations: 'disabled',
    });
    await page.setViewportSize(originalViewport);
  }
  const query = new URLSearchParams({
    konto: account.id,
    kategorie: category.id,
    markierung: 'red',
    q: 'Form Muster',
    von: '2026-10-01',
    bis: '2026-10-02',
    sortierung: 'amount',
    richtung: 'asc',
  });
  await page.goto(`/konten/buchungen?${query}`);
  const rows = page.locator('[data-booking]');
  await expect(rows).toHaveCount(1);
  const pending = page.getByRole('button', { name: 'Status filtern: vorgemerkt', exact: true });
  await pending.click();
  await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/status=pending/);
  await expect(rows).toHaveCount(1);
  await expect(page.locator('.ksum')).toContainText('−1,01');
  for (const [key, value] of query) expect(new URL(page.url()).searchParams.get(key)).toBe(value);
  await page.reload();
  await expect(pending).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Status filtern: bestätigt', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('Keine Buchungen für diese Filter.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alle Status', exact: true }).click();
  await expect(rows).toHaveCount(1);
  expect(new URL(page.url()).searchParams.has('status')).toBe(false);
  for (const [key, value] of query) expect(new URL(page.url()).searchParams.get(key)).toBe(value);

  await page.goto(`/konten/buchungen?konto=${account.id}`);
  await expect(rows).toHaveCount(7);
  await page.getByRole('button', { name: 'Status filtern: geprüft', exact: true }).click();
  await expect(rows).toHaveCount(1);
  const checked = page.locator(`[data-booking="${checkedId}"]`);
  await expect(checked.getByRole('img', { name: 'geprüft', exact: true })).toBeVisible();
  await expect(checked.getByRole('button', { name: 'geprüft', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Alle Status', exact: true }).click();
  await expect(rows).toHaveCount(7);
  await expect(rows.locator('.sw')).toHaveCount(0);
  const red = page.locator(`[data-booking="${ids[0]}"]`);
  const flag = red.getByRole('button', { name: /Markierung ändern:.*aktuell Rot/ });
  await flag.click();
  await expect(page.getByRole('menuitemradio')).toHaveText([
    'Rot1',
    'Orange2',
    'Gelb3',
    'Grün4',
    'Blau5',
    'Violett6',
    'keine0',
  ]);
  await page.keyboard.press('5');
  await expect(red.getByRole('button', { name: /Markierung ändern:.*aktuell Blau/ })).toBeFocused();
  const undo = page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true });
  await undo.focus();
  expect((await (await request.get(`/api/bookings/${ids[0]}`)).json()).booking).toMatchObject({
    flag: 'blue',
    amountCents: -101,
    status: 'pending',
  });
  await undo.click();
  await expect(flag).toBeVisible();
  expect((await (await request.get(`/api/bookings/${ids[0]}`)).json()).booking).toMatchObject({
    flag: 'red',
    amountCents: -101,
    status: 'pending',
  });
  const list = await (await request.get(`/api/bookings?accountId=${account.id}`)).json();
  expect(
    list.items.reduce((sum: number, item: { amountCents: number }) => sum + item.amountCents, 0),
  ).toBe(-820);
  expect(
    (await (await request.get(`/api/accounts/${account.id}`)).json()).account.balanceCents,
  ).toBe(99180);
});

test('register symbols and reachable legend remain accessible in both themes and responsive profiles', async ({
  page,
  request,
  baseURL,
  browser,
  isolatedLedger,
}, info) => {
  test.setTimeout(90_000);
  const { account } = await fixture(request, baseURL!);
  const desktop =
    info.project.name === 'webkit-iphone'
      ? await browser.newContext({
          baseURL,
          storageState: isolatedLedger.storageState,
          viewport: { width: 1440, height: 900 },
          isMobile: false,
          hasTouch: false,
          deviceScaleFactor: 1,
          serviceWorkers: 'block',
          reducedMotion: 'reduce',
        })
      : null;
  const desktopPage = desktop ? await desktop.newPage() : null;
  const profiles: unknown[] = [];
  const inspect = async (current: Page, label: string) => {
    await current.goto(`/konten/buchungen?konto=${account.id}`);
    await expect(current.locator('[data-booking]')).toHaveCount(7);
    // With this account-filter chip, even the original controls place the phone rows below
    // the fold (595-counterfactual). Inspect the rows after scrolling; #581 retains its
    // unchanged account-register viewport/density checks.
    if (current.viewportSize()!.width === 390)
      await current.locator('[data-booking]').first().scrollIntoViewIfNeeded();
    await expect(current.locator('[data-booking]').first()).toBeInViewport();
    const profile = await current.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      coarse: matchMedia('(pointer: coarse)').matches,
      fine: matchMedia('(pointer: fine)').matches,
      maxTouchPoints: navigator.maxTouchPoints,
      dpr: devicePixelRatio,
    }));
    profiles.push({
      label,
      browser: browser.browserType().name(),
      version: browser.version(),
      ...profile,
    });
    const shapes = await current
      .locator('[data-booking] .kflag-glyph:not(.is-none)')
      .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
    expect(shapes).toHaveLength(6);
    expect(new Set(shapes).size).toBe(6);
    const summary = current.locator('.kbooking-legend > summary');
    for (const theme of ['light', 'dark']) {
      await current.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await summary.evaluate((element) => {
        element.removeAttribute('data-observed-pointer');
        element.addEventListener(
          'pointerdown',
          (event) => {
            element.setAttribute('data-observed-pointer', (event as PointerEvent).pointerType);
          },
          { once: true },
        );
      });
      if (profile.width === 390) await summary.tap();
      else await summary.click();
      expect(await summary.getAttribute('data-observed-pointer')).toBe(
        profile.width === 390 ? 'touch' : 'mouse',
      );
      await expect(current.getByRole('list', { name: 'Markierungen', exact: true })).toBeVisible();
      await expect(current.getByText('Rot · Dreieck', { exact: true })).toBeVisible();
      expect((await new AxeBuilder({ page: current }).analyze()).violations).toEqual([]);
      expect(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (current.viewportSize()!.width === 390) {
        for (const control of await current
          .locator('.kstatus-chips > button, .kflagbtn, .kbooking-legend > summary')
          .all()) {
          const box = (await control.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
      await current.evaluate(async () => {
        (document.activeElement as HTMLElement | null)?.blur();
        scrollTo(0, 0);
        await document.fonts.ready;
      });
      await expect.poll(() => current.evaluate(() => scrollY)).toBe(0);
      await current.screenshot({
        path: info.outputPath(`symbols-${label}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await summary.click();
    }
    await current.goto(`/konten/${account.id}`);
    await expect(current.locator('.ktx-account [data-booking]')).toHaveCount(7);
    await expect(current.locator('.ktx-account .sw')).toHaveCount(0);
    await expect(current.locator('.kbooking-legend > summary')).toBeVisible();
    await current.locator('.kbooking-legend > summary').focus();
    await current.keyboard.press('Enter');
    await expect(current.getByRole('list', { name: 'Buchungsstatus', exact: true })).toBeVisible();
    await current.keyboard.press('Enter');
    await expect(current.getByRole('list', { name: 'Buchungsstatus', exact: true })).toBeHidden();
    if (current.viewportSize()!.width === 1440) {
      const cell = current
        .locator('.ktx-account [data-booking]')
        .first()
        .getByRole('button', { name: /Betrag ändern/ });
      await cell.hover();
      await expect(cell).toHaveCSS('text-decoration-line', 'underline');
      await current.mouse.move(0, 0);
      await cell.focus();
      await current.keyboard.press('Tab');
      await current.keyboard.press('Shift+Tab');
      expect(await cell.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
      expect(await cell.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    }
    for (const theme of ['light', 'dark']) {
      await current.evaluate(async (value) => {
        document.documentElement.dataset['theme'] = value;
        (document.activeElement as HTMLElement | null)?.blur();
        scrollTo(0, 0);
        await document.fonts.ready;
      }, theme);
      expect((await new AxeBuilder({ page: current }).analyze()).violations).toEqual([]);
      expect(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await current.screenshot({
        path: info.outputPath(`account-${label}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  };
  try {
    await inspect(page, info.project.name);
    if (desktopPage) await inspect(desktopPage, 'webkit-desktop1440');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(info.outputPath('595-runtime-profiles.json'), JSON.stringify(profiles, null, 2));
  } finally {
    await desktop?.close();
  }
});
