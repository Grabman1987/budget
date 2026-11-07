import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('515 note preflight, protected skips and one exact Undo', async ({
  page,
  isolatedLedger,
}, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const account = (
    await post('/accounts', { name: 'Synthetic Giro', type: 'checking', openingDate: '2026-09-01' })
  ).account;
  const protectedAccount = (
    await post('/accounts', {
      name: 'Synthetic protected',
      type: 'checking',
      openingDate: '2026-09-01',
    })
  ).account;
  const contact = (await post('/contacts', { name: 'Synthetic contact' })).contact;
  const group = (await post('/categories/groups', { name: 'Synthetic group' })).group;
  const advance = (
    await post('/categories', { name: 'Auslagen', groupId: group.id, class: null, kind: 'advance' })
  ).category;
  const booking = async (memo: string, amountCents: number, extra = {}) =>
    post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-02',
      amountCents,
      memo,
      status: 'pending',
      ...extra,
    });
  const a = await booking('Synthetic expense', -1234);
  const b = await booking('Synthetic refund', 567, { flag: 'blue' });
  const locked = await booking('Synthetic reconciled', -890, {
    accountId: protectedAccount.id,
    status: 'confirmed',
  });
  await post(`/accounts/${protectedAccount.id}/reconciliation`, {
    date: '2026-10-02',
    statementBalanceCents: -890,
  });
  const linked = await booking('Synthetic linked', -300, {
    splits: [{ categoryId: advance.id, contactId: contact.id, amountCents: -300 }],
  });
  const ids = [a.id, b.id, locked.id, linked.id];
  const readRows = async () => {
    const response = await page.request.get(`${origin}/api/bookings?ids=${ids.join(',')}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).items;
  };
  const before = await readRows();
  await page.goto('/konten/buchungen');
  if (info.project.name !== 'desktop')
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  for (const id of ids) {
    const row = page.locator(`tr[data-booking="${id}"]`);
    if (info.project.name === 'desktop') await row.getByRole('checkbox').check();
    else await row.locator('.kname-btn').click();
  }
  const bar = page.getByRole('group', { name: 'Auswahl bearbeiten', exact: true });
  await expect(bar).toContainText('4 ausgewählt');
  await expect(bar).toContainText('−18,57 €');
  await expect(bar.getByRole('combobox', { name: 'Projekt für die Auswahl setzen' })).toBeEnabled();
  await bar.getByRole('button', { name: 'Notiz ändern', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Notiz gesammelt ändern', exact: true });
  await dialog.getByLabel('Neue Notiz').fill('Synthetic common note');
  await dialog.getByRole('button', { name: 'Änderungen prüfen', exact: true }).click();
  const preview = dialog.getByRole('region', { name: 'Vorschau der Notizänderung' });
  await expect(preview).toContainText('4 ausgewählt · 2 werden geändert · 2 geschützt');
  await expect(preview).toContainText('Synthetic reconciled');
  await expect(preview).toContainText('Synthetic linked');
  expect(await readRows()).toEqual(before);
  // Editing the value invalidates the confirmation until a fresh preview is requested.
  await dialog.getByLabel('Neue Notiz').fill('Synthetic revised note');
  await expect(dialog.getByRole('button', { name: 'Änderungen übernehmen' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Änderungen prüfen', exact: true }).click();
  await expect(preview).toContainText('Synthetic revised note');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`note-${info.project.name}-${theme}.png`),
      animations: 'disabled',
    });
  }
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/bookings/bulk') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Änderungen übernehmen', exact: true }).click();
  const result = await (await response).json();
  expect(result.changed).toEqual([a.id, b.id].sort());
  expect(
    new Map(result.skipped.map((item: { id: string; reason: string }) => [item.id, item.reason])),
  ).toEqual(
    new Map([
      [locked.id, 'reconciled_locked'],
      [linked.id, 'linked_contact'],
    ]),
  );
  await expect(bar).toContainText('2 ausgewählt');
  const report = page.getByRole('region', { name: 'Ergebnis der Sammeländerung' });
  await expect(report).toContainText('Synthetic reconciled');
  await expect(report).toContainText('Synthetic linked');
  const changed = await readRows();
  expect(
    changed
      .filter((row: { id: string }) => [a.id, b.id].includes(row.id))
      .map((row: { memo: string }) => row.memo),
  ).toEqual(['Synthetic revised note', 'Synthetic revised note']);
  expect(changed.filter((row: { id: string }) => [locked.id, linked.id].includes(row.id))).toEqual(
    before.filter((row: { id: string }) => [locked.id, linked.id].includes(row.id)),
  );
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(readRows).toEqual(before);
});
