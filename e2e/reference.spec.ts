import { expect, test, type Page } from '@playwright/test';
import { expectMatchesReference, type Rect, type RegionCheck } from './reference';

/**
 * Layout comparison with the reference screenshots in `design/screens` (audit D9): frames, rules,
 * fills and the position of every box in the shell, the title blocks and the register rows, at
 * 1440 and 390 px. The references carry the prototype's sample text, so text is blurred away and
 * cells whose content differs on purpose are masked (see reference.ts). Everything else (the
 * amount field, panel, toast, charts, revision table, ...) has no matching crop in the reference
 * screens and is covered by its own regression baselines in components.spec.ts only.
 */
test.skip(process.platform !== 'linux', 'font rasterisation differs off Linux');

/** Frames, rules and boxes must sit on the same pixels; 1 px of blur absorbs anti-aliasing. */
const BLUR = 1;
const THRESHOLD = 12;
const MAX_DIFF = 0.005;
const SEP = '?monat=2026-09'; // the references show September 2026

async function ready(page: Page, path: string) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.locator('main')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

const desktopOnly = (isMobile: boolean) => test.skip(isMobile, 'desktop layout');
const phoneOnly = (isMobile: boolean) => test.skip(!isMobile, 'phone layout');

/** Register labels sit between the tab row's top and the 2 px underline, which stays compared. */
const REGISTER_LABELS = { x: 260, y: 188, w: 1160, h: 26 };

/** Text is data (different words, different weights of anti-aliasing): mask it, keep the boxes. */
const text = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

function check(base: Omit<RegionCheck, 'blur'>): RegionCheck {
  return { blur: BLUR, threshold: THRESHOLD, maxDiff: MAX_DIFF, ...base };
}

test.describe('desktop 1440 px against design/screens', () => {
  test('sidebar and top bar (Plan)', async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    // The prototype's badge has nine items. Isolate this geometry check from the
    // writable suite database; inbox.spec.ts checks the real count and its updates.
    await page.route('**/api/inbox/count', (route) =>
      route.fulfill({ json: { asOf: '2026-09-17', count: 9 } }),
    );
    await ready(page, `/plan/monat${SEP}`);
    await expect(
      page.getByRole('link', { name: 'Posteingang, 9 offen', exact: true }),
    ).toBeVisible();
    await expectMatchesReference(
      page,
      check({
        name: 'sidebar',
        reference: 'desktop/plan-monat.webp',
        region: { x: 0, y: 0, w: 236, h: 330 },
        masks: [
          text(58, 22, 135, 32), // brand name ("Finanz-App" in the prototype)
          text(18, 80, 80, 18), // "PLANLISTE"
          ...[116, 160, 204, 248, 292].flatMap((y) => [text(54, y, 110, 20), text(186, y, 30, 20)]),
        ],
      }),
    );
    await expectMatchesReference(
      page,
      check({
        name: 'topbar',
        reference: 'desktop/plan-monat.webp',
        region: { x: 236, y: 0, w: 1204, h: 64 },
        masks: [
          text(346, 18, 320, 26), // search placeholder
          text(714, 20, 52, 22), // "Strg K"
          text(1114, 16, 122, 28), // inbox icon (Lucide) and "Posteingang"
          text(1234, 20, 26, 22), // count
          text(1322, 16, 78, 28), // "Buchung"
        ],
      }),
    );
  });

  test('Plan: title block with month switch and registers', async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await ready(page, `/plan/monat${SEP}`);
    await expectMatchesReference(
      page,
      check({
        name: 'plan-head',
        reference: 'desktop/plan-monat.webp',
        region: { x: 260, y: 80, w: 1160, h: 160 },
        // Cells after the title carry other text and widths (Stand shows a time, ours "noch nie",
        // and placeholder pages add "Gefüllt in"); the month text is data.
        masks: [
          { x: 1000, y: 84, w: 420, h: 84 },
          { x: 350, y: 100, w: 250, h: 56 },
          REGISTER_LABELS,
        ],
      }),
    );
  });

  test('Heute: title block with month and period switch', async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await ready(page, `/${SEP}`);
    await expectMatchesReference(
      page,
      check({
        name: 'heute-head',
        reference: 'desktop/heute.webp',
        region: { x: 260, y: 80, w: 1160, h: 100 },
        masks: [
          { x: 900, y: 84, w: 520, h: 96 }, // Stand and Zeitraum cells (other widths)
          { x: 290, y: 96, w: 400, h: 60 }, // the month
        ],
      }),
    );
  });

  test('Konten: title block and registers', async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await ready(page, '/konten');
    await expectMatchesReference(
      page,
      check({
        name: 'konten-head',
        reference: 'desktop/konten.webp',
        region: { x: 260, y: 80, w: 1160, h: 160 },
        masks: [
          { x: 1000, y: 84, w: 420, h: 84 },
          { x: 290, y: 96, w: 300, h: 60 },
          REGISTER_LABELS,
        ],
      }),
    );
  });

  test('Einstellungen: title block and registers', async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await ready(page, '/einstellungen/konten');
    await expectMatchesReference(
      page,
      check({
        name: 'einstellungen-head',
        reference: 'desktop/einstellungen-konten.webp',
        region: { x: 260, y: 80, w: 1160, h: 160 },
        masks: [
          { x: 700, y: 84, w: 720, h: 84 }, // Profil and "Gefüllt in" cells
          { x: 290, y: 96, w: 400, h: 60 }, // the title
          REGISTER_LABELS,
        ],
      }),
    );
  });
});

test.describe('phone 390 px against design/screens', () => {
  for (const [name, path, reference] of [
    ['plan', `/plan/monat${SEP}`, 'mobile/plan-monat.webp'],
    ['konten', '/konten', 'mobile/konten.webp'],
    ['heute', `/${SEP}`, 'mobile/heute.webp'],
  ] as const) {
    test(`header of ${name}`, async ({ page, isMobile }) => {
      phoneOnly(isMobile);
      await ready(page, path);
      await expectMatchesReference(
        page,
        check({
          name: `phone-header-${name}`,
          reference,
          region: { x: 0, y: 0, w: 390, h: 72 },
          masks: [
            text(14, 14, 200, 44), // title
            text(238, 8, 42, 42), // inbox icon (Lucide, the prototype draws its own) and its count
            text(286, 16, 34, 34), // theme icon (moon/sun as in the prototype)
            text(328, 8, 54, 54), // avatar (44 px here for touch, 40 px in the prototype)
          ],
        }),
      );
    });
  }
});
