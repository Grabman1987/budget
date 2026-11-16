import { expect, type Locator } from '@playwright/test';
import { test } from './isolated-ledger';
import { captureCloseControl, redesignLoaded } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-02' });

async function hasToken(icon: Locator, token: string) {
  await expect(icon).toBeVisible();
  await expect
    .poll(() =>
      icon.evaluate((element, name) => {
        const probe = document.createElement('span');
        probe.style.color = `var(--${name})`;
        element.parentElement!.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(element).color === expected;
      }, token),
    )
    .toBe(true);
}

test('booking glyph colours survive themes, hover, checked rows, selection and capture', async ({
  page,
  request,
  baseURL,
}, info) => {
  const post = async (path: string, data: unknown) => {
    const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', {
    name: 'Status Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 0,
  });
  const book = (date: string, status: string) =>
    post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date,
      status,
      amountCents: 100,
      payeeName: 'Status Muster',
    });
  const locked = await book('2026-09-30', 'confirmed');
  await post(`/accounts/${account.id}/reconciliation`, {
    date: '2026-09-30',
    statementBalanceCents: 100,
  });
  const cleared = await book('2026-10-01', 'confirmed');
  await book('2026-10-02', 'pending');

  for (const url of [`/konten/${account.id}`, '/konten/buchungen']) {
    await page.goto(url);
    expect(await redesignLoaded(page)).toBe(true);
    const confirmed = page.locator(`[data-booking="${cleared.id}"]`);
    const reconciled = page.locator(`[data-booking="${locked.id}"]`);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      await hasToken(confirmed.locator('.booking-status-confirmed'), 'good');
      await hasToken(reconciled.locator('.booking-status-reconciled'), 'ink');
      if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
        await confirmed.locator('.kstatus-btn').hover();
        await hasToken(confirmed.locator('.booking-status-confirmed'), 'good');
        await reconciled.locator('.kstatus-btn').hover();
        await hasToken(reconciled.locator('.booking-status-reconciled'), 'ink');
      }
      if (url === '/konten/buchungen') {
        if (info.project.name !== 'desktop')
          await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
        await confirmed.getByRole('checkbox').check();
        await reconciled.getByRole('checkbox').check();
        await expect(confirmed).toHaveClass(/is-selected/);
        await expect(reconciled).toHaveClass(/is-selected/);
        await hasToken(confirmed.locator('.booking-status-confirmed'), 'good');
        await hasToken(reconciled.locator('.booking-status-reconciled'), 'ink');
        if (info.project.name !== 'desktop')
          await page.getByRole('button', { name: 'Auswahl beenden', exact: true }).click();
        else {
          await confirmed.getByRole('checkbox').uncheck();
          await reconciled.getByRole('checkbox').uncheck();
        }
      }
      await confirmed.getByRole('button', { name: / bearbeiten · / }).click();
      const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
      await hasToken(dialog.locator('.booking-status-confirmed'), 'good');
      await captureCloseControl(dialog).click();
    }
  }
});
