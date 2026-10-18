import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';

/**
 * Plan › Zahlungen (#605): 35 days in four groups with sums, the 90-day switch, sticky heads and
 * two-line phone rows. Runs on the seeded sample server (today is Thursday 17.09.2026), read only.
 */
test.describe.configure({ timeout: 90_000 });

const TODAY_MD = '09-17';
const GROUP_ORDER = ['overdue', 'this-week', 'next-week', 'later'];
/** 35 days after 17.09.2026, as month-day. */
const LAST_35_MD = '10-22';

/** First amount of a text as signed cents (`−1.234,56 €` → -123456); an `≈` value wins. */
function centsOf(text: string): number | null {
  const approx = text.includes('≈') ? text.slice(text.indexOf('≈')) : text;
  const match = /([+−-])?\s*(\d{1,3}(?:\.\d{3})*),(\d{2})/.exec(approx);
  if (!match) return null;
  const value = Number(match[2]!.replace(/\./g, '')) * 100 + Number(match[3]);
  return match[1] === '−' || match[1] === '-' ? -value : value;
}

/** `Do 01.10.` → `10-01` */
const monthDay = (text: string) => {
  const m = /(\d{2})\.(\d{2})\./.exec(text);
  return m ? `${m[2]}-${m[1]}` : '';
};

async function open(page: Page, query = '') {
  await page.goto(`/plan/erwartet${query}`);
  await expect(page.locator('tr.prow').first()).toBeVisible({ timeout: 30_000 });
}

interface Shown {
  group: string;
  name: string;
  md: string;
  cents: number | null;
  alert: boolean;
}

/** Every shown row with its group, read from the DOM. */
async function rowsOf(page: Page): Promise<Shown[]> {
  return page
    .locator('table.xp-next tbody')
    .evaluateAll((bodies) =>
      bodies.flatMap((body) =>
        Array.from(body.querySelectorAll('tr.prow')).map((tr) => ({
          group: (body as HTMLElement).dataset['group'] ?? '',
          name: tr.querySelector('strong')?.textContent ?? '',
          due: tr.querySelector('.col-due')?.textContent ?? '',
          amount: tr.querySelector('.col-num')?.textContent ?? '',
          alert: tr.classList.contains('is-alert'),
        })),
      ),
    )
    .then((rows) =>
      rows.map((r) => ({
        group: r.group,
        name: r.name,
        md: monthDay(r.due),
        cents: centsOf(r.amount),
        alert: r.alert,
      })),
    );
}

const headSum = async (head: Locator) =>
  centsOf((await head.locator('td.col-num').innerText()) ?? '');

test('four groups in order, each sum equals the sum of its shown rows in cents', async ({
  page,
}) => {
  await open(page);
  const groups = await page
    .locator('table.xp-next tbody[data-group]')
    .evaluateAll((bodies) => bodies.map((b) => (b as HTMLElement).dataset['group']));
  const keys = [...new Set(groups.map((g) => (g === 'later-week' ? 'later' : g)))];
  expect(keys.length).toBeGreaterThanOrEqual(3);
  expect(keys).toEqual(GROUP_ORDER.filter((k) => keys.includes(k)));
  await expect(page.getByTestId('group-this-week')).toContainText('Diese Woche');
  await expect(page.getByTestId('group-next-week')).toContainText('Nächste Woche');
  await expect(page.getByTestId('group-later')).toContainText('Später');

  const rows = await rowsOf(page);
  for (const key of GROUP_ORDER) {
    const head = page.getByTestId(`group-${key}`);
    if ((await head.count()) === 0) continue;
    const shown = rows.filter((r) =>
      key === 'later' ? r.group === 'later-week' : r.group === key,
    );
    const expected = shown.reduce((sum, r) => sum + (r.cents ?? 0), 0);
    expect(await headSum(head), `${key} sum`).toBe(expected);
  }
  // Later: the week heads add up to the group head.
  const weekHeads = page.locator('tr.pgroup.is-week');
  let weekTotal = 0;
  for (const head of await weekHeads.all()) weekTotal += (await headSum(head)) ?? 0;
  expect(weekTotal).toBe(await headSum(page.getByTestId('group-later')));
});

test('an overdue row appears only in Überfällig; nothing else is dated before today', async ({
  page,
}) => {
  await open(page);
  const rows = await rowsOf(page);
  const overdue = rows.filter((r) => r.group === 'overdue');
  for (const r of overdue) expect(r.md < TODAY_MD, `${r.name} ${r.md} is before today`).toBe(true);
  // An open booking-less row of the past (deviating / missed) never sits in another group.
  for (const r of rows.filter((r) => r.group !== 'overdue' && r.alert))
    expect(r.md >= TODAY_MD, `${r.name} ${r.md} is not overdue`).toBe(true);
  // Each occurrence is listed once.
  const keys = rows.map((r) => `${r.name}|${r.md}`);
  expect(new Set(keys).size).toBe(keys.length);
});

test('the 35-day list ends on 22.10.; 90 days extends it without changing the first 35', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('button', { name: '35 Tage' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const short = await rowsOf(page);
  expect(short.length).toBeGreaterThan(3);
  for (const r of short.filter((r) => r.group !== 'overdue'))
    expect(r.md <= LAST_35_MD, `${r.name} ${r.md} within 35 days`).toBe(true);
  const sums = async () =>
    Promise.all(
      ['overdue', 'this-week', 'next-week'].map(async (k) => {
        const head = page.getByTestId(`group-${k}`);
        return (await head.count()) ? headSum(head) : null;
      }),
    );
  const firstSums = await sums();

  await page.getByRole('button', { name: '90 Tage' }).click();
  await expect(page.getByRole('button', { name: '90 Tage' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const long = await rowsOf(page);
  expect(long.length).toBeGreaterThan(short.length);
  // The first 35 days are the same rows in the same order.
  const inShort = (r: Shown) => r.group === 'overdue' || r.md <= LAST_35_MD;
  expect(long.filter(inShort)).toEqual(short);
  expect(await sums()).toEqual(firstSums);
  // The day before the 36th is not cut: every extra row is later than 22.10.
  for (const r of long.filter((r) => !inShort(r))) expect(r.md > LAST_35_MD).toBe(true);

  await page.getByRole('button', { name: '35 Tage' }).click();
  expect(await rowsOf(page)).toEqual(short);
});

test('one title for the list and no second heading with the old wording', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Wiederkehrende Zahlungen' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: /Nächste 90 Tage/ })).toHaveCount(0);
});

test('the list fits 1440 x 900 plus one scroll page', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop viewport');
  await open(page);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(2 * 900);
});

test('the group head sticks while its rows scroll', async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 520 } : { width: 1440, height: 420 });
  await open(page);
  await page.getByRole('button', { name: '90 Tage' }).click();
  // The week with the most rows.
  const weeks = page.locator('table.xp-next tbody').filter({ has: page.locator('tr.prow') });
  const counts = await weeks.evaluateAll((bodies) =>
    bodies.map((b) => b.querySelectorAll('tr.prow').length),
  );
  const best = counts.indexOf(Math.max(...counts));
  const body = weeks.nth(best);
  const head = body.locator('tr.pgroup');
  const headCell = isMobile ? head : head.locator('td').first();
  const position = await headCell.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('sticky');
  // Scroll until the second row of the group is at the top: the head must be pinned above it.
  const second = body.locator('tr.prow').nth(Math.min(1, Math.max(counts[best]! - 1, 0)));
  await second.evaluate((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - 90);
  });
  await expect
    .poll(async () => (await headCell.boundingBox())?.y ?? -999, { timeout: 5_000 })
    .toBeLessThanOrEqual(isMobile ? 2 : 70);
  const box = (await headCell.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(-1);
  await expect(head.locator('.grp-toggle')).toBeInViewport();
});

test('phone: rows have two lines, targets are 44 px, no horizontal page scroll', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone viewport');
  await open(page);
  await page.getByRole('button', { name: '90 Tage' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const lines = await page.locator('table.xp-next tr.prow').evaluateAll((trs) =>
    trs.map((tr) => {
      const centers = ['.col-name', '.col-num', '.col-due', '.col-cat', '.col-state']
        .map((sel) => tr.querySelector(sel))
        .filter((el): el is Element => el !== null)
        .map((el) => {
          const inner = el.querySelector('strong, .xp-chip, .xp-status') ?? el;
          const box = inner.getBoundingClientRect();
          return box.top + box.height / 2;
        })
        .sort((x, y) => x - y);
      // A new line starts where the centres are further apart than half a text line.
      const lines = centers.filter((c, i) => i === 0 || c - centers[i - 1]! > 12).length;
      return { lines, height: tr.getBoundingClientRect().height };
    }),
  );
  expect(lines.length).toBeGreaterThan(5);
  for (const row of lines) {
    expect(row.lines).toBeLessThanOrEqual(2);
    expect(row.height).toBeLessThan(100);
  }
  for (const control of [
    ...(await page.locator('table.xp-next .xp-name').all()).slice(0, 4),
    ...(await page.locator('table.xp-next .grp-toggle').all()).slice(0, 3),
    ...(await page.locator('.xp-toolbar .seg button').all()),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.height, await control.innerText()).toBeGreaterThanOrEqual(44);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    test(`${scheme}: Axe finds no violations in 35 and 90 days; no horizontal scroll`, async ({
      page,
    }) => {
      await open(page);
      for (const days of ['35 Tage', '90 Tage']) {
        await page.getByRole('button', { name: days }).click();
        await page.evaluate(() => document.fonts.ready);
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(
          result.violations.map((v) => ({
            rule: v.id,
            nodes: v.nodes.map((n) => n.target.join(' ')),
          })),
        ).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
    });
  });
}
