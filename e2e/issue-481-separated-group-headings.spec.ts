import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { STORAGE_STATE_SAMPLE } from '../playwright.config';
import { sampleTest, SAMPLE_NOW, SAMPLE_URL } from './sample';
import { test } from './isolated-ledger';

// Literal membership from the synthetic source, independent of rendered row counts.
const multiGroups = [
  ['Wohnen', ['miete', 'strom', 'internet', 'haushalt']],
  ['Kredite', ['kreditrate', 'sondertilgung']],
  ['Versicherungen', ['kfzvers', 'unfallvers', 'hhvers']],
  ['Abos', ['mobilfunk', 'streaming', 'cloud', 'zeitung', 'ki1', 'ki2']],
  ['Freizeit', ['fitness', 'freizeit', 'hobby']],
  ['Mobilität', ['treibstoff', 'oeffis', 'kfzservice']],
  ['Genuss', ['lieferdienste', 'essen']],
  ['Geschenke', ['weihnachten', 'geschenke']],
] as const;
const singleCategoryIds = [
  'bankspesen',
  'projektkosten',
  'lebensmittel',
  'gesundheit',
  'kleidung',
  'anschaffungen',
  'pflege',
  'reisen',
  'investieren',
  'notgroschen',
  'kartenzahlung',
];
const nameButton = (page: Page, id: string) => page.locator(`.pname[data-category-id="${id}"]`);
async function readBudget(page: Page, month: string) {
  const response = await page.request.get(`/api/budget/${month}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<BudgetMonthView>;
}
async function enterPhoneSelection(page: Page) {
  const options = page.locator('.plan-menu summary', { hasText: 'Optionen' });
  await options.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Kategorienauswahl', exact: true })).toBeVisible();
}

for (const profile of ['configured', 'desktop', 'phone-tall'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    sampleTest(
      `separated headings: literal44 rows, hierarchy and controls ${profile} ${theme}`,
      async ({ page: configuredPage, browser }, info) => {
        const context =
          profile === 'configured'
            ? null
            : await browser.newContext({
                baseURL: SAMPLE_URL,
                storageState: STORAGE_STATE_SAMPLE,
                viewport:
                  profile === 'desktop'
                    ? { width: 1440, height: 900 }
                    : { width: 390, height: 844 },
                isMobile: profile !== 'desktop',
                hasTouch: profile !== 'desktop',
                deviceScaleFactor: profile === 'desktop' ? 1 : 3,
                colorScheme: theme,
                reducedMotion: 'reduce',
              });
        const page = context ? await context.newPage() : configuredPage;
        try {
          await page.clock.setFixedTime(new Date(SAMPLE_NOW));
          const writes: string[] = [];
          page.on('request', (request) => {
            if (
              request.method() !== 'GET' &&
              /\/api\/(budget|categories|bookings|undo)/.test(request.url())
            )
              writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
          });
          await page.goto('/plan/monat?monat=2026-09');
          await page.evaluate((value) => {
            document.documentElement.dataset['theme'] = value;
          }, theme);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          const table = page.locator('.ptable-zero');
          await expect(table.locator('.pname')).toHaveCount(36);
          const before = await readBudget(page, '2026-09');
          expect(before.groups).toHaveLength(19);
          expect(before.categories.filter((category) => !category.hiddenAt)).toHaveLength(36);
          await expect(table.locator('tbody > .prow:not(.is-empty)')).toHaveCount(36);
          await expect(table.locator('tbody > .psingle')).toHaveCount(11);
          await expect(table.locator('tbody > .pgroup:not(.psingle)')).toHaveCount(8);
          await expect(table.locator('tbody > tr:not(.pgroup-gap):not(.is-empty)')).toHaveCount(44);
          await expect(table.locator('tbody > .pgroup-gap')).toHaveCount(18);
          expect(((55 - 44) * 100) / 55).toBe(20);
          await expect(table.locator('.pmulti')).toHaveCount(0);
          for (const [name, ids] of multiGroups) {
            const sourceGroup = before.groups.find((group) => group.name === name);
            expect(sourceGroup, name).toBeTruthy();
            const header = table.locator(`[id="grp-${sourceGroup!.id}"]`);
            await expect(header).not.toHaveClass(/prow|psingle/);
            await expect(
              header.locator(
                '.pname, .assign-input, .col-assign button, .col-avail button, .spending-bar',
              ),
            ).toHaveCount(0);
            await expect(
              header.getByRole('button', { name: `Gruppe ${name}`, exact: true }),
            ).toHaveAttribute('aria-expanded', 'true');
            const actualMembership = before.categories
              .filter((category) => category.groupId === sourceGroup!.id)
              .map((category) => category.id)
              .sort();
            expect(actualMembership, name).toEqual(ids.map((id) => `cat-${id}`).sort());
            const rows = [
              header,
              ...ids.map((id) => nameButton(page, `cat-${id}`).locator('xpath=ancestor::tr')),
            ];
            for (let index = 1; index < rows.length; index++) {
              expect(
                await rows[index - 1]!.evaluate(
                  (previous, next) => {
                    if (!next) throw new Error('Missing following category row');
                    return !!(
                      previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
                    );
                  },
                  await rows[index]!.elementHandle(),
                ),
                name,
              ).toBe(true);
            }
            await expect(
              header.locator('xpath=following-sibling::tr[1]').locator('.pname'),
            ).toHaveAttribute('data-category-id', `cat-${ids[0]}`);
          }
          for (const id of singleCategoryIds)
            await expect(nameButton(page, `cat-${id}`).locator('xpath=ancestor::tr')).toHaveClass(
              /psingle/,
            );
          await page.evaluate(() => document.fonts.ready);
          const geometry = await table.evaluate((element) => {
            const box = (node: Element) => {
              const r = node.getBoundingClientRect();
              return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            return {
              viewport: { width: innerWidth, height: innerHeight },
              documentWidth: document.documentElement.scrollWidth,
              dpr: devicePixelRatio,
              rawTouchPoints: navigator.maxTouchPoints,
              coarse: matchMedia('(pointer: coarse)').matches,
              parents: Array.from(
                element.querySelectorAll('tbody > .pgroup:not(.psingle)'),
                (row) => ({
                  id: row.id,
                  ...box(row),
                  first: box(row.nextElementSibling!),
                  controls: Array.from(row.querySelectorAll('button'), box),
                }),
              ),
              categories: Array.from(
                element.querySelectorAll('tbody > .prow:not(.psingle):not(.is-empty)'),
                box,
              ),
            };
          });
          await writeFile(
            info.outputPath('separated-heading-geometry.json'),
            JSON.stringify(
              {
                project: info.project.name,
                browser: browser.browserType().name(),
                projectConfiguredIsMobile: info.project.use.isMobile ?? false,
                projectConfiguredHasTouch: info.project.use.hasTouch ?? false,
                profile,
                theme,
                ...geometry,
              },
              null,
              2,
            ),
          );
          const expectedProfile =
            profile === 'configured'
              ? {
                  viewport: info.project.use.viewport,
                  dpr: info.project.use.deviceScaleFactor ?? 1,
                  coarse: info.project.use.hasTouch ?? false,
                }
              : profile === 'desktop'
                ? { viewport: { width: 1440, height: 900 }, dpr: 1, coarse: false }
                : { viewport: { width: 390, height: 844 }, dpr: 3, coarse: true };
          expect(expectedProfile.viewport).toBeTruthy();
          expect(geometry.viewport).toEqual(expectedProfile.viewport);
          expect(geometry.dpr).toBe(expectedProfile.dpr);
          expect(geometry.coarse).toBe(expectedProfile.coarse);
          // Pinned native WebKit can report zero here; this is not physical-touch proof.
          expect(geometry.rawTouchPoints).toBeGreaterThanOrEqual(0);
          expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport.width);
          expect(geometry.parents).toHaveLength(8);
          expect(geometry.categories).toHaveLength(25);
          const phone = geometry.viewport.width < 768;
          for (const parent of geometry.parents) {
            expect(parent.height, parent.id).toBeGreaterThan(0);
            expect(parent.height, parent.id).toBeLessThanOrEqual(phone ? 76 : 36);
            expect(parent.bottom, parent.id).toBeLessThanOrEqual(parent.first.top);
            expect(parent.first.bottom - parent.top, parent.id).toBeLessThanOrEqual(
              phone ? 152 : 76,
            );
            expect(parent.controls.length, parent.id).toBeGreaterThan(0);
            if (phone)
              for (const control of parent.controls) {
                expect(control.width).toBeGreaterThanOrEqual(44);
                expect(control.height).toBeGreaterThanOrEqual(44);
              }
          }
          for (const category of geometry.categories) {
            expect(category.height).toBeGreaterThan(0);
            expect(category.height).toBeLessThanOrEqual(phone ? 76 : 40);
          }
          const toggle = page.getByRole('button', { name: 'Gruppe Wohnen', exact: true });
          await toggle.focus();
          await page.keyboard.press('Enter');
          await expect(toggle).toBeFocused();
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(table.locator('.pname')).toHaveCount(32);
          await expect(table.locator('tbody > .pgroup:not(.psingle)')).toHaveCount(8);
          await page.keyboard.press('Enter');
          await expect(toggle).toBeFocused();
          await expect(table.locator('.pname')).toHaveCount(36);
          await nameButton(page, 'cat-miete').focus();
          await page.keyboard.press('Enter');
          const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
          await expect(
            inspector.getByRole('heading', { name: 'Miete', exact: true }),
          ).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(nameButton(page, 'cat-miete')).toBeFocused();
          if (phone) {
            await enterPhoneSelection(page);
            const group = page.getByRole('button', {
              name: 'Gruppe Wohnen auswählen',
              exact: true,
            });
            await group.click();
            for (const id of ['miete', 'strom', 'internet', 'haushalt'])
              await expect(nameButton(page, `cat-${id}`)).toHaveAttribute('aria-pressed', 'true');
            await expect(
              page.getByRole('button', { name: 'Alle Kategorien auswählen', exact: true }),
            ).toHaveAttribute('aria-pressed', 'mixed');
            for (const controls of [table.locator('.pname'), table.locator('.plan-select-toggle')])
              for (const control of await controls.all()) {
                const bounds = await control.boundingBox();
                expect(bounds).not.toBeNull();
                expect(bounds!.width).toBeGreaterThanOrEqual(44);
                expect(bounds!.height).toBeGreaterThanOrEqual(44);
              }
            await page
              .getByRole('region', { name: 'Kategorienauswahl', exact: true })
              .getByRole('button', { name: 'Auswahl beenden', exact: true })
              .click();
            await expect(table.locator('.pname[aria-pressed="true"]')).toHaveCount(0);
          }
          const axe = await new AxeBuilder({ page }).analyze();
          expect(axe.violations).toEqual([]);
          expect(await readBudget(page, '2026-09')).toEqual(before);
          expect(writes).toEqual([]);
          await page.screenshot({
            path: info.outputPath('separated-headings.png'),
            fullPage: true,
          });
        } finally {
          await context?.close();
        }
      },
    );
  }
}

test('real parent literals, independent first category, assignment and undo survive separation', async ({
  page,
  baseURL,
}) => {
  const month = '2026-10';
  const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
    const response = await page.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { origin: baseURL! },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await send('POST', '/accounts', {
    name: 'Synthetic separation cash',
    type: 'checking',
    openingDate: `${month}-01`,
    openingBalanceCents: 200000,
  });
  const { group } = await send('POST', '/categories/groups', { name: 'Mustergruppe' });
  const ids: string[] = [];
  for (const [name, assignedCents, amountCents] of [
    ['Erster Posten', 501, -703],
    ['Zweiter Posten', 4008, -702],
  ] as const) {
    const { category } = await send('POST', '/categories', {
      name,
      groupId: group.id,
      class: 'need',
      kind: 'variable',
      stage: 2,
    });
    ids.push(category.id);
    await send('PUT', `/budget/${month}/assigned`, {
      items: [{ categoryId: category.id, assignedCents }],
    });
    await send('POST', '/bookings', {
      type: 'booking',
      accountId: account.id,
      categoryId: category.id,
      date: `${month}-02`,
      amountCents,
    });
  }
  await page.goto(`/plan/monat?monat=${month}`);
  const first = nameButton(page, ids[0]!).locator('xpath=ancestor::tr');
  const parent = page.locator(`[id="grp-${group.id}"]`);
  await expect(parent).not.toHaveClass(/prow/);
  await expect(parent.locator('.pname, .col-assign button, .col-avail button')).toHaveCount(0);
  await expect(parent.locator('.col-assign')).toHaveText('45,09 €');
  await expect(parent.locator('.col-act')).toHaveText('−14,05 €');
  await expect(parent.locator('.col-avail')).toHaveText('31,04 €');
  await expect(first.locator('.col-assign')).toContainText('5,01');
  await expect(first.locator('.col-act')).toHaveText('−7,03 €');
  await expect(first.locator('.col-avail')).toContainText('−2,02');
  const before = await readBudget(page, month);
  await parent.locator('.col-avail').click();
  await expect(
    page
      .getByRole('complementary', { name: 'Plan-Inspektor' })
      .getByRole('heading', { name: 'Erster Posten', exact: true }),
  ).not.toBeVisible();
  expect(await readBudget(page, month)).toEqual(before);
  const writes: Array<{ path: string; body: unknown }> = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith(`/budget/${month}/assigned`))
      writes.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() });
  });
  if (page.viewportSize()!.width < 768) {
    await nameButton(page, ids[0]!).click();
    const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
    await expect(
      inspector.getByRole('heading', { name: 'Erster Posten', exact: true }),
    ).toBeVisible();
    await inspector.getByLabel('Zugewiesen', { exact: true }).fill('6,01');
    await inspector.getByRole('button', { name: 'Übernehmen', exact: true }).click();
  } else {
    await first
      .getByRole('button', { name: 'Zugewiesen 5,01 € für Erster Posten ändern', exact: true })
      .click();
    const input = first.locator('.assign-input');
    await input.fill('6,01');
    await input.press('Enter');
  }
  await expect(first.locator('.col-assign')).toContainText('6,01');
  expect(writes).toEqual([
    {
      path: `/api/budget/${month}/assigned`,
      body: { items: [{ categoryId: ids[0], assignedCents: 601 }] },
    },
  ]);
  const changed = await readBudget(page, month);
  expect(
    ids.map(
      (id) => changed.summary.envelopes.find((item) => item.categoryId === id)!.assignedCents,
    ),
  ).toEqual([601, 4008]);
  await expect(parent.locator('.col-assign')).toHaveText('46,09 €');
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(first.locator('.col-assign')).toContainText('5,01');
  await expect(parent.locator('.col-assign')).toHaveText('45,09 €');
  expect(await readBudget(page, month)).toEqual(before);
});

// NEW desktop regression and read-only diagnostic; existing cases/oracles above stay unchanged.
async function recordNarrowDesktopBoundary(page: Page, stage: string) {
  return page.locator('.pmulti-scroll:has(.ptable-zero)').evaluate((element, stage) => {
    const scroller = element as HTMLElement;
    const table = scroller.querySelector<HTMLTableElement>('.ptable-zero')!;
    const header = table.querySelector<HTMLElement>('thead th:last-child')!;
    const action = table.querySelector<HTMLButtonElement>('.col-avail button')!;
    const box = (rect: DOMRect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    const styles = (node: Element, properties: string[]) => {
      const style = getComputedStyle(node);
      return Object.fromEntries(
        properties.map((name) => [name, style.getPropertyValue(name).slice(0, 140)]),
      );
    };
    const layoutProperties = [
      'width',
      'min-width',
      'max-width',
      'box-sizing',
      'padding-left',
      'padding-right',
      'border-left-width',
      'border-right-width',
      'overflow-x',
      'overflow-y',
      'transform',
      'direction',
      'zoom',
      'scroll-behavior',
    ];
    const fontProperties = ['font-family', 'font-size', 'font-weight', 'letter-spacing'];
    const outer = scroller.getBoundingClientRect();
    const target = action.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(header);
    const text = range.getBoundingClientRect();
    const clipLeft = outer.left + scroller.clientLeft;
    const clipRight = clipLeft + scroller.clientWidth;
    const x = target.left + target.width / 2,
      y = target.top + target.height / 2;
    const hit =
      x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
        ? document.elementFromPoint(x, y)
        : null;
    const font = getComputedStyle(table);
    return {
      stage,
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      coarse: matchMedia('(pointer: coarse)').matches,
      rawTouchPoints: navigator.maxTouchPoints,
      documentWidth: document.documentElement.scrollWidth,
      windowScroll: { x: scrollX, y: scrollY },
      scroller: {
        rect: box(outer),
        clientLeft: scroller.clientLeft,
        clientTop: scroller.clientTop,
        clientWidth: scroller.clientWidth,
        clientHeight: scroller.clientHeight,
        offsetWidth: scroller.offsetWidth,
        scrollWidth: scroller.scrollWidth,
        scrollLeft: scroller.scrollLeft,
        integerCssomMax: scroller.scrollWidth - scroller.clientWidth,
        clipLeft,
        clipRight,
        style: styles(scroller, layoutProperties),
      },
      table: {
        rect: box(table.getBoundingClientRect()),
        style: styles(table, [
          ...layoutProperties,
          ...fontProperties,
          'table-layout',
          'border-collapse',
          'border-spacing',
        ]),
      },
      header: {
        rect: box(header.getBoundingClientRect()),
        text: header.textContent!.trim().slice(0, 80),
        textRange: box(text),
        textRects: Array.from(range.getClientRects(), box).slice(0, 4),
        textClientClipWidth: Math.max(
          0,
          Math.min(text.right, clipRight) - Math.max(text.left, clipLeft),
        ),
        style: styles(header, [...layoutProperties, ...fontProperties]),
      },
      action: {
        rect: box(target),
        active: document.activeElement === action,
        centreInViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
        centreHit: hit
          ? {
              tag: hit.tagName,
              classes: Array.from(hit.classList).slice(0, 4),
              originalActionOrDescendant: hit === action || action.contains(hit),
            }
          : null,
        style: styles(action, [...layoutProperties, ...fontProperties]),
      },
      fonts: {
        status: document.fonts.status,
        actualTableFontAvailable: document.fonts.check(
          `${font.fontSize} ${font.fontFamily}`,
          'Verfügbar',
        ),
        faces: Array.from(document.fonts)
          .slice(0, 8)
          .map((face) => ({
            family: face.family.slice(0, 100),
            weight: face.weight.slice(0, 40),
            style: face.style.slice(0, 40),
            status: face.status,
          })),
      },
    };
  }, stage);
}

for (const theme of ['light', 'dark'] as const) {
  sampleTest(
    `desktop selected group survives Space Enter and click, outside clears ${theme}`,
    async ({ browser }, info) => {
      const context = await browser.newContext({
        baseURL: SAMPLE_URL,
        storageState: STORAGE_STATE_SAMPLE,
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
        colorScheme: 'light',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const writes: string[] = [];
      const observations: Array<{
        stage: string;
        expanded: string | null;
        groupChecked: boolean;
        focused: boolean;
      }> = [];
      page.on('request', (request) => {
        if (
          request.method() !== 'GET' &&
          /\/api\/(budget|categories|bookings|undo)/.test(request.url())
        )
          writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      try {
        await page.clock.setFixedTime(new Date(SAMPLE_NOW));
        await page.goto('/plan/monat?monat=2026-09');
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        const table = page.locator('.ptable-zero');
        await expect(table.locator('.pname')).toHaveCount(36);
        await expect(table.locator('tbody > .pgroup:not(.psingle)')).toHaveCount(8);
        await expect(table.locator('tbody > .psingle')).toHaveCount(11);
        await expect(table.locator('tbody > tr:not(.pgroup-gap):not(.is-empty)')).toHaveCount(44);
        expect(
          await page.evaluate(() => ({
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
            coarse: matchMedia('(pointer: coarse)').matches,
          })),
        ).toEqual({ width: 1440, height: 900, dpr: 1, coarse: false });
        const before = await readBudget(page, '2026-09');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          1440,
        );
        const sourceGroup = before.groups.find((group) => group.name === 'Wohnen')!;
        expect(sourceGroup).toBeTruthy();
        const ids = ['cat-miete', 'cat-strom', 'cat-internet', 'cat-haushalt'];
        expect(
          before.categories
            .filter((category) => category.groupId === sourceGroup.id && !category.hiddenAt)
            .map((category) => category.id)
            .sort(),
        ).toEqual([...ids].sort());
        const parent = table.locator(`[id="grp-${sourceGroup.id}"]`);
        await expect(parent).not.toHaveClass(/prow|psingle/);
        const group = parent.getByRole('checkbox', {
          name: 'Gruppe Wohnen auswählen',
          exact: true,
        });
        const toggle = parent.getByRole('button', { name: 'Gruppe Wohnen', exact: true });
        const child = (id: string) =>
          nameButton(page, id).locator('xpath=ancestor::tr').getByRole('checkbox');
        const single = child('cat-bankspesen');
        const record = async (stage: string) =>
          observations.push({
            stage,
            expanded: await toggle.getAttribute('aria-expanded'),
            groupChecked: await group.isChecked(),
            focused: await toggle.evaluate((element) => document.activeElement === element),
          });
        await group.check();
        for (const id of ids) await expect(child(id)).toBeChecked();
        await expect(single).not.toBeChecked();
        await expect(
          table.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }),
        ).toHaveJSProperty('indeterminate', true);
        await toggle.focus();
        for (const key of ['Space', 'Enter']) {
          await page.keyboard.press(key);
          await record(`${key}-collapsed`);
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(toggle).toBeFocused();
          await expect(table.locator('.pname')).toHaveCount(32);
          await expect(parent).toHaveCount(1);
          await expect(group).toBeChecked();
          await expect(single).not.toBeChecked();
          await page.keyboard.press(key);
          await record(`${key}-expanded`);
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await expect(toggle).toBeFocused();
          await expect(table.locator('.pname')).toHaveCount(36);
          await expect(group).toBeChecked();
          for (const id of ids) await expect(child(id)).toBeChecked();
          await expect(single).not.toBeChecked();
        }
        await toggle.click();
        await record('mouse-collapsed');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle).toBeFocused();
        await expect(group).toBeChecked();
        await toggle.click();
        await record('mouse-expanded');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        for (const id of ids) await expect(child(id)).toBeChecked();
        await expect(single).not.toBeChecked();
        const outside = page.getByRole('heading', {
          name: 'September 2026',
          level: 1,
          exact: true,
        });
        await expect(outside).toBeVisible();
        expect(
          await outside.evaluate((element) => element.isConnected && !element.closest('.plan')),
        ).toBe(true);
        await outside.click();
        await record('real-outside-cleared');
        await expect(group).not.toBeChecked();
        for (const id of ids) await expect(child(id)).not.toBeChecked();
        await expect(single).not.toBeChecked();
        await expect(
          table.getByRole('checkbox', { name: 'Alle Kategorien auswählen', exact: true }),
        ).toHaveJSProperty('indeterminate', false);
        expect(await readBudget(page, '2026-09')).toEqual(before);
        expect(writes).toEqual([]);
      } finally {
        try {
          const proof = {
            project: info.project.name,
            engine: browser.browserType().name(),
            browserVersion: browser.version(),
            actualDesktopOptions: {
              viewport: { width: 1440, height: 900 },
              dpr: 1,
              isMobile: false,
              hasTouch: false,
            },
            theme,
            observations,
            writes,
          };
          await writeFile(
            info.outputPath('desktop-selected-group-native.json'),
            JSON.stringify(proof, null, 2),
          );
          console.log('481-DESKTOP-SELECTION', JSON.stringify(proof));
        } catch (error) {
          console.log('481-DIAGNOSTIC-ERROR', error instanceof Error ? error.name : typeof error);
        }
        await context.close();
      }
    },
  );

  sampleTest(
    `768 desktop exact boundary diagnostic without oracle waiver ${theme}`,
    async ({ browser }, info) => {
      // Preserve the original old481 ordering: start1440, font-ready, theme, then resize768.
      const context = await browser.newContext({
        baseURL: SAMPLE_URL,
        storageState: STORAGE_STATE_SAMPLE,
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
        colorScheme: 'light',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const measurements: Awaited<ReturnType<typeof recordNarrowDesktopBoundary>>[] = [];
      const writes: string[] = [];
      page.on('request', (request) => {
        if (
          request.method() !== 'GET' &&
          /\/api\/(budget|categories|bookings|undo)/.test(request.url())
        )
          writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      });
      const capture = async (stage: string) => {
        const observation = await recordNarrowDesktopBoundary(page, stage);
        measurements.push(observation);
        // Whitelist and fixed-size arrays keep the complete critical fields readable in job logs.
        console.log(
          '481-NARROW768',
          JSON.stringify({
            project: info.project.name,
            engine: browser.browserType().name(),
            browserVersion: browser.version(),
            theme,
            ...observation,
          }),
        );
        return observation;
      };
      try {
        await page.clock.setFixedTime(new Date(SAMPLE_NOW));
        await page.goto('/plan/monat?monat=2026-09');
        const table = page.locator('.ptable-zero');
        await expect(table.locator('tbody > .pgroup:not(.psingle)')).toHaveCount(8);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate((value) => {
          document.documentElement.dataset['theme'] = value;
        }, theme);
        await page.setViewportSize({ width: 768, height: 900 });
        await expect(table.locator('.pname')).toHaveCount(36);
        await expect(table.locator('tbody > .psingle')).toHaveCount(11);
        await expect(table.locator('tbody > tr:not(.pgroup-gap):not(.is-empty)')).toHaveCount(44);
        const before = await readBudget(page, '2026-09');
        const expectedIds = [...multiGroups.flatMap(([, ids]) => [...ids]), ...singleCategoryIds]
          .map((id) => `cat-${id}`)
          .sort();
        expect(
          before.categories
            .filter((category) => !category.hiddenAt)
            .map((category) => category.id)
            .sort(),
        ).toEqual(expectedIds);
        expect(
          await table
            .locator('.pname')
            .evaluateAll((elements) =>
              elements.map((element) => (element as HTMLElement).dataset['categoryId']).sort(),
            ),
        ).toEqual(expectedIds);
        const initial = await capture('initial-before-original-scroll');
        expect(initial.viewport).toEqual({ width: 768, height: 900 });
        expect(initial.dpr).toBe(1);
        expect(initial.coarse).toBe(false);
        expect(initial.documentWidth).toBeLessThanOrEqual(768);
        expect(initial.scroller.clientWidth).toBeGreaterThan(0);
        expect(initial.table.rect.width).toBeGreaterThan(0);
        expect(initial.header.text).toBe('Verfügbar');
        expect(initial.header.textRange.width).toBeGreaterThan(0);
        expect(initial.action.rect.width).toBeGreaterThan(0);
        expect(initial.action.rect.height).toBeGreaterThan(0);
        const scroll = page.locator('.pmulti-scroll:has(.ptable-zero)');
        await expect(scroll).toHaveCSS('overflow-x', 'auto');
        await scroll.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await capture('original-max-scroll-before-focus');
        const action = table.locator('.col-avail button').first();
        await action.focus();
        await expect(action).toBeFocused();
        const original = await capture('after-original-action-focus');
        expect(original.action.active).toBe(true);
        expect(original.action.rect.left).toBeGreaterThanOrEqual(original.scroller.rect.left);
        expect(original.action.rect.right).toBeLessThanOrEqual(original.scroller.rect.right);
        expect(original.documentWidth).toBeLessThanOrEqual(768);
        if (original.scroller.scrollWidth > original.scroller.clientWidth)
          expect(original.scroller.scrollLeft).toBeGreaterThan(0);
        // Diagnostic clamp only AFTER the original measurement; not a fix or replacement for strict old481:896.
        await scroll.evaluate((element) => {
          element.scrollLeft = element.scrollWidth + element.clientWidth;
        });
        await capture('diagnostic-explicit-max-clamp-after-original-stage');
        expect(await readBudget(page, '2026-09')).toEqual(before);
        expect(writes).toEqual([]);
      } finally {
        try {
          await writeFile(
            info.outputPath('768-boundary-diagnostic.json'),
            JSON.stringify(
              {
                project: info.project.name,
                engine: browser.browserType().name(),
                browserVersion: browser.version(),
                theme,
                measurements,
                writes,
                scope:
                  'Read-only layout diagnosis. Existing old481 strict headerRight<=outerRight remains unchanged; no rounding waiver or fix claim.',
              },
              null,
              2,
            ),
          );
        } catch (error) {
          console.log('481-DIAGNOSTIC-ERROR', error instanceof Error ? error.name : typeof error);
        }
        await context.close();
      }
    },
  );
}
