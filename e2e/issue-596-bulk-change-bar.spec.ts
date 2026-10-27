import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('596 native selected total, protected skips and one exact Undo', async ({ page, isolatedLedger }, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const account = (await post('/accounts', { name: 'Synthetic Giro', type: 'checking', openingDate: '2026-09-01' })).account;
  const protectedAccount = (await post('/accounts', { name: 'Synthetic protected', type: 'checking', openingDate: '2026-09-01' })).account;
  const contact = (await post('/contacts', { name: 'Synthetic contact' })).contact;
  const group = (await post('/categories/groups', { name: 'Synthetic group' })).group;
  const advance = (await post('/categories', { name: 'Auslagen', groupId: group.id, class: null, kind: 'advance' })).category;
  const booking = async (memo: string, amountCents: number, extra = {}) => post('/bookings', {
    type: 'booking', accountId: account.id, date: '2026-10-02', amountCents, memo, status: 'pending', ...extra,
  });
  const a = await booking('Synthetic expense', -1234);
  const b = await booking('Synthetic refund', 567, { flag: 'blue' });
  const locked = await booking('Synthetic reconciled', -890, { accountId: protectedAccount.id, status: 'confirmed' });
  await post(`/accounts/${protectedAccount.id}/reconciliation`, { date: '2026-10-02', statementBalanceCents: -890 });
  const linked = await booking('Synthetic linked', -300, { splits: [{ categoryId: advance.id, contactId: contact.id, amountCents: -300 }] });
  const ids = [a.id, b.id, locked.id, linked.id];
  const readRows = async () => {
    const response = await page.request.get(`${origin}/api/bookings?ids=${ids.join(',')}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).items;
  };
  const before = await readRows();
  await page.goto('/konten/buchungen');
  if (info.project.name !== 'desktop') await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  for (const id of ids) {
    const row = page.locator(`tr[data-booking="${id}"]`);
    if (info.project.name === 'desktop') await row.getByRole('checkbox').check();
    else await row.locator('.kname-btn').click();
  }
  const bar = page.getByRole('group', { name: 'Auswahl bearbeiten', exact: true });
  await expect(bar).toContainText('4 ausgewählt');
  await expect(bar).toContainText('−18,57 €');
  await expect(bar.getByRole('combobox', { name: 'Projekt für die Auswahl setzen' })).toBeEnabled();
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    if (info.project.name !== 'desktop') {
      const tabbar = await page.locator('.tabbar').boundingBox();
      const bounds = (await bar.boundingBox())!;
      expect(tabbar).not.toBeNull();
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(tabbar!.y);
      for (const control of await bar.locator('select, button, summary').all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.screenshot({ path: info.outputPath(`bulk-${info.project.name}-${theme}.png`), fullPage: false, animations: 'disabled' });
  }
  const response = page.waitForResponse((r) => r.url().endsWith('/api/bookings/bulk') && r.request().method() === 'POST');
  await bar.getByRole('combobox', { name: 'Markierung für die Auswahl setzen' }).selectOption('orange');
  const result = await (await response).json();
  expect(result.changed).toEqual([a.id, b.id]);
  expect(result.skipped.map((item: { id: string; reason: string }) => [item.id, item.reason])).toEqual([
    [locked.id, 'reconciled_locked'], [linked.id, 'linked_contact'],
  ]);
  await expect(bar).toContainText('2 ausgewählt');
  const report = page.getByRole('region', { name: 'Ergebnis der Sammeländerung' });
  await expect(report).toContainText('Synthetic reconciled');
  await expect(report).toContainText('Synthetic linked');
  const changed = await readRows();
  expect(changed.filter((row: { id: string }) => [locked.id, linked.id].includes(row.id))).toEqual(before.filter((row: { id: string }) => [locked.id, linked.id].includes(row.id)));
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(readRows).toEqual(before);
});
