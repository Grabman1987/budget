import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type Page } from '@playwright/test';
import { sampleTest as test, expect, SAMPLE_URL } from './sample';
import { expectScreenshot } from './visual';

/**
 * Plan › Erwartet and the Einnahmen panel against the seeded sample server (today is 17.09.2026).
 * Desktop and phone share that database, so tests that write create their own payment with a
 * unique name, due far outside the 90 days that the baselines show.
 */

const serious = async (page: Page) =>
  (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));

async function post(request: APIRequestContext, path: string, data: unknown) {
  const res = await request.post(`/api/${path}`, { data, headers: { origin: SAMPLE_URL } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, { id: string }>;
}

test('the next due dates are right: Gehalt on the last business day, 30.09.2026', async ({
  page,
}) => {
  await page.goto('/plan/erwartet');
  const gehalt = page.locator('tr.prow', { hasText: 'Gehalt' }).first();
  await expect(gehalt).toContainText('Mi 30.09.');
  await expect(gehalt).toContainText('+3.812,00 €');
  await expect(gehalt).toContainText('erwartet');
  // A payment already booked this week is "eingegangen"; Miete falls due on 01.10. (Thursday).
  await expect(page.locator('tr.prow', { hasText: 'Internet' }).first()).toContainText(
    'eingegangen',
  );
  await expect(page.locator('tr.prow', { hasText: 'Miete' }).first()).toContainText('Do 01.10.');

  // Parts list: monthly equivalent and yearly sum, the foreign-currency amount stays visible.
  await page.getByRole('button', { name: 'Verträge und Abos' }).click();
  await expect(page.locator('tr.prow', { hasText: 'Gehalt' })).toHaveCount(0);
  const assistant = page.locator('tr.prow', { hasText: 'KI-Assistent' });
  await expect(assistant).toContainText('20,00 $ je Zahlung');
  await expect(assistant).toContainText('08.10.2026');
  await expect(page.locator('tr.prow', { hasText: 'Strom' })).toContainText('−105,00 €');
  await expect(page.locator('tr.prow', { hasText: 'Strom' })).toContainText('−1.260 €');
  await page.getByRole('button', { name: 'Alle', exact: true }).first().click();
  await expect(page.locator('tr.prow', { hasText: 'Gehalt' })).toContainText('30.09.2026');
});

test('a new version from February 2027 changes only the future occurrences; undo restores them', async ({
  page,
}, testInfo) => {
  const name = `Prämie ${testInfo.project.name} ${Date.now().toString(36).slice(-5)}`;
  await post(page.request, 'expected', {
    name,
    kind: 'inflow',
    accountId: 'acc-giro',
    amountCents: 100_000,
    rhythm: 'monthly',
    dueDay: 28,
    startDate: '2026-12-28',
  });
  await page.goto('/plan/erwartet');
  await page.getByRole('button', { name: 'Verträge und Abos' }).click();
  await page.getByRole('button', { name: 'Alle', exact: true }).first().click();
  await page.locator('tr.prow', { hasText: name }).getByRole('button').first().click();
  const panel = page.getByRole('dialog', { name });
  await expect(panel).toBeVisible();

  const occurrence = (date: string) => panel.locator('.xp-occ li', { hasText: date });
  await expect(occurrence('28.01.2027')).toContainText('1.000,00 €');
  await expect(occurrence('28.02.2027')).toContainText('1.000,00 €');

  await panel.getByLabel('Ab Monat').fill('2027-02');
  await panel.getByLabel('Neuer Betrag').fill('1200');
  await panel.getByRole('button', { name: 'Version speichern' }).click();
  await expect(page.locator('.toast.is-open')).toContainText('neue Version ab 01.02.2027');
  await expect(occurrence('28.02.2027')).toContainText('1.200,00 €');
  await expect(occurrence('28.03.2027')).toContainText('1.200,00 €');
  await expect(occurrence('28.01.2027')).toContainText('1.000,00 €');
  await expect(panel.getByRole('table', { name: /Versionen von/ }).getByRole('row')).toHaveCount(3);

  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(occurrence('28.02.2027')).toContainText('1.000,00 €');
  await expect(occurrence('28.03.2027')).toContainText('1.000,00 €');
  await expect(panel.getByRole('table', { name: /Versionen von/ }).getByRole('row')).toHaveCount(2);
});

test('a booking links to an occurrence and the occurrence can be marked missed', async ({
  page,
}, testInfo) => {
  const name = `Abo ${testInfo.project.name} ${Date.now().toString(36).slice(-5)}`;
  await post(page.request, 'expected', {
    name,
    kind: 'outflow',
    accountId: 'acc-giro',
    amountCents: 2_500,
    rhythm: 'monthly',
    dueDay: 20,
    startDate: '2027-02-20',
  });
  await page.goto('/plan/erwartet');
  await page.getByRole('button', { name: 'Alle', exact: true }).first().click();
  await page.getByRole('button', { name: 'Verträge und Abos' }).click();
  await page.locator('tr.prow', { hasText: name }).getByRole('button').first().click();
  const panel = page.getByRole('dialog', { name });
  const occurrence = panel.locator('.xp-occ li', { hasText: '20.03.2027' });
  await occurrence.getByRole('button', { name: 'Ausgefallen' }).click();
  await expect(occurrence).toContainText('ausgefallen');
  await expect(occurrence.locator('.xp-status')).toHaveClass(/is-alert/);
  await occurrence.getByRole('button', { name: 'Verknüpfen' }).click();
  await expect(occurrence.getByText('Keine passende Buchung')).toBeVisible();
});

test('Plan › Monat: the Einnahmen term opens received against expected', async ({ page }) => {
  await page.goto('/plan/monat');
  await page
    .getByRole('group', { name: 'Maßkette Zu verteilen' })
    .getByRole('button', {
      name: /Einnahmen/,
    })
    .click();
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const panel = page.locator('.plan-detail');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('erwartet 4.612,00 €')).toBeVisible();
  await expect(panel.getByRole('table', { name: /nach Art/ })).toContainText('Gehalt');
  await expect(panel.getByRole('table', { name: /nach Art/ })).toContainText('3.812,00 €');
  await expect(panel).toContainText('kein Geld zum Verteilen');
  await panel.getByRole('link', { name: 'Zurück zum Monat' }).click();
  await expect(page).toHaveURL(/\/plan\/monat(\?|$)/);
  await expect(await serious(page)).toEqual([]);
});

test.describe('look', () => {
  test('light: the 90 days and a payment panel', async ({ page }) => {
    await page.goto('/plan/erwartet');
    await expect(page.locator('tr.prow').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await serious(page)).toEqual([]);
    await expectScreenshot(page, 'expected-light.png');
    await page.locator('tr.prow', { hasText: 'Strom' }).getByRole('button').first().click();
    await expect(page.getByRole('dialog', { name: 'Strom' })).toBeVisible();
    await expect(page.locator('.xp-occ li').first()).toBeVisible();
    expect(await serious(page)).toEqual([]);
    await expectScreenshot(page, 'expected-panel-light.png');
  });

  test.describe('dark', () => {
    test.use({ colorScheme: 'dark' });
    test('the 90 days and the Einnahmen panel', async ({ page }, testInfo) => {
      await page.goto('/plan/erwartet');
      await expect(page.locator('tr.prow').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await serious(page)).toEqual([]);
      await expectScreenshot(page, 'expected-dark.png');
      await page.getByRole('button', { name: /Einnahmen im Detail/ }).click();
      await expect(page.getByRole('dialog', { name: /Einnahmen/ })).toBeVisible();
      await expect(page.getByTestId('income-received')).toBeVisible();
      expect(await serious(page)).toEqual([]);
      const incomeRegion = page.getByRole('region', { name: 'Einnahmen September 2026' });
      await expect(incomeRegion).toContainText(
        /Heute zählt Haushaltseinnahmen nach Buchungsdatum.*„Für nächsten Monat“ zählt im Plan erst im Folgemonat\./,
      );
      if (testInfo.project.name === 'mobile') {
        await page.getByRole('button', { name: 'Schließen' }).focus();
        await page.keyboard.press('Tab');
        await expect(incomeRegion).toBeFocused();
        const before = await incomeRegion.evaluate((element) => element.scrollTop);
        await page.keyboard.press('PageDown');
        await expect
          .poll(() => incomeRegion.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(before);
        await incomeRegion.evaluate((element) => {
          element.scrollTop = 0;
        });
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
      }
      await expectScreenshot(page, 'expected-income-dark.png');
    });
  });
});
