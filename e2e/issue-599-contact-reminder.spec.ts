import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('599 Heute shows one overdue contact row and follows settlement and Undo', async ({
  page,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, {
      headers: { origin },
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const read = async (path: string) => {
    const response = await page.request.get(`${origin}/api${path}`);
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const group = (await post('/categories/groups', { name: 'Synthetische Auslagen' })).group;
  const advance = (
    await post('/categories', { name: 'Auslagen', groupId: group.id, class: null, kind: 'advance' })
  ).category;
  const account = (
    await post('/accounts', {
      name: 'Synthetisches Giro',
      type: 'checking',
      openingDate: '2026-09-01',
      openingBalanceCents: 100000,
    })
  ).account;
  const contact = (await post('/contacts', { name: 'Synthetischer Kontakt' })).contact;
  for (const [date, amountCents] of [
    ['2026-09-01', 3000],
    ['2026-09-02', 7000],
  ] as const)
    await post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date,
      amountCents: -amountCents,
      splits: [{ categoryId: advance.id, contactId: contact.id, amountCents: -amountCents }],
    });

  expect((await read('/heute')).attention.contactReminders).toEqual({
    items: [
      {
        contactId: contact.id,
        contactName: 'Synthetischer Kontakt',
        oldestDate: '2026-09-01',
        overdueCents: 3000,
      },
    ],
    unavailableCount: 0,
  });
  await page.goto('/');
  const tasks = page.getByRole('region', { name: 'Zu tun' });
  const row = tasks.locator('.attention-row').filter({ hasText: 'Synthetischer Kontakt' });
  await expect(row).toHaveCount(1);
  if (await row.isHidden()) await tasks.locator('.attention-remaining summary').click();
  await expect(row).toContainText('30,00 € seit 01.09.2026 offen');
  const link = row.getByRole('link', { name: 'Kontoblatt öffnen' });
  await expect(link).toHaveAttribute('href', `/konten/kontakte/${contact.id}`);

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    await tasks.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    if (info.project.name !== 'desktop') {
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: info.outputPath(`contact-reminder-${info.project.name}-${theme}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }

  await link.click();
  await expect(
    page.getByRole('heading', { name: 'Synthetischer Kontakt', exact: true }),
  ).toBeVisible();
  const payment = await post(`/contacts/${contact.id}/settlements`, {
    accountId: account.id,
    date: '2026-10-02',
    amountCents: 3000,
  });
  expect(
    (await read(`/contacts/${contact.id}`)).outlays.map(
      (item: { remainingCents: number }) => item.remainingCents,
    ),
  ).toEqual([0, 7000]);
  expect((await read('/heute')).attention.contactReminders.items).toEqual([]);
  await page.goto('/');
  await expect(
    page.getByText('Synthetischer Kontakt: 30,00 € seit 01.09.2026 offen'),
  ).toHaveCount(0);

  await post('/undo', { groupId: payment.groupId });
  expect((await read('/heute')).attention.contactReminders.items).toEqual([
    {
      contactId: contact.id,
      contactName: 'Synthetischer Kontakt',
      oldestDate: '2026-09-01',
      overdueCents: 3000,
    },
  ]);
  await page.reload();
  await expect(
    page.getByText('Synthetischer Kontakt: 30,00 € seit 01.09.2026 offen'),
  ).toHaveCount(1);
});
