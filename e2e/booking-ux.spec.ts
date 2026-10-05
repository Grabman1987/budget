import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';
import { pickCategory } from './ledger-helpers';

test('booking cells, cash capture, repetition and account preview on desktop and phone', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const headers = { origin: baseURL! };
  const post = async (path: string, data: unknown) => {
    const response = await request.post('/api' + path, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Bargeld Muster',
    type: 'cash',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
    overdraftLimitCents: 10000,
  });
  const { id } = await post('/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-01',
    amountCents: -1234,
    payeeName: 'Laden Muster',
  });
  await page.goto(`/konten/${account.id}`);
  const row = page.locator(`[data-booking="${id}"]`);
  await expect(row.getByRole('button', { name: 'bestätigt', exact: true })).toBeVisible();
  await expect(row.locator('.kflagbtn:not(.has-flag)')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(row.locator('.kflagbtn:not(.has-flag)')).toHaveCSS('opacity', '0.4');
  await row.getByRole('button', { name: /Datum ändern/ }).click();
  await row.getByLabel('Datum bearbeiten').fill('2026-10-02');
  await row.getByLabel('Datum bearbeiten').press('Escape');
  expect((await (await request.get('/api/bookings/' + id)).json()).booking.date).toBe('2026-10-01');
  await row.getByRole('button', { name: /Datum ändern/ }).click();
  await row.getByLabel('Datum bearbeiten').fill('2026-10-02');
  await row.getByLabel('Datum bearbeiten').press('Enter');
  await expect(row.getByLabel('Datum bearbeiten')).toHaveCount(0);
  await row.getByRole('button', { name: /Betrag ändern/ }).click();
  await row.getByLabel('Betrag bearbeiten').fill('0');
  await row.getByLabel('Betrag bearbeiten').press('Enter');
  await expect(row.getByRole('alert')).toContainText('ungleich 0');
  await row.getByLabel('Betrag bearbeiten').fill('-15,01');
  await row.getByLabel('Betrag bearbeiten').press('Tab');
  await expect(row.getByLabel('Betrag bearbeiten')).toHaveCount(0);
  expect((await (await request.get('/api/bookings/' + id)).json()).booking.amountCents).toBe(-1501);
  await row.getByRole('button', { name: 'bestätigt', exact: true }).click();
  await expect(row.getByRole('button', { name: 'vorgemerkt', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'vorgemerkt', exact: true }).click();
  await expect(row.getByRole('button', { name: 'bestätigt', exact: true })).toBeVisible();
  await row.locator('.kc-num').last().click();
  let panel = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Budgetmonat')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Status', exact: true })).toBeVisible();
  await panel.getByLabel('Wiederholen').selectOption('weekly');
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(panel).toBeHidden();
  const payments = (await (await request.get('/api/expected')).json()).payments;
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    name: 'Laden Muster',
    rhythm: 'weekly',
    startDate: '2026-10-09',
  });
  const chart = page.getByTestId('balance-chart').first();
  await expect(chart.locator('.l-forecast')).toBeVisible();
  await expect(chart.getByText(/Dispolimit/)).toBeVisible();
  await chart.getByRole('slider').focus();
  await chart.getByRole('slider').press('Home');
  await expect(chart.locator('.kchart-tooltip')).toBeVisible();
  for (const label of ['6M', '12M', 'Alles', '3M']) {
    await page
      .getByRole('group', { name: 'Saldoverlauf Zeitraum' })
      .getByRole('button', { name: label, exact: true })
      .click();
    await expect(chart).toBeVisible();
  }
  const selector = page.getByLabel('Zeitraum-Schnellauswahl');
  const presetBox = await page.getByRole('group', { name: 'Saldoverlauf Zeitraum' }).boundingBox();
  const customBox = await selector.boundingBox();
  expect(
    Math.abs(presetBox!.y + presetBox!.height - customBox!.y - customBox!.height),
  ).toBeLessThan(1);
  await selector.selectOption('custom');
  await page.getByLabel('Von', { exact: true }).fill('2026-07');
  await page.getByLabel('Bis', { exact: true }).fill('2026-09');
  await page.getByRole('button', { name: 'Anwenden', exact: true }).click();
  await expect(chart.locator('.l-forecast')).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Saldoverlauf Zeitraum' })
    .getByRole('button', { name: '3M', exact: true })
    .click();
  await expect(chart.locator('.l-forecast')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`account-${theme}.png`), fullPage: true });
  }
  const { group } = await post('/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post('/categories', {
    groupId: group.id,
    name: 'Bedarf Muster',
    kind: 'variable',
    class: 'need',
  });
  await page.goto(`/konten/${account.id}?panel=buchung`);
  panel = page.getByRole('dialog', { name: 'Buchung erfassen' });
  await expect(panel.getByRole('button', { name: 'bestätigt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.evaluate((d) => d.getAnimations().forEach((a) => a.finish()));
  const dateBox = await panel.getByLabel('Datum', { exact: true }).boundingBox();
  const statusBox = await panel.getByRole('group', { name: 'Status', exact: true }).boundingBox();
  expect(statusBox!.x).toBeGreaterThan(dateBox!.x);
  expect(Math.abs(statusBox!.y + statusBox!.height - dateBox!.y - dateBox!.height)).toBeLessThan(1);
  await panel.getByLabel('Betrag', { exact: true }).fill('2,03');
  await panel.getByLabel('Empfänger', { exact: true }).fill('Kiosk Muster');
  await pickCategory(panel, category.name);
  await panel.getByLabel('Wiederholen').selectOption('monthly');
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('capture.png') });
  await panel.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(panel).toBeHidden();
  expect((await (await request.get('/api/expected')).json()).payments).toHaveLength(2);
  await page.goto('/einstellungen/profil');
  const setting = page.getByRole('region', { name: 'Darstellung · Kontovorschau' });
  await expect(setting.getByLabel('Zukunftsvorschau (Tage)')).toHaveValue('35');
  await setting.getByLabel('Zukunftsvorschau (Tage)').fill('366');
  await setting.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(setting.getByRole('alert')).toContainText('0 bis 365');
  await setting.getByLabel('Zukunftsvorschau (Tage)').fill('0');
  await setting.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(setting.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await expect
    .poll(async () => (await (await request.get('/api/display-settings')).json()).futurePreviewDays)
    .toBe(0);
  await page.goto(`/konten/${account.id}`);
  await expect(page.getByTestId('balance-chart').first()).toBeVisible();
  await expect(page.locator('.l-forecast')).toHaveCount(0);
  await page.goto('/konten/buchungen');
  await expect(
    page.locator(`[data-booking="${id}"]`).getByRole('button', { name: /Betrag ändern/ }),
  ).toBeVisible();
});
