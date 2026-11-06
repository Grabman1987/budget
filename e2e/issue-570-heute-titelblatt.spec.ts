import { withShellControls } from './shell-actions';
import { detectHeuteRedesign, heuteReviewUrl } from './heute-visual-fixture';
import AxeBuilder from '@axe-core/playwright';
import { expect as baseExpect, sampleTest as test } from './sample';

/**
 * #570: Heute Titelblatt (month switch, "Monat | Bis Gehalt", "Stand") and section heads without
 * circle numbers. Sample server, "today" is 17.09.2026.
 */
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 90_000 });
let redesign = false;
test.beforeAll(async ({ browser }) => {
  redesign = await detectHeuteRedesign(browser);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test.beforeEach(async ({ page }) => {
      // The "Mehr zum Monat" fold is closed on the phone by default.
      await page.addInitScript(() => localStorage.setItem('budget-heute-more-phone', '1'));
    });

    test('Titelblatt: month switch, Monat | Bis Gehalt and Stand; no horizontal scroll', async ({
      page,
    }, info) => {
      await page.goto('/');
      const head = page.locator(redesign ? '.hv-head:visible' : 'header.titleblock-heute');
      await expect(
        redesign
          ? head.locator('.month-name')
          : head.getByRole('heading', { name: 'September 2026', exact: true }),
      ).toBeVisible();
      const monat = head.getByRole('button', { name: 'Monat', exact: true });
      const payday = head.getByRole('button', { name: 'Bis Gehalt', exact: true });
      await expect(monat).toBeVisible();
      await expect(payday).toBeVisible();
      const stand = head.locator('.tb-field', { hasText: 'Stand' });
      const phone = (page.viewportSize()?.width ?? 1440) < 768;
      if (!phone && !redesign) {
        // Desktop: the switch is right of the month, "Stand" sits underneath the switch.
        await expect(stand).toBeVisible();
        const title = await head.locator('.tb-title').boundingBox();
        const sw = await head.locator('.tb-field', { hasText: 'Zeitraum' }).boundingBox();
        const st = await stand.boundingBox();
        expect(sw!.x).toBeGreaterThanOrEqual(title!.x + title!.width - 1);
        expect(Math.abs(st!.x - sw!.x)).toBeLessThan(2);
        expect(st!.y).toBeGreaterThanOrEqual(sw!.y + sw!.height - 1);
        // The head keeps its former height (~85 px) so the Zu-tun list stays on the first screen.
        expect((await head.boundingBox())!.height).toBeLessThanOrEqual(88);
      } else {
        // Phone: touch targets of the month switch and the period switch.
        for (const target of [
          head.getByRole('button', { name: 'Vormonat' }),
          head.getByRole('button', { name: 'Nächster Monat' }),
          monat,
          payday,
        ]) {
          const box = await target.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`titelblatt-${colorScheme}-${info.project.name}.png`),
      });
    });

    test('no circle numbers in section heads; the Kennzahlen replace Monatsergebnis and Dieser Monat', async ({
      page,
    }) => {
      await page.goto('/?period=payday');
      if (redesign) {
        await expect(page.locator('.hv-number')).toHaveText(['1', '2', '3', '4', '5']);
        await page.getByRole('link', { name: 'Kennzahlen', exact: true }).click();
      }
      if (!redesign)
        await expect(page.getByRole('heading', { name: 'Letzte Buchungen' })).toBeVisible();
      await expect(page.locator('.heute .circle-no')).toHaveCount(0);
      for (const name of [
        'Zu verteilen',
        redesign ? 'Verfügbar im Budget' : 'Frei bis Gehalt',
        'Nettovermögen',
      ])
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Monatsergebnis', exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByText('Dieser Monat', { exact: true })).toHaveCount(0);
    });

    test('another month: switch follows, current-data sections say Stand heute; Axe is clean', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Vormonat' }).click();
      await expect(page).toHaveURL(/monat=2026-08/);
      if (redesign) {
        await expect(page.locator('.hv-head:visible .month-name')).toHaveText('August 2026');
        await expect(page.locator('.hv-lead')).toHaveAttribute('data-as-of', '2026-09-17');
        await page.goto(heuteReviewUrl(true, '/?monat=2026-08&period=month'));
      } else
        await expect(page.getByRole('heading', { name: 'August 2026', exact: true })).toBeVisible();
      await expect(page.getByText('August 2026 · Pace')).toBeVisible();
      for (const name of [
        'Letzte Buchungen',
        'Vermögensaufteilung',
        'Nettovermögen · 12 Monate',
        'Zu tun',
      ]) {
        await expect(
          page.getByRole('region', { name, exact: true }).getByText('Stand heute · '),
        ).toBeVisible();
      }
      await expect(page.locator('.heute-answers > .heute-note')).toContainText(
        'Stand heute · 17.09.2026',
      );
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);
    });
  });
}

test('recent bookings show counterparties and mask them in privacy mode (#951)', async ({
  page,
}) => {
  const response = await page.request.get('/api/heute');
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const base = {
    date: '2026-09-17',
    payeeName: null,
    categoryName: null,
    categoryClass: null,
    memo: null,
    status: 'confirmed',
    accountName: 'Musterkonto',
    transferId: null,
    transferAccountName: null,
  };
  data.lastBookings = [
    {
      ...base,
      id: 'out',
      amountCents: -1234,
      transferId: 'transfer',
      transferAccountName: 'Mustersparkonto',
    },
    {
      ...base,
      id: 'in',
      amountCents: 1234,
      transferId: 'transfer',
      transferAccountName: 'Mustergiro',
    },
    { ...base, id: 'memo', amountCents: 123, memo: 'Musterzinsen' },
    { ...base, id: 'payee', amountCents: -456, payeeName: 'Musterladen' },
  ];
  await page.route('**/api/heute?*', (route) => route.fulfill({ json: data }));
  try {
    await page.goto('/');
    const labels = page.locator(redesign ? '.hv-booking-list strong' : '.heute-booking strong');
    await expect(labels).toHaveText([
      'Umbuchung nach Mustersparkonto',
      'Umbuchung von Mustergiro',
      'Musterzinsen',
      'Musterladen',
    ]);
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(labels).toHaveText(['•••', '•••', '•••', '•••']);
    await expect(page.locator('main')).not.toContainText('Musterzinsen');
    if (redesign) {
      await page.goto('/heute/details/bookings');
      await expect(page.locator('.heute-booking strong')).toHaveText(['•••', '•••', '•••', '•••']);
      await expect(page.locator('main')).not.toContainText('Musterzinsen');
      await page.goto('/');
    }
    await withShellControls(page, async ({ privacy }) => {
      await privacy.click();
    });
    await expect(labels.first()).toHaveText('Umbuchung nach Mustersparkonto');
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
