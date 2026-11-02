import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';
import { MIN_TARGET_PX } from './ledger-helpers';

test.use({ ledgerToday: '2026-10-15' });

for (const theme of ['light', 'dark'] as const) {
  test(`E0 retains contact identity/history through Settings create, cancel, rename and Undo (${theme})`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    const post = async <T>(path: string, data: unknown) => {
      const response = await request.post(`/api${path}`, { headers: { origin: baseURL! }, data });
      expect(response.ok()).toBe(true);
      return response.json() as Promise<T>;
    };
    const { contact } = await post<{ contact: { id: string; name: string } }>('/contacts', {
      name: 'Synthetic retained contact',
    });
    const { account } = await post<{ account: { id: string } }>('/accounts', {
      name: 'Synthetic contact funds',
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 10000,
    });
    const { group } = await post<{ group: { id: string } }>('/categories/groups', {
      name: 'Synthetic contact group',
    });
    const { category } = await post<{ category: { id: string } }>('/categories', {
      name: 'Synthetic contact advance',
      groupId: group.id,
      kind: 'advance',
      class: null,
    });
    const { bookings } = await post<{ bookings: { id: string }[] }>('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-09-01',
      amountCents: -2300,
      status: 'confirmed',
      splits: [{ categoryId: category.id, contactId: contact.id, amountCents: -2300 }],
    });
    await post(`/contacts/${contact.id}/settlements`, {
      accountId: account.id,
      date: '2026-09-02',
      amountCents: 2300,
    });
    const read = async (api: APIRequestContext, path: string) => {
      const response = await api.get(`/api${path}`);
      expect(response.ok()).toBe(true);
      return response.json() as Promise<unknown>;
    };
    const beforeBooking = await read(request, `/bookings/${bookings[0]!.id}`);
    expect(beforeBooking).toMatchObject({
      booking: { id: bookings[0]!.id, status: 'confirmed', amountCents: -2300 },
    });
    const beforeHistory = await read(request, `/contacts/${contact.id}`);
    expect(beforeHistory).toMatchObject({
      contact: { id: contact.id, name: contact.name },
      balanceCents: 0,
      creditCents: 0,
    });
    const mutations: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') && request.method() !== 'GET')
        mutations.push(`${request.method()} ${path}`);
    });
    const bookmark = `/einstellungen/kontakte?monat=2026-10&period=month&verlauf=1#synthetic-source`;
    await page.goto('/einstellungen');
    const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
    const navigation = page.getByRole('navigation', { name: 'Einstellungen', exact: true });
    await expect(navigation).toBeVisible();
    if (on) {
      await navigation.getByRole('link', { name: 'Kontakte', exact: true }).click();
      await expect(page.getByRole('table', { name: 'Kontakt-Stammdaten' })).toContainText(
        contact.name,
      );
    } else {
      await expect(navigation.getByRole('link', { name: 'Kontakte', exact: true })).toHaveCount(0);
    }
    await page.goto(bookmark);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (on) {
      await expect(page.getByRole('table', { name: 'Kontakt-Stammdaten' })).toContainText(
        contact.name,
      );
      await expect(page.getByText(contact.id, { exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Saldo', exact: true })).toHaveCount(0);
      if (page.viewportSize()!.width >= 768)
        await expect(
          navigation.getByRole('link', { name: 'Kontakte', exact: true }),
        ).toHaveAttribute('aria-current', 'page');
      else await expect(page.locator('.settings-here')).toHaveText('Kontakte');
    } else {
      await expect(page).toHaveURL(/\/konten\/kontakte\?/);
      await expect(page.getByRole('link', { name: contact.name, exact: true })).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Einstellungen', exact: true }),
      ).toHaveCount(0);
    }
    const trigger = page.getByRole('button', { name: `${contact.name} umbenennen`, exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    const rename = page.getByRole('dialog', { name: 'Kontakt umbenennen', exact: true });
    await expect(rename.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
    await rename
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill('Synthetic cancelled draft');
    await rename.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(rename).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: `${contact.name} umbenennen`, exact: true }),
    ).toBeFocused();
    expect(mutations).toEqual([]);
    expect(await read(request, `/bookings/${bookings[0]!.id}`)).toEqual(beforeBooking);
    expect(await read(request, `/contacts/${contact.id}`)).toEqual(beforeHistory);

    await page.getByRole('button', { name: 'Neuer Kontakt', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Neuer Kontakt', exact: true });
    await create
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill('  Synthetic created contact  ');
    await create.getByRole('button', { name: 'Kontakt anlegen', exact: true }).click();
    await expect(create).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Synthetic created contact umbenennen', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: `${contact.name} umbenennen`, exact: true }).click();
    await rename
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill('  Synthetic renamed contact  ');
    await rename.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(rename).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Synthetic renamed contact umbenennen', exact: true }),
    ).toBeVisible();
    await page
      .locator('.toast')
      .filter({ hasText: 'Kontakt umbenannt.' })
      .getByRole('button', { name: 'Rückgängig', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: `${contact.name} umbenennen`, exact: true }),
    ).toBeVisible();
    expect(mutations).toEqual([
      'POST /api/contacts',
      `PATCH /api/contacts/${contact.id}`,
      'POST /api/undo',
    ]);
    expect(await read(request, `/bookings/${bookings[0]!.id}`)).toEqual(beforeBooking);
    expect(await read(request, `/contacts/${contact.id}`)).toEqual(beforeHistory);

    const widths = page.viewportSize()!.width < 768 ? [page.viewportSize()!.width, 320] : [1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: page.viewportSize()!.height });
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0.5);
      if (on)
        for (const target of await page
          .locator('.contact-settings button, .contact-settings a')
          .all()) {
          if (!(await target.isVisible())) continue;
          const box = await target.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
          expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
        }
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`contacts-${on ? 'on' : 'off'}-${width}-${theme}.png`),
      });
    }
    if (on) {
      await page.getByRole('link', { name: `Verlauf öffnen ${contact.name}`, exact: true }).click();
      await expect(
        page.getByRole('region', { name: 'Kontaktkontoauszug', exact: true }),
      ).toContainText(contact.name);
      await expect(page).toHaveURL(new RegExp(`/konten/kontakte/${contact.id}\\?.*verlauf=1`));
      await page.goBack();
      await expect(page.getByRole('table', { name: 'Kontakt-Stammdaten' })).toContainText(
        contact.name,
      );
      await expect(page).toHaveURL(new RegExp('/einstellungen/kontakte\\?.*#synthetic-source$'));
      await page.reload();
      await expect(
        page.getByRole('button', { name: `${contact.name} umbenennen`, exact: true }),
      ).toBeVisible();
    }
    expect(mutations).toEqual([
      'POST /api/contacts',
      `PATCH /api/contacts/${contact.id}`,
      'POST /api/undo',
    ]);
  });
}
