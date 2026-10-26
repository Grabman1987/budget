import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as contactDuration } from 'node:timers/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-02' });
const MONTH = '2026-10';
async function seed(page: Page, origin: string) {
  const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
    const response = await page.request.fetch(`/api${path}`, { method, data, headers: { origin } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Synthetic selection cash',
    type: 'checking',
    openingDate: `${MONTH}-01`,
    openingBalanceCents: 0,
  });
  await send('POST', '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: `${MONTH}-01`,
    amountCents: 10000,
    incomeTypeId: 'income-salary',
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Mustergruppe' });
  const categoryIds: string[] = [];
  for (const [name, amountCents] of [
    ['Erster Posten', 4000],
    ['Zweiter Posten', 6000],
  ] as const) {
    const { category } = await send('POST', '/categories', {
      name,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 2,
      target: { validFrom: MONTH, target: { kind: 'monthly', amountCents } },
    });
    categoryIds.push(category.id);
  }
  return { accountId: account.id as string, categoryIds };
}
async function budget(page: Page) {
  const response = await page.request.get(`/api/budget/${MONTH}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{
    summary: {
      toBeAssignedCents: number;
      envelopes: { categoryId: string; assignedCents: number }[];
    };
  }>;
}
async function accounts(page: Page) {
  const response = await page.request.get('/api/accounts');
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ accounts: { id: string; balanceCents: number }[] }>;
}
const nameButton = (page: Page, id: string) => page.locator(`.pname[data-category-id="${id}"]`);
const selectionBar = (page: Page) => page.getByRole('region', { name: 'Kategorienauswahl' });
async function enter(page: Page) {
  const menu = page.locator('.plan-menu summary', { hasText: 'Optionen' });
  await menu.focus();
  await page.keyboard.press('Enter');
  const entry = page.getByRole('button', { name: 'Auswählen', exact: true });
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(selectionBar(page)).toBeVisible();
}
async function setTheme(page: Page, theme: 'dark' | 'light') {
  if (page.viewportSize()!.width < 768) {
    const summary = page.locator('.m-profile > summary');
    await summary.tap();
    await page
      .locator('.m-profile')
      .getByRole('button', {
        name: theme === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
        exact: true,
      })
      .tap();
    await summary.tap();
  } else {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme)
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(
    nameButton(page, (await page.locator('.pname').first().getAttribute('data-category-id'))!),
  ).toHaveCSS('color', theme === 'dark' ? 'rgb(238, 246, 252)' : 'rgb(11, 27, 51)');
}
/** Retain complete role/control/tick unions for separate parent/category pairs. */
async function assertCompactBands(page: Page, phone: boolean, info: TestInfo, stage: string) {
  const bands = await page.locator('.ptable-zero .pgroup:not(.psingle)').evaluateAll((rows) =>
    rows.map((row) => {
      const child = row.nextElementSibling!;
      if (!child.matches('.prow:not(.psingle)')) throw new Error('Missing separate first category');
      const boxes = (selector: string, scope: Element = child) =>
        [...scope.querySelectorAll(selector)]
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
      const category = boxes(
        '.col-name > .plan-select, .pname, .spending-status, .spending-bar, .col-assign, .col-act, .col-avail',
      );
      const parent = boxes('.group-heading, .col-num', row);
      const controls = boxes(
        '.col-assign :is(button,input,label), .col-avail :is(button,input,label), .spending-bar .pbar-tick',
      );
      const parentControls = boxes('.group-heading :is(button,input,label)', row);
      const height = (rects: DOMRect[]) =>
        Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top));
      const endpoints = (rects: DOMRect[]) =>
        rects.map((rect) => ({
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }));
      return {
        rowId: row.id,
        categoryEndpoints: endpoints(category),
        parentEndpoints: endpoints(parent),
        financialAndTickEndpoints: endpoints(controls),
        parentControlEndpoints: endpoints(parentControls),
        categoryCount: category.length,
        parentCount: parent.length,
        categoryHeight: height([...category, ...controls]),
        parentHeight: height([...parent, ...parentControls]),
        wholeHeight: child.getBoundingClientRect().bottom - row.getBoundingClientRect().top,
        parentBottom: row.getBoundingClientRect().bottom,
        childTop: child.getBoundingClientRect().top,
      };
    }),
  );
  const selectionControls = await page
    .locator('.ptable .pname, .ptable .plan-select-toggle')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            role: element.classList.contains('pname') ? 'category' : 'group-or-all',
            label: element.getAttribute('aria-label'),
            pressed: element.getAttribute('aria-pressed'),
            categoryId: element.getAttribute('data-category-id'),
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((rect) => rect.width > 0 && rect.height > 0),
    );
  // Persist actual role/control inventories before any count or size assertion can fail.
  await writeFile(
    info.outputPath(`band-inventory-${stage}.json`),
    JSON.stringify(
      {
        stage,
        phone,
        viewport: page.viewportSize(),
        bands,
        selectionControls,
      },
      null,
      2,
    ),
  );
  if (phone) {
    expect(
      selectionControls.filter((control) => control.role === 'category').length,
    ).toBeGreaterThan(0);
    expect(
      selectionControls.filter((control) => control.role === 'group-or-all').length,
    ).toBeGreaterThan(0);
    for (const control of selectionControls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(bands).toHaveLength(1);
  await expect(page.locator('.ptable-zero .prow:not(.is-empty)')).toHaveCount(2);
  await expect(page.locator('.ptable-zero .psingle')).toHaveCount(0);
  for (const band of bands) {
    // Phone loses exactly its category checkbox; financial/status/bar roles remain required.
    expect(band.categoryCount).toBe(phone ? 5 : 7);
    expect(band.parentCount).toBe(4);
    expect(band.parentBottom).toBeLessThanOrEqual(band.childTop);
    expect(band.categoryHeight).toBeGreaterThan(0);
    expect(band.parentHeight).toBeGreaterThan(0);
    expect(band.categoryHeight).toBeLessThanOrEqual(phone ? 76 : 40);
    expect(band.parentHeight).toBeLessThanOrEqual(phone ? 76 : 36);
    expect(band.wholeHeight).toBeLessThanOrEqual(phone ? 152 : 76);
  }
}
async function assertPhoneSelectionTargets(page: Page) {
  const controls = await page
    .locator('.ptable .pname, .ptable .plan-select-toggle')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
        .filter((rect) => rect.width > 0 && rect.height > 0),
    );
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
}
async function assertBarGeometry(page: Page) {
  const result = await selectionBar(page).evaluate((bar) => {
    const rect = (element: Element | null) => {
      if (!element) throw new Error('Required overlay missing');
      const r = element.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const targets = Array.from(bar.querySelectorAll('button, a'), rect);
    return {
      bar: rect(bar),
      fab: rect(document.querySelector('.fab')),
      tabbar: rect(document.querySelector('.tabbar')),
      targets,
      width: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(result.documentWidth).toBeLessThanOrEqual(result.width);
  expect(result.bar.left).toBeGreaterThanOrEqual(0);
  expect(result.bar.right).toBeLessThanOrEqual(result.width);
  expect(result.bar.top).toBeGreaterThanOrEqual(0);
  const intersects = (a: typeof result.bar, b: typeof result.bar) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  expect(intersects(result.bar, result.fab)).toBe(false);
  expect(intersects(result.bar, result.tabbar)).toBe(false);
  expect(result.targets.length).toBeGreaterThan(0);
  for (const target of result.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  return result;
}

// Public taps/keyboard and the pinned-engine native contact case below are distinct proofs.
// Contact movement is not evidence of OS scrolling; that physical-device gate stays explicit.
test('phone mode preserves category/group/all identity and read-only exit; desktop checkboxes remain', async ({
  page,
  baseURL,
}, info) => {
  const fixture = await seed(page, baseURL!);
  await page.addInitScript(() => localStorage.setItem('budget-theme', 'light'));
  await page.goto(`/plan/monat?monat=${MONTH}`);
  const [firstId, secondId] = fixture.categoryIds as [string, string];
  await expect(nameButton(page, firstId)).toBeVisible();
  const before = await budget(page);
  const beforeAccounts = await accounts(page);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      /\/api\/(budget|bookings|categories|undo)/.test(request.url())
    )
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
  });
  const phone = page.viewportSize()!.width < 768;
  if (phone) {
    await expect(page.locator('.ptable input[type="checkbox"]:visible')).toHaveCount(0);
    await nameButton(page, firstId).tap();
    await expect(selectionBar(page)).toHaveCount(0);
    await page
      .getByRole('complementary', { name: 'Plan-Inspektor' })
      .getByRole('button', { name: 'Auswahl aufheben' })
      .click();
    await enter(page);
    await nameButton(page, firstId).focus();
    await page.keyboard.press('Space');
    await expect(nameButton(page, firstId)).toHaveAttribute('aria-pressed', 'true');
    const group = page.getByRole('button', { name: /^Gruppe Mustergruppe auswählen · \d+\/\d+$/ });
    await expect(group).toHaveAttribute('aria-pressed', 'mixed');
    await nameButton(page, secondId).tap();
    await expect(group).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Gruppe Mustergruppe', exact: true }).tap();
    await expect(nameButton(page, firstId)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Gruppe Mustergruppe auswählen · \d+\/\d+$/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Gruppe Mustergruppe', exact: true }).tap();
    await expect(nameButton(page, firstId)).toHaveAttribute('aria-pressed', 'true');
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await assertBarGeometry(page);
      await assertPhoneSelectionTargets(page);
      await assertCompactBands(page, true, info, `phone-${theme}`);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`selection-${page.viewportSize()!.width}-${theme}.png`),
        fullPage: false,
      });
    }
    const all = page.getByRole('button', { name: /^Alle Kategorien auswählen · \d+\/\d+$/ });
    await all.tap();
    await expect(nameButton(page, firstId)).toHaveAttribute('aria-pressed', 'false');
    await expect(nameButton(page, secondId)).toHaveAttribute('aria-pressed', 'false');
    await expect(selectionBar(page)).toBeVisible();
    await nameButton(page, secondId).tap();
    await selectionBar(page).getByRole('button', { name: 'Auswahl beenden', exact: true }).click();
    await expect(selectionBar(page)).toHaveCount(0);
    await expect(nameButton(page, secondId)).toBeFocused();
    await expect(nameButton(page, secondId)).toHaveAttribute('aria-pressed', 'false');
  } else {
    const first = page.getByRole('checkbox', { name: 'Erster Posten auswählen', exact: true });
    await first.check();
    await expect(first).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Gruppe Mustergruppe auswählen', exact: true }),
    ).toHaveJSProperty('indeterminate', true);
    await expect(selectionBar(page)).toHaveCount(0);
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      await assertCompactBands(page, false, info, `desktop-${theme}`);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`selection-1440-${theme}.png`),
        fullPage: false,
      });
    }
  }
  expect(writes).toEqual([]);
  expect(await budget(page)).toEqual(before);
  expect(await accounts(page)).toEqual(beforeAccounts);
});

test('existing Ziel writes literal4000/6000 cents with one actual undo to0/0 and TBA10000', async ({
  page,
  baseURL,
}) => {
  const { accountId, categoryIds } = await seed(page, baseURL!);
  await page.goto(`/plan/monat?monat=${MONTH}`);
  await expect(nameButton(page, categoryIds[0]!)).toBeVisible();
  const phone = page.viewportSize()!.width < 768;
  expect((await budget(page)).summary.toBeAssignedCents).toBe(10000);
  if (phone) {
    await enter(page);
    await nameButton(page, categoryIds[0]!).tap();
    await nameButton(page, categoryIds[1]!).tap();
    await selectionBar(page).getByRole('button', { name: 'Ziel', exact: true }).tap();
  } else {
    await page.getByRole('checkbox', { name: 'Erster Posten auswählen', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Zweiter Posten auswählen', exact: true }).check();
    await page.locator('.plan-menu-verteilen summary').click();
    await page
      .locator('.plan-menu-verteilen')
      .getByRole('button', { name: 'Ziel', exact: true })
      .click();
  }
  await expect(page.getByTestId('to-be-assigned')).toHaveText('0,00 €');
  const assigned = (view: Awaited<ReturnType<typeof budget>>) =>
    categoryIds.map(
      (id) => view.summary.envelopes.find((row) => row.categoryId === id)!.assignedCents,
    );
  expect(assigned(await budget(page))).toEqual([4000, 6000]);
  expect(
    (await accounts(page)).accounts.find((account) => account.id === accountId)!.balanceCents,
  ).toBe(10000);
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(page.getByTestId('to-be-assigned')).toHaveText('100,00 €');
  const undone = await budget(page);
  expect(assigned(undone)).toEqual([0, 0]);
  expect(undone.summary.toBeAssignedCents).toBe(10000);
  expect(
    (await accounts(page)).accounts.find((account) => account.id === accountId)!.balanceCents,
  ).toBe(10000);
});

test('actual390x844 shows the first category without scrolling and keeps safe bottom controls in both themes', async ({
  browser,
  isolatedLedger,
  ledgerToday,
}, info) => {
  const context = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  try {
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
    const fixture = await seed(page, isolatedLedger.origin);
    await page.addInitScript(() => localStorage.setItem('budget-theme', 'light'));
    await page.goto(`/plan/monat?monat=${MONTH}`);
    const first = nameButton(page, fixture.categoryIds[0]!);
    await expect(first).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const proofs = [];
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await expect(first).toBeInViewport({ ratio: 1 });
      const geometry = await first.evaluate((button) => {
        const name = button.getBoundingClientRect();
        const nav = document.querySelector('.tabbar')!.getBoundingClientRect();
        return {
          nameBottom: name.bottom,
          navTop: nav.top,
          documentWidth: document.documentElement.scrollWidth,
          width: innerWidth,
        };
      });
      expect(geometry.nameBottom).toBeLessThanOrEqual(geometry.navTop);
      expect(geometry.documentWidth).toBeLessThanOrEqual(390);
      await expect(page.locator('.ptable input[type="checkbox"]:visible')).toHaveCount(0);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`first-category-390x844-${theme}.png`),
        fullPage: false,
      });
      await enter(page);
      await first.tap();
      const barGeometry = await assertBarGeometry(page);
      await assertPhoneSelectionTargets(page);
      await assertCompactBands(page, true, info, `manual390-${theme}`);
      proofs.push({
        theme,
        geometry,
        barGeometry,
        ...(await page.evaluate(() => ({
          viewport: { width: innerWidth, height: innerHeight },
          dpr: devicePixelRatio,
          coarse: matchMedia('(pointer: coarse)').matches,
          touchPoints: navigator.maxTouchPoints,
        }))),
      });
      await selectionBar(page).getByRole('button', { name: 'Auswahl beenden', exact: true }).tap();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    }
    await writeFile(info.outputPath('phone390x844-profile.json'), JSON.stringify(proofs, null, 2));
  } finally {
    await context.close();
  }
});

/** Fail closed on another driver/engine: WebKit contact lists differ from Chromium CDP. */
async function nativeContacts(page: Page) {
  const browser = page.context().browser();
  if (!browser) throw new Error('Native input requires the actual local browser');
  const require = createRequire(join(process.cwd(), 'package.json'));
  const core = dirname(require.resolve('playwright-core/package.json'));
  const packageInfo = JSON.parse(await readFile(join(core, 'package.json'), 'utf8')) as {
    version: string;
  };
  expect(packageInfo.version).toBe('1.64.1');
  const engine = browser.browserType().name();
  const descriptors = JSON.parse(await readFile(join(core, 'browsers.json'), 'utf8')) as {
    browsers: { name: string; revision: string; browserVersion?: string }[];
  };
  const descriptor = descriptors.browsers.find((candidate) => candidate.name === engine);
  expect(browser.version()).toBe(descriptor?.browserVersion);
  if (engine === 'chromium') {
    const session = await page.context().newCDPSession(page);
    return {
      engine,
      async send(
        type: 'start' | 'move' | 'end' | 'cancel',
        point: { id: number; x: number; y: number },
      ) {
        await session.send('Input.dispatchTouchEvent', {
          type: (
            {
              start: 'touchStart',
              move: 'touchMove',
              end: 'touchEnd',
              cancel: 'touchCancel',
            } as const
          )[type],
          touchPoints: type === 'end' || type === 'cancel' ? [] : [point],
        });
      },
      close: () => session.detach(),
    };
  }
  if (engine !== 'webkit') throw new Error('No audited native contact adapter for this engine');
  expect(descriptor?.revision).toBe('2370');
  expect(descriptor?.browserVersion).toBe('27.2');
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect(digest(await readFile(join(core, 'lib/coreBundle.js')))).toBe(
    '829521b67ed7be90c7d6d6098ff39f2241562d47e4ad7ccab13710924a56001d',
  );
  expect(
    digest(await readFile(join(dirname(browser.browserType().executablePath()), 'protocol.json'))),
  ).toBe('fd820746f64ef8696d81a65a559fef8a6e0a7fd2a4e83a503b859130c11a7510');
  type ContactSession = {
    send: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  };
  const bridge = page as Page & {
    _connection?: {
      toImpl?: (value: Page) => { delegate?: { _pageProxySession?: ContactSession } };
    };
  };
  const session = bridge._connection?.toImpl?.(page)?.delegate?._pageProxySession;
  if (!session?.send)
    throw new Error('Audited local WebKit bridge unavailable; no synthetic fallback');
  return {
    engine,
    async send(
      type: 'start' | 'move' | 'end' | 'cancel',
      point: { id: number; x: number; y: number },
    ) {
      await session.send('Input.dispatchTouchEvent', {
        type: (
          {
            start: 'touchStart',
            move: 'touchMove',
            end: 'touchEnd',
            cancel: 'touchCancel',
          } as const
        )[type],
        modifiers: 0,
        // WebKit2370 end/cancel carries the changed contact, unlike Chromium CDP's empty list.
        touchPoints: [point],
      });
    },
    close: () => Promise.resolve(),
  };
}

test('trusted native hold/release enters selection, real cancel and movement cancel pending holds without financial writes', async ({
  browser,
  isolatedLedger,
  ledgerToday,
}, info) => {
  const context = await browser.newContext({
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  let contacts: Awaited<ReturnType<typeof nativeContacts>> | undefined;
  let pageForProof: Page | undefined;
  let observedEventCount = 0;
  const events: {
    type: string;
    trusted: boolean;
    pointerType: string | null;
    pointerId: number | null;
    time: number;
    category: string | null;
    targetKind: string;
    targetTag: string | null;
    coordinates: { x: number; y: number } | null;
    changedTouches: { id: number; x: number; y: number }[];
    origin: {
      category: string | null;
      connected: boolean;
      currentQueryIdentity: boolean;
      hasCapture: boolean;
      targetIsOriginalCategory: boolean;
      targetIsExactOverlay: boolean;
      overlayUnderPoint: boolean;
    };
  }[] = [];
  const protocolAcknowledgments: {
    type: string;
    point: { id: number; x: number; y: number };
    acknowledged: boolean;
    durationMs: number;
    errorName?: string;
  }[] = [];
  const geometrySnapshots: {
    stage: string;
    point: { id: number; x: number; y: number };
    observation?: unknown;
    errorName?: string;
  }[] = [];
  const writes: string[] = [];
  const captureGeometry = async (stage: string, point: { id: number; x: number; y: number }) => {
    try {
      if (!pageForProof) return;
      const observation = await pageForProof.evaluate(({ x, y }) => {
        const bounds = (element: Element | null) => {
          if (!element) return null;
          const r = element.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const scrolling = document.scrollingElement;
        const grid = document.querySelector('.plan-grid');
        return {
          viewport: { width: innerWidth, height: innerHeight },
          scrollingElement: scrolling
            ? {
                tag: scrolling.tagName,
                top: scrolling.scrollTop,
                height: scrolling.clientHeight,
                scrollHeight: scrolling.scrollHeight,
              }
            : null,
          documentWidth: document.documentElement.scrollWidth,
          grid: bounds(grid),
          gridPaddingBottom: grid ? getComputedStyle(grid).paddingBottom : null,
          bar: bounds(document.querySelector('.plan-selection-bar')),
          topbar: bounds(document.querySelector('.plan-topbar')),
          nav: bounds(document.querySelector('.tabbar')),
          fab: bounds(document.querySelector('.fab')),
          hitStack: document
            .elementsFromPoint(x, y)
            .slice(0, 6)
            .map((element) => ({
              tag: element.tagName,
              kind: element.closest('.pname')
                ? 'category'
                : element.closest('.plan-selection-bar')
                  ? 'selection-bar'
                  : element.closest('.tabbar')
                    ? 'navigation'
                    : element.closest('.plan-topbar')
                      ? 'plan-topbar'
                      : 'other',
              category: element.closest<HTMLElement>('.pname')?.dataset['categoryId'] ?? null,
            })),
        };
      }, point);
      geometrySnapshots.push({ stage, point, observation });
    } catch (error) {
      geometrySnapshots.push({
        stage,
        point,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  };
  const sendContact = async (
    type: 'start' | 'move' | 'end' | 'cancel',
    point: { id: number; x: number; y: number },
  ) => {
    await captureGeometry(`before-${type}`, point);
    const started = performance.now();
    try {
      if (!contacts) throw new Error('Missing native contact driver');
      await contacts.send(type, point);
      protocolAcknowledgments.push({
        type,
        point,
        acknowledged: true,
        durationMs: performance.now() - started,
      });
    } catch (error) {
      protocolAcknowledgments.push({
        type,
        point,
        acknowledged: false,
        durationMs: performance.now() - started,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
    await captureGeometry(`after-${type}`, point);
  };
  try {
    const page = await context.newPage();
    pageForProof = page;
    await page.clock.setFixedTime(new Date(`${ledgerToday}T12:00:00+02:00`));
    const fixture = await seed(page, isolatedLedger.origin);
    await page.goto(`/plan/monat?monat=${MONTH}`);
    const first = nameButton(page, fixture.categoryIds[0]!);
    await expect(first).toBeVisible();
    const before = await budget(page);
    const beforeAccounts = await accounts(page);
    await page.exposeFunction('record590Contact', (event: (typeof events)[number]) => {
      observedEventCount += 1;
      if (events.length < 128) events.push(event);
    });
    await page.evaluate((categoryId) => {
      const selector = `.pname[data-category-id="${CSS.escape(categoryId)}"]`;
      const original = document.querySelector<HTMLButtonElement>(selector);
      if (!original) throw new Error('Original category button unavailable');
      for (const type of [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'gotpointercapture',
        'lostpointercapture',
        'click',
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel',
        'contextmenu',
      ])
        document.addEventListener(
          type,
          (event) => {
            const element = event.target instanceof Element ? event.target : null;
            const category = element?.closest<HTMLElement>('.pname');
            const changedTouches =
              'changedTouches' in event
                ? [...(event as TouchEvent).changedTouches]
                    .slice(0, 2)
                    .map((touch) => ({ id: touch.identifier, x: touch.clientX, y: touch.clientY }))
                : [];
            const coordinates =
              'clientX' in event
                ? { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }
                : changedTouches[0]
                  ? { x: changedTouches[0].x, y: changedTouches[0].y }
                  : null;
            void (
              window as Window & { record590Contact: (value: unknown) => Promise<void> }
            ).record590Contact({
              type,
              trusted: event.isTrusted,
              pointerType: 'pointerType' in event ? event.pointerType : null,
              pointerId: 'pointerId' in event ? event.pointerId : null,
              time: event.timeStamp,
              category: category?.dataset['categoryId'] ?? null,
              targetKind: category
                ? 'category'
                : element?.closest('.plan-selection-bar')
                  ? 'selection-bar'
                  : element?.closest('.tabbar')
                    ? 'navigation'
                    : element?.closest('.plan-topbar')
                      ? 'plan-topbar'
                      : 'other',
              targetTag: element?.tagName ?? null,
              coordinates,
              changedTouches,
              origin: {
                category: original.dataset['categoryId'] ?? null,
                connected: original.isConnected,
                currentQueryIdentity: document.querySelector(selector) === original,
                hasCapture:
                  'pointerId' in event && typeof event.pointerId === 'number'
                    ? original.hasPointerCapture(event.pointerId)
                    : false,
                targetIsOriginalCategory: element !== null && original.contains(element),
                targetIsExactOverlay:
                  element !== null && element === document.querySelector('.plan-selection-bar'),
                overlayUnderPoint:
                  element !== null &&
                  element.isConnected &&
                  coordinates !== null &&
                  element === document.querySelector('.plan-selection-bar') &&
                  document.elementFromPoint(coordinates.x, coordinates.y) === element &&
                  (() => {
                    const r = element.getBoundingClientRect();
                    return (
                      r.width > 0 &&
                      r.height > 0 &&
                      coordinates.x >= r.left &&
                      coordinates.x <= r.right &&
                      coordinates.y >= r.top &&
                      coordinates.y <= r.bottom
                    );
                  })(),
              },
            });
          },
          { passive: true, capture: true },
        );
    }, fixture.categoryIds[0]!);
    page.on('request', (request) => {
      if (
        request.method() !== 'GET' &&
        /\/api\/(budget|bookings|categories|undo)/.test(request.url())
      )
        writes.push(request.method() + ' ' + new URL(request.url()).pathname);
    });
    contacts = await nativeContacts(page);
    const pointForFirst = async () => {
      await expect(first).toBeInViewport({ ratio: 1 });
      const bounds = await first.boundingBox();
      expect(bounds).not.toBeNull();
      return {
        id: 1,
        x: Math.floor(bounds!.x + bounds!.width / 2),
        y: Math.floor(bounds!.y + bounds!.height / 2),
      };
    };
    let point = await pointForFirst();
    await sendContact('start', point);
    await contactDuration(600); // Actual contact duration, not an added expectation timeout.
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await sendContact('end', point);
    await expect(selectionBar(page)).toBeVisible();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() =>
        events.some(
          (event) => event.type === 'pointerup' && event.trusted && event.pointerType === 'touch',
        ),
      )
      .toBe(true);
    const down = events.find(
      (event) => event.type === 'pointerdown' && event.trusted && event.pointerType === 'touch',
    );
    const up = events.find(
      (event) => event.type === 'pointerup' && event.trusted && event.pointerType === 'touch',
    );
    expect(down?.category).toBe(fixture.categoryIds[0]);
    expect(up?.pointerId).toBe(down?.pointerId);
    // The pinned private WebKit input path hit-tests pointerup even while capture is active.
    // Preserve gesture identity using the original live object and native touchend instead.
    expect(up?.pointerType).toBe('touch');
    expect(up?.origin.category).toBe(down?.category);
    expect(up?.origin.connected).toBe(true);
    expect(up?.origin.currentQueryIdentity).toBe(true);
    expect(up?.origin.hasCapture).toBe(true);
    expect(up?.coordinates).toEqual({ x: point.x, y: point.y });
    expect(
      (up?.origin.targetIsOriginalCategory && up.category === down?.category) ||
        (up?.origin.targetIsExactOverlay && up.origin.overlayUnderPoint),
    ).toBe(true);
    await expect
      .poll(
        () =>
          events.some((event) => event.type === 'touchend' && event.trusted) &&
          events.some((event) => event.type === 'lostpointercapture' && event.trusted),
      )
      .toBe(true);
    const touchStart = events.find((event) => event.type === 'touchstart' && event.trusted);
    const touchEnd = events.find((event) => event.type === 'touchend' && event.trusted);
    expect(touchStart?.category).toBe(down?.category);
    expect(touchStart?.changedTouches).toEqual([{ id: point.id, x: point.x, y: point.y }]);
    expect(touchEnd?.category).toBe(down?.category);
    expect(touchEnd?.origin.targetIsOriginalCategory).toBe(true);
    expect(touchEnd?.origin.connected).toBe(true);
    expect(touchEnd?.origin.currentQueryIdentity).toBe(true);
    expect(touchEnd?.changedTouches).toEqual(touchStart?.changedTouches);
    const gotIndex = events.findIndex(
      (event) =>
        event.type === 'gotpointercapture' &&
        event.trusted &&
        event.pointerType === 'touch' &&
        event.pointerId === down?.pointerId &&
        event.category === down?.category &&
        event.origin.targetIsOriginalCategory &&
        event.origin.connected &&
        event.origin.currentQueryIdentity &&
        event.origin.hasCapture,
    );
    const upIndex = events.indexOf(up!);
    const lostIndex = events.findIndex(
      (event) =>
        event.type === 'lostpointercapture' &&
        event.trusted &&
        event.pointerType === 'touch' &&
        event.pointerId === down?.pointerId &&
        event.category === down?.category &&
        event.origin.targetIsOriginalCategory,
    );
    expect(gotIndex).toBeGreaterThanOrEqual(0);
    expect(upIndex).toBeGreaterThan(gotIndex);
    expect(lostIndex).toBeGreaterThan(upIndex);
    expect(up!.time - down!.time).toBeGreaterThanOrEqual(500);
    await selectionBar(page).getByRole('button', { name: 'Auswahl beenden', exact: true }).tap();
    await expect(selectionBar(page)).toHaveCount(0);
    point = await pointForFirst();
    await sendContact('start', point);
    await sendContact('cancel', point);
    await contactDuration(600);
    await expect(selectionBar(page)).toHaveCount(0);
    await expect
      .poll(() =>
        events.some(
          (event) =>
            event.type === 'pointercancel' && event.trusted && event.pointerType === 'touch',
        ),
      )
      .toBe(true);
    point = await pointForFirst();
    await sendContact('start', point);
    await sendContact('move', { ...point, x: point.x + 20 });
    await sendContact('end', { ...point, x: point.x + 20 });
    await contactDuration(600);
    await expect(selectionBar(page)).toHaveCount(0);
    await expect
      .poll(() =>
        events.some(
          (event) => event.type === 'pointermove' && event.trusted && event.pointerType === 'touch',
        ),
      )
      .toBe(true);
    expect(writes).toEqual([]);
    expect(await budget(page)).toEqual(before);
    expect(await accounts(page)).toEqual(beforeAccounts);
    await writeFile(
      info.outputPath('native-hold-release-cancel.json'),
      JSON.stringify(
        {
          engine: contacts.engine,
          events,
          qualification:
            'Trusted engine contact hold/release, explicit cancel and move threshold only; no OS-scroll or physical-device proof.',
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await writeFile(
        info.outputPath('native-contact-partial.json'),
        JSON.stringify(
          {
            scope:
              'Pinned-protocol gesture identity: trusted up/id/duration plus original connected captured button, exact overlay hit or original target, original touchend; cancel/move/no-write assertions remain required.',
            engine: contacts?.engine ?? null,
            project: info.project.name,
            viewport: pageForProof?.viewportSize() ?? null,
            observedEventCount,
            droppedEventCount: Math.max(0, observedEventCount - events.length),
            events,
            protocolAcknowledgments,
            geometrySnapshots,
            observedFinancialWrites: writes,
            qualification:
              'Missing observations never waive required input. Protocol acknowledgments are not DOM release/cancel proof; no physical-device or OS-scroll claim.',
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.info(
        '590 partial diagnostic write failed:',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
    try {
      await contacts?.close();
    } finally {
      await context.close();
    }
  }
});
