import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-18' });

async function post(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(`/api${path}`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const card = (await page.locator('.kaccount-table-card').boundingBox())!;
  for (const cell of await page.locator('.ktx-account .kx-status').all()) {
    const box = (await cell.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1);
  }
}

test('compact account head, fixed desktop table and ten two-line phone bookings', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const { account } = await post(request, baseURL!, '/accounts', {
    name: 'Giro Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  // Five days with four bookings each: the phone density check must include the day heading rows.
  for (let i = 0; i < 20; i++)
    await post(request, baseURL!, '/bookings', {
      type: 'booking',
      accountId: account.id,
      date: `2026-10-${17 - (i % 5)}`,
      amountCents: -1234,
      payeeName: 'Laden Muster mit einem sehr langen Empfängernamen',
      status: 'confirmed',
      memo: 'Synthetic note that must not create a third phone line',
    });
  // Also exercise the collapsed Kommend section above the first booked row.
  await post(request, baseURL!, '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-20',
    amountCents: -200,
    payeeName: 'Später Muster',
  });
  await page.goto(`/konten/${account.id}`);
  const rows = page.locator('.ktx-account [data-booking]:not(.is-upcoming)');
  await expect(rows).toHaveCount(20);
  await expect(page.getByTestId('account-chart-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.kupcoming-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: account.name, exact: true })).toHaveCount(1);
  const review = page.getByTestId('account-review-badge');
  await expect(review).toHaveText('Nie geprüft – jetzt prüfen');
  await expect(page.getByTestId('account-balance')).toHaveText('753,20 €');
  const phone = info.project.name !== 'desktop';
  if (!phone) {
    // No scrolling: this proves the owner's first-viewport requirement at 1440 × 900.
    expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
    const first = (await rows.first().boundingBox())!;
    expect(first.y).toBeGreaterThanOrEqual(0);
    expect(first.y + first.height).toBeLessThanOrEqual(900);
    await expect(page.locator('.ktx-account')).toHaveCSS('table-layout', 'fixed');
    for (const row of await rows.all()) {
      const box = (await row.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(36);
      expect(box.height).toBeLessThanOrEqual(40);
    }
  }
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset['theme'] = t;
    }, theme);
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`account-${theme}.png`) });
    if (phone) {
      // Phone density is measured with the register in view; only desktop requires no scroll.
      await rows.first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
      const tenth = (await rows.nth(9).boundingBox())!;
      const tabbar = await page.locator('.tabbar').boundingBox();
      expect(tenth.y + tenth.height).toBeLessThanOrEqual(tabbar?.y ?? page.viewportSize()!.height);
      for (const row of await rows.all()) {
        const box = (await row.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeLessThanOrEqual(48);
      }
      for (const button of await rows.first().getByRole('button').all()) {
        if (!(await button.isVisible())) continue;
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.locator('.kaccount-day')).toHaveCount(5);
      await expect(page.locator('.kaccount-day').first()).toContainText('Saldo 753,20');
      await page.screenshot({ path: info.outputPath(`register-${theme}.png`) });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  }
  // The badge opens the existing reconciliation flow.
  await review.click();
  await expect(
    page.getByRole('dialog', { name: `Kontostand prüfen · ${account.name}` }),
  ).toBeVisible();
});

test('inline writes keep exact cents, undo and reconciled locks', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  const { account } = await post(request, baseURL!, '/accounts', {
    name: 'Schreiben Muster',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100000,
  });
  const { group } = await post(request, baseURL!, '/categories/groups', { name: 'Alltag Muster' });
  const { category } = await post(request, baseURL!, '/categories', {
    groupId: group.id,
    name: 'Einkauf Muster',
    kind: 'variable',
    class: 'need',
  });
  const { id } = await post(request, baseURL!, '/bookings', {
    type: 'booking',
    accountId: account.id,
    date: '2026-10-17',
    amountCents: -1234,
    payeeName: 'Laden Muster',
    status: 'confirmed',
  });
  await page.goto(`/konten/${account.id}`);
  const row = page.locator(`[data-booking="${id}"]`);
  const read = async () => {
    const response = await request.get(`/api/bookings?accountId=${account.id}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).items.find((b: { id: string }) => b.id === id);
  };
  const change = async (action: () => Promise<unknown>, expected: Record<string, unknown>) => {
    const saved = page.waitForResponse(
      (r) => r.url().endsWith(`/api/bookings/${id}`) && r.request().method() === 'PATCH',
    );
    await action();
    expect((await saved).ok()).toBe(true);
    await expect.poll(read).toMatchObject(expected);
    await page
      .locator('.toast.is-open')
      .getByRole('button', { name: 'Rückgängig', exact: true })
      .click();
    await expect.poll(read).toMatchObject({
      date: '2026-10-17',
      amountCents: -1234,
      status: 'confirmed',
      splits: [{ categoryId: null, amountCents: -1234 }],
    });
    await expect(page.getByTestId('account-balance')).toHaveText('987,66 €');
  };
  await change(
    async () => {
      await row.getByRole('button', { name: /^Betrag ändern/ }).click();
      await row.getByLabel('Betrag bearbeiten').fill('-12,35');
      await row.getByLabel('Betrag bearbeiten').press('Enter');
    },
    { amountCents: -1235, splits: [{ amountCents: -1235 }] },
  );
  await change(() => row.getByRole('button', { name: 'bestätigt', exact: true }).click(), {
    status: 'pending',
  });
  if (info.project.name === 'desktop') {
    await change(
      async () => {
        await row.getByRole('button', { name: /^Datum ändern/ }).click();
        await row.getByLabel('Datum bearbeiten').fill('2026-10-16');
        await row.getByLabel('Datum bearbeiten').press('Enter');
      },
      { date: '2026-10-16' },
    );
    await change(
      async () => {
        await row.getByRole('button', { name: /^Kategorie ändern/ }).click();
        await row.getByRole('combobox').selectOption(category.id);
      },
      { splits: [{ categoryId: category.id, amountCents: -1234 }] },
    );
  } else {
    await row.getByRole('button', { name: /bearbeiten$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  }
  await post(request, baseURL!, `/accounts/${account.id}/reconciliation`, {
    date: '2026-10-17',
    statementBalanceCents: 98766,
  });
  await page.reload();
  await expect(page.getByTestId('account-review-badge')).toHaveText('Geprüft 17.10.');
  await expect(row.getByRole('button', { name: /^Kategorie ändern/ })).toHaveCount(0);
  await expect(row.getByRole('img', { name: 'geprüft', exact: true })).toBeVisible();
  await row.getByRole('button', { name: /^Betrag ändern/ }).click();
  await expect(page.getByRole('dialog', { name: 'Buchung bearbeiten' })).toBeVisible();
  await expect(row.getByLabel('Betrag bearbeiten')).toHaveCount(0);
  expect(await read()).toMatchObject({ amountCents: -1234, status: 'reconciled' });
});
