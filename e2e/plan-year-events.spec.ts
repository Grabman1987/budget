import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo, type Request } from '@playwright/test';
import { test } from './isolated-ledger';

async function inspect(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page }).include('main').include('dialog[open]').analyze()
      ).violations.map((v) => v.id),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${name}-${theme}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

test('year events: create, edit recurrence, scenario without writes, off/delete and undo/redo', async ({
  page,
  isolatedLedger,
}, info) => {
  test.slow();
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(`/api${path}`, {
      data,
      headers: { origin: isolatedLedger.origin },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return (await r.json()) as Record<string, { id: string }>;
  };
  await post('/accounts', {
    name: 'Jahresplan Konto',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 1_000_000,
  });
  const group = (await post('/categories/groups', { name: 'Jahresplan' }))['group']!;
  await post('/categories', { name: 'Reisen', groupId: group.id, class: 'want', kind: 'variable' });
  const financialWrites: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/(budget|bookings)(\/|\?|$)/.test(r.url()) && r.method() !== 'GET')
      financialWrites.push(r.method());
  });
  await page.goto('/plan/jahr?monat=2026-11');
  await expect(page.getByTestId('scenario-year-end')).toHaveText('10.000,00 €');
  await page.getByRole('button', { name: 'Ereignis einplanen', exact: true }).click();
  let panel = page.getByRole('dialog', { name: 'Ereignis einplanen' });
  await panel.getByLabel('Ereignis', { exact: true }).fill('Urlaub');
  await panel.getByLabel('Datum / Beginn', { exact: true }).fill('2026-11-15');
  await panel.getByLabel('Betrag je Termin', { exact: true }).fill('300,01');
  await panel.getByLabel('Kategorie', { exact: true }).selectOption({ label: 'Reisen' });
  await panel.getByRole('button', { name: 'Ereignis speichern' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByTestId('scenario-year-effect')).toHaveText('−300,01 €');
  await page.getByRole('button', { name: 'Urlaub bearbeiten', exact: true }).click();
  panel = page.getByRole('dialog', { name: 'Ereignis bearbeiten' });
  await panel.getByLabel('Datum / Beginn', { exact: true }).fill('2026-10-31');
  await panel.getByLabel('Betrag je Termin', { exact: true }).fill('100,01');
  await panel.getByLabel('Wiederholung', { exact: true }).selectOption('monthly');
  await panel.getByLabel('Ende einschließlich', { exact: true }).fill('2026-12-31');
  await inspect(page, info, 'year-event-panel');
  await panel.getByRole('button', { name: 'Ereignis speichern' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('9.699,97 €');
  await expect(page.getByRole('button', { name: 'Urlaub bearbeiten', exact: true })).toBeFocused();
  await expect(page.getByTestId('scenario-year-effect')).toHaveText('−300,03 €');
  if (info.project.name === 'mobile') {
    await expect(page.locator('.event-phone-row')).toContainText('Reisen');
    await expect(page.locator('.event-phone-row')).toContainText('Monatlich');
    await expect(page.locator('.event-phone-row')).toContainText('−100,01 €');
  }
  const scenarioWrites: string[] = [];
  const listener = (r: Request) => {
    if (r.url().includes('/api/') && r.method() !== 'GET') scenarioWrites.push(r.method());
  };
  page.on('request', listener);
  await page.getByRole('button', { name: 'Ohne Auswahl' }).click();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('10.000,00 €');
  await page.getByRole('button', { name: 'Mit Auswahl' }).click();
  await page.getByRole('checkbox', { name: 'Urlaub im Szenario' }).uncheck();
  await expect(page.getByTestId('scenario-year-effect')).toHaveText('0,00 €');
  await page.getByRole('checkbox', { name: 'Urlaub im Szenario' }).check();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('9.699,97 €');
  page.off('request', listener);
  expect(scenarioWrites).toEqual([]);
  await inspect(page, info, 'year-events');
  await page.getByRole('button', { name: 'Urlaub bearbeiten', exact: true }).click();
  await panel.getByLabel('Ereignis eingeschaltet').uncheck();
  await panel.getByRole('button', { name: 'Ereignis speichern' }).click();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('10.000,00 €');
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('9.699,97 €');
  await page.getByRole('button', { name: 'Wiederholen', exact: true }).click();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('10.000,00 €');
  await page.getByRole('button', { name: 'Urlaub bearbeiten', exact: true }).click();
  await panel.getByLabel('Ereignis eingeschaltet').check();
  await panel.getByRole('button', { name: 'Ereignis speichern' }).click();
  await page.getByRole('button', { name: 'Urlaub bearbeiten', exact: true }).click();
  await panel.getByRole('button', { name: 'Ereignis entfernen' }).click();
  await panel.getByRole('button', { name: 'Entfernen bestätigen' }).click();
  await expect(page.getByRole('button', { name: 'Urlaub bearbeiten' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect(page.getByTestId('scenario-year-end')).toHaveText('9.699,97 €');
  const report = await page.request.get('/api/liquidity?horizon=6m');
  expect(report.ok()).toBe(true);
  expect((await report.json()).report.eventMarks).toEqual([
    { day: '2026-10-31', label: 'Urlaub', cents: -10_001 },
    { day: '2026-11-30', label: 'Urlaub', cents: -10_001 },
    { day: '2026-12-31', label: 'Urlaub', cents: -10_001 },
  ]);
  await page.getByRole('link', { name: 'Liquiditätsprognose · 3.1' }).click();
  await expect(
    page.getByRole('heading', { name: 'Liquiditätsprognose', exact: true }),
  ).toBeVisible();
  expect(financialWrites).toEqual([]);
});

test('year event form: dirty close and browser Back protect changes, failed write preserves input', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
  await page.goto('/plan/jahr?monat=2026-11');
  await page.getByRole('button', { name: 'Ereignis einplanen', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Ereignis einplanen' });
  await panel.getByLabel('Ereignis', { exact: true }).fill('Steuerausgleich');
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Verwerfen', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await page.goBack();
  await expect(panel.getByRole('button', { name: 'Verwerfen', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await panel.getByLabel('Art', { exact: true }).selectOption('1');
  await panel.getByLabel('Betrag je Termin', { exact: true }).fill('123,45');
  await panel.getByLabel('Wiederholung', { exact: true }).selectOption('monthly');
  await panel.getByLabel('Ende einschließlich', { exact: true }).fill('2026-11-02');
  await panel.getByLabel('Wiederholung', { exact: true }).selectOption('once');
  await panel.getByLabel('Datum / Beginn', { exact: true }).fill('2026-12-01');
  let attemptedSave = false;
  await page.route('**/api/liquidity/events', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attemptedSave = true;
    expect(route.request().postDataJSON().recurrenceUntil).toBeNull();
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unavailable', message: 'Synthetic write failure' }),
    });
  });
  await panel.getByRole('button', { name: 'Ereignis speichern' }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  expect(attemptedSave).toBe(true);
  await expect(panel.getByLabel('Ereignis', { exact: true })).toHaveValue('Steuerausgleich');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Ereignis einplanen', exact: true })).toBeFocused();
});
