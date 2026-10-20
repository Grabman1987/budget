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
