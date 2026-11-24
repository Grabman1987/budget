import { expect, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { test } from './isolated-ledger';
import { bookingSearch } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-18' });

async function seed(request: APIRequestContext, origin: string) {
  const accounts = [];
  for (const suffix of ['A', 'B']) {
    const response = await request.post('/api/accounts', {
      headers: { origin },
      data: {
        name: `Navigation Muster ${suffix}`,
        type: 'checking',
        openingDate: '2026-01-01',
        openingBalanceCents: 10000,
      },
    });
    expect(response.ok()).toBe(true);
    const { account } = await response.json();
    const booking = await request.post('/api/bookings', {
      headers: { origin },
      data: {
        type: 'booking',
        accountId: account.id,
        date: '2026-10-17',
        amountCents: -123,
        payeeName: `Laden Muster ${suffix}`,
        status: 'confirmed',
      },
    });
    expect(booking.ok()).toBe(true);
    accounts.push(account);
  }
  return accounts;
}

async function openRegister(page: Page, path: string) {
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/bookings' && url.searchParams.has('to');
    }),
    page.goto(path),
  ]);
}

async function openEditor(page: Page) {
  const button = page.locator('[data-booking] .kname-btn');
  await button.focus();
  await button.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toBeVisible();
}

async function clientNavigate(page: Page, path: string) {
  // Exercise the same client-side history navigation as a link, including back/forward handling.
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[?]/g, '\\?') + '$'));
}

test('expired route guard removes old account actions and a failed guard offers retry', async ({
  page,
  request,
  baseURL,
}) => {
  const [a, b] = await seed(request, baseURL!);
  await openRegister(page, `/konten/${a.id}`);
  await expect(page.locator('[data-booking]')).toHaveCount(1);
  await openEditor(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = false;
  await page.route('**/api/auth/status', async (route) => {
    reached = true;
    await gate;
    await route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } });
  });
  await page.clock.setFixedTime(new Date('2026-10-18T12:01:00+02:00'));
  await clientNavigate(page, `/konten/${b.id}`);
  await expect.poll(() => reached).toBe(true);
  try {
    await expect(page.locator('[data-booking]:visible')).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Seitendaten' })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toContainText('Seitendaten konnten nicht geladen werden.');
  await expect(page.locator('[data-booking]')).toHaveCount(0);
  await page.unroute('**/api/auth/status');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.locator('[data-booking]')).toHaveCount(1);
  await expect(page.locator('[data-booking]')).toContainText('Laden Muster B');
});

for (const filtered of [false, true]) {
  test(`${filtered ? 'booking filter' : 'account'} changes hide previous rows and editors during slow and failed reads`, async ({
    page,
    request,
    baseURL,
  }) => {
    const [a, b] = await seed(request, baseURL!);
    const target = (id: string) => (filtered ? `/konten/buchungen?konto=${id}` : `/konten/${id}`);
    await openRegister(page, target(a.id));
    await expect(page.locator('[data-booking]')).toHaveCount(1);
    await openEditor(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached = false;
    let fail = true;
    const handler = async (route: Route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('accountId') !== b.id) return route.continue();
      reached = true;
      await gate;
      if (fail) await route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } });
      else await route.continue();
    };
    await page.route('**/api/bookings?*', handler);
    await clientNavigate(page, target(b.id));
    await expect.poll(() => reached).toBe(true);
    try {
      await expect(page.locator('[data-booking]')).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.getByRole('alert').first()).toContainText('konnten nicht geladen werden');
    await expect(page.locator('[data-booking]')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Erneut versuchen' }).first().click();
    await expect(page.locator('[data-booking]')).toHaveCount(1);
    await expect(page.locator('[data-booking]')).toContainText('Laden Muster B');
    await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toHaveCount(0);
    await page.unroute('**/api/bookings?*', handler);
    await clientNavigate(page, '/einstellungen/datenquellen');
    await expect(page.locator('[data-booking]')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Verbindungen', exact: true }).first(),
    ).toBeVisible();
  });
}

test('same-page search keeps its input state and focus after a delayed guard', async ({
  page,
  request,
  baseURL,
}) => {
  await seed(request, baseURL!);
  await openRegister(page, '/konten/buchungen');
  await expect(page.locator('[data-booking]')).toHaveCount(2);
  const input = await bookingSearch(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached = false;
  await page.route('**/api/auth/status', async (route) => {
    reached = true;
    await gate;
    await route.continue();
  });
  await page.clock.setFixedTime(new Date('2026-10-18T12:01:00+02:00'));
  await input.fill('Laden');
  await expect.poll(() => reached).toBe(true);
  release();
  await expect(input).toHaveValue('Laden');
  await expect(input).toBeFocused();
  await input.press('End');
  await input.pressSequentially(' Muster');
  await expect(page).toHaveURL(/q=Laden(%20|\+)Muster/);
});
