import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect, SAMPLE_URL } from './sample';

test('Today and inbox reminders open existing dialogs and include one-off plans through day 14', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const suffix = info.project.name;
  const created: string[] = [];
  const write = async (path: string, data: unknown, method = 'post') => {
    const response =
      method === 'put'
        ? await page.request.put('/api' + path, { data, headers: { origin: SAMPLE_URL } })
        : await page.request.post('/api' + path, { data, headers: { origin: SAMPLE_URL } });
    expect(response.ok(), await response.text()).toBe(true);
    const body = await response.json();
    const groupId = body.groupId ?? body.result?.groupId;
    if (groupId) created.push(groupId);
    return body;
  };
  try {
    const checking = await write('/accounts', {
      name: 'Synthetisches Prüfkonto ' + suffix,
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 1000,
    });
    const manual = await write('/accounts', {
      name: 'Synthetischer Sachwert ' + suffix,
      type: 'other_asset',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-01-01',
      openingBalanceCents: 1000,
    });
    for (const account of [checking.account, manual.account])
      await write('/bookings', {
        type: 'booking',
        accountId: account.id,
        date: '2026-08-01',
        amountCents: -100,
      });
    await write('/accounts/' + checking.account.id + '/reconciliation', {
      date: '2026-08-13',
      statementBalanceCents: 900,
    });
    await write(
      '/accounts/' + manual.account.id + '/valuation',
      { date: '2026-08-13', valueCents: 900 },
      'put',
    );
    for (const account of [checking.account, manual.account])
      for (const amountCents of [1, -1])
        await write('/bookings', {
          type: 'booking',
          accountId: account.id,
          date: '2026-08-14',
          amountCents,
          status: 'pending',
        });
    const event = await write('/liquidity/events', {
      name: 'Synthetisches Einmalereignis ' + suffix,
      date: '2026-10-01',
      amountCents: -12345,
    });
    await write('/liquidity/events', {
      name: 'Außerhalb der Vorschau ' + suffix,
      date: '2026-10-02',
      amountCents: -999,
    });
    await page.goto('/?monat=2026-09');
    const row = page.locator('.account-reminder').filter({ hasText: checking.account.name });
    await expect(page.getByRole('region', { name: 'Zu tun' })).toContainText(
      'Konten warten auf Prüfung',
    );
    const upcoming = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Fällig 14 Tage', exact: true }) });
    await expect(upcoming).toContainText(event.event.name);
    await expect(upcoming).toContainText('01.10.');
    await expect(upcoming).toContainText('−123,45');
    await expect(upcoming).not.toContainText('Außerhalb der Vorschau');
    await expect(upcoming).toContainText('Nur geplant');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (
          await new AxeBuilder({ page })
            .include('.account-reminders')
            .include('.heute-section:has(#heute-upcoming-title)')
            .analyze()
        ).violations,
      ).toEqual([]);
      const targets = await page
        .locator(
          '.account-reminder a, .heute-section:has(#heute-upcoming-title) .heute-account-preview',
        )
        .evaluateAll((links) =>
          links.map((link) => {
            const box = link.getBoundingClientRect();
            return { width: box.width, height: box.height };
          }),
        );
      expect(targets.filter((box) => box.width < 44 || box.height < 44)).toEqual([]);
      mkdirSync('docs/evidence/account-reminders-428', { recursive: true });
      await page.screenshot({
        path: 'test-results/account-reminders-' + suffix + '-' + theme + '.png',
        fullPage: true,
      });
    }
    await page
      .getByRole('region', { name: 'Zu tun' })
      .getByRole('link', { name: 'Prüfen', exact: true })
      .click();
    await expect(row).toContainText('Prüfung fällig seit 27.08.2026');
    await row.getByRole('link', { name: 'Kontostand prüfen' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Kontostand prüfen · ' + checking.account.name }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/konten/posteingang');
    const manualRow = page.locator('.account-reminder').filter({ hasText: manual.account.name });
    await expect(manualRow).toContainText('Prüfung fällig seit 13.09.2026');
    await manualRow.getByRole('link', { name: 'Wert aktualisieren' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Wert aktualisieren · ' + manual.account.name }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/?monat=2026-09');
    await page
      .locator('.heute-upcoming')
      .filter({ hasText: event.event.name })
      .getByRole('link')
      .click();
    await expect(page).toHaveURL(new RegExp('/plan/jahr\\?ereignis=' + event.event.id));
    await expect(page.getByRole('dialog', { name: 'Ereignis bearbeiten' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/einstellungen/profil');
    const setting = page.getByRole('region', { name: 'Kontoprüfung · Erinnerung' });
    await expect(setting).toContainText('14 Tagen');
    await expect(setting).toContainText('Kalendermonat');
    await expect(setting).toContainText('Ohne neue Buchungen');
    await expect(setting.getByLabel('Kontoprüfung erinnern nach (Tagen)')).toHaveCount(0);
    await expect(setting.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0);
    const savedSetting = await page.request.patch('/api/display-settings', {
      data: { accountReminderDays: 36 },
      headers: { origin: SAMPLE_URL },
    });
    expect(savedSetting.status()).toBe(200);
    const savedSettingBody = await savedSetting.json();
    const stored = await (await page.request.get('/api/display-settings')).json();
    expect(stored.accountReminderDays).toBe(36);
    await page.goto('/konten/posteingang');
    await expect(
      page.locator('.account-reminder').filter({ hasText: checking.account.name }),
    ).toContainText('Prüfung fällig seit 27.08.2026');
    expect(
      (
        await page.request.post('/api/undo', {
          data: { groupId: savedSettingBody.groupId },
          headers: { origin: SAMPLE_URL },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await page.request.get('/api/display-settings')).json()).accountReminderDays,
    ).toBe(35);
    await expect(
      page.locator('.account-reminder').filter({ hasText: checking.account.name }),
    ).toContainText('Prüfung fällig seit 27.08.2026');
  } finally {
    await page.request.patch('/api/display-settings', {
      data: { accountReminderDays: 35 },
      headers: { origin: SAMPLE_URL },
    });
    for (const groupId of created.reverse())
      expect(
        (
          await page.request.post('/api/undo', {
            data: { groupId },
            headers: { origin: SAMPLE_URL },
          })
        ).ok(),
      ).toBe(true);
  }
});
