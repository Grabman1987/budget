import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { openDatabase, schema } from '@budget/db';
import { test } from './isolated-ledger';

test('597 immediate delete, protected explanation, paired bulk preview and exact grouped Undo', async ({
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
    await post('/accounts', {
      name: 'Synthetic delete Giro',
      type: 'checking',
      openingDate: '2026-09-01',
    })
  ).account;
  const partner = (
    await post('/accounts', {
      name: 'Synthetic delete Spar',
      type: 'savings',
      openingDate: '2026-09-01',
    })
  ).account;
  const protectedAccount = (
    await post('/accounts', {
      name: 'Synthetic delete protected',
      type: 'checking',
      openingDate: '2026-09-01',
    })
  ).account;
  const contact = (await post('/contacts', { name: 'Synthetic delete contact' })).contact;
  const group = (await post('/categories/groups', { name: 'Synthetic delete group' })).group;
  const advance = (
    await post('/categories', { name: 'Auslagen', groupId: group.id, class: null, kind: 'advance' })
  ).category;
  const expense = (memo: string, amountCents: number, extra = {}) =>
    post('/bookings', {
      type: 'booking',
      accountId: account.id,
      date: '2026-10-02',
      amountCents,
      memo,
      status: 'pending',
      ...extra,
    });
  const a = await expense('Synthetic delete expense', -1234);
  const b = await expense('Synthetic delete refund', 567);
  const locked = await expense('Synthetic delete reconciled', -890, {
    accountId: protectedAccount.id,
    status: 'confirmed',
  });
  await post(`/accounts/${protectedAccount.id}/reconciliation`, {
    date: '2026-10-02',
    statementBalanceCents: -890,
  });
  const linked = await expense('Synthetic delete linked', -300, {
    splits: [{ categoryId: advance.id, contactId: contact.id, amountCents: -300 }],
  });
  await post('/contacts/' + contact.id + '/settlements', {
    accountId: account.id,
    date: '2026-10-02',
    amountCents: 300,
  });
  const transfer = await post('/bookings', {
    type: 'transfer',
    fromAccountId: account.id,
    toAccountId: partner.id,
    date: '2026-10-02',
    amountCents: 2500,
  });
  const ids = [a.id, b.id, locked.id, linked.id, transfer.fromBookingId, transfer.toBookingId];
  const readRows = async () => {
    const response = await page.request.get(`${origin}/api/bookings?ids=${ids.join(',')}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).items;
  };
  const before = await readRows();
  await page.goto('/konten/buchungen');
  await page.locator(`tr[data-booking="${a.id}"] .kname-btn`).click();
  const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
  await edit.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('Gelöscht.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(readRows).toEqual(before);

  await page.locator(`tr[data-booking="${locked.id}"] .kname-btn`).click();
  await edit.getByRole('button', { name: 'Löschen', exact: true }).click();
  const blocked = page.getByRole('alertdialog', { name: 'Buchung löschen?' });
  await expect(blocked).toContainText('geprüft');
  const keepEditing = blocked.getByRole('button', { name: 'Weiter bearbeiten', exact: true });
  await expect(keepEditing).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keepEditing).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(keepEditing).toBeFocused();
  await expect(
    blocked.getByRole('button', { name: 'Löschen bestätigen', exact: true }),
  ).toHaveCount(0);
  await expect.poll(readRows).toEqual(before);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      const button = blocked.getByRole('button', { name: 'Weiter bearbeiten', exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(
        await button.evaluate((element) => {
          const r = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
      ).toBe(true);
    }
    await page.screenshot({
      path: info.outputPath(`delete-protected-${info.project.name}-${theme}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
  await blocked.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await edit.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(edit).not.toBeVisible();

  await page.locator(`tr[data-booking="${linked.id}"] .kname-btn`).click();
  await edit.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(blocked).toContainText('Kontakt');
  await expect(
    blocked.getByRole('button', { name: 'Löschen bestätigen', exact: true }),
  ).toHaveCount(0);
  await expect.poll(readRows).toEqual(before);
  await blocked.getByRole('button', { name: 'Weiter bearbeiten', exact: true }).click();
  await edit.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(edit).not.toBeVisible();
  if (info.project.name !== 'desktop')
    await page.getByRole('button', { name: 'Auswählen', exact: true }).click();
  for (const id of ids.slice(0, 5)) {
    const row = page.locator(`tr[data-booking="${id}"]`);
    if (info.project.name === 'desktop') await row.getByRole('checkbox').check();
    else await row.locator('.kname-btn').click();
  }
  const bar = page.getByRole('group', { name: 'Auswahl bearbeiten', exact: true });
  await bar.getByLabel('Weitere Aktionen', { exact: true }).click();
  await bar.getByRole('button', { name: 'Löschen', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Löschen bestätigen', exact: true });
  await expect(preview).toContainText('5 ausgewählt · 4 werden gelöscht · 2 bleiben erhalten.');
  await expect(preview).toContainText('Summe der Auswahl: −43,57 €');
  await expect(preview).toContainText('Summe der zu löschenden Buchungen: −6,67 €');
  await expect(preview).toContainText('nicht ausgewählten Gegenseiten');
  await expect(preview.getByRole('region', { name: 'Übersprungene Buchungen' })).toContainText(
    'Synthetic delete reconciled',
  );
  await expect(preview.getByRole('region', { name: 'Übersprungene Buchungen' })).toContainText(
    'Synthetic delete linked',
  );
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const facts = preview.getByRole('region', { name: 'Löschvorschau', exact: true });
    await facts.focus();
    await expect(facts).toBeFocused();
    if (await facts.evaluate((element) => element.scrollHeight > element.clientHeight)) {
      await facts.evaluate((element) => (element.scrollTop = 0));
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => facts.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    }
    await page.keyboard.press('Tab');
    await expect(preview.getByRole('button', { name: 'Abbrechen', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(facts).toBeFocused();
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    if (info.project.name !== 'desktop') {
      for (const button of await preview.getByRole('button').all()) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
        expect(
          await button.evaluate((element) => {
            const r = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        ).toBe(true);
      }
    }
    await page.screenshot({
      path: info.outputPath(`delete-${info.project.name}-${theme}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect.poll(readRows).toEqual(before);
  await bar.getByRole('button', { name: 'Löschen', exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/bookings/bulk') && r.request().method() === 'POST',
  );
  let releaseSummary!: () => void;
  const summaryBlocked = new Promise<void>((resolve) => { releaseSummary = resolve; });
  const summaryRoute = /\/api\/bookings\?/;
  await page.route(summaryRoute, async (route) => {
    await summaryBlocked;
    await route.continue();
  });
  const result = await (async () => {
    try {
      await preview.getByRole('button', { name: 'Ja, löschen', exact: true }).click();
      const value = await (await response).json();
      await expect(page.locator('p.ksum')).toContainText('Anzahl wird aktualisiert …');
      await expect(page.locator('p.ksum')).toContainText('Summe wird aktualisiert …');
      return value;
    } finally {
      releaseSummary();
      await page.unroute(summaryRoute);
    }
  })();
  expect(result.changed.sort()).toEqual(
    [a.id, b.id, transfer.fromBookingId, transfer.toBookingId].sort(),
  );
  expect(
    result.skipped.map((item: { id: string; reason: string }) => [item.id, item.reason]).sort(),
  ).toEqual(
    [
      [locked.id, 'reconciled_locked'],
      [linked.id, 'linked_contact'],
    ].sort(),
  );
  const retained = await readRows();
  expect(retained).toEqual(
    before.filter((row: { id: string }) => [locked.id, linked.id].includes(row.id)),
  );
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(readRows).toEqual(before);
  if (info.project.name !== 'desktop')
    await page.getByRole('button', { name: 'Auswahl beenden', exact: true }).click();
  await page.locator(`tr[data-booking="${transfer.fromBookingId}"] .kname-btn`).click();
  await edit.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(blocked).toContainText('Alle Seiten der Umbuchung');
  await expect(keepEditing).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    blocked.getByRole('button', { name: 'Löschen bestätigen', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keepEditing).toBeFocused();
  await blocked.getByRole('button', { name: 'Löschen bestätigen', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect
    .poll(async () => (await readRows()).map((row: { id: string }) => row.id).sort())
    .toEqual([a.id, b.id, locked.id, linked.id].sort());
  await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
  await expect.poll(readRows).toEqual(before);
});

test('597 cached account month hides retained native and dated EUR movements until canonical refetch', async ({page,isolatedLedger},info) => {
  const origin=isolatedLedger.origin;
  const post=async(path:string,data:unknown)=>{
    const response=await page.request.post(`${origin}/api${path}`,{headers:{origin},data});
    expect(response.ok(),await response.text()).toBe(true);
    return response.json();
  };
  const source=(await post('/accounts',{name:'Synthetic month source',type:'checking',openingDate:'2026-09-01'})).account;
  const partner=(await post('/accounts',{name:'Synthetic month partner',type:'savings',openingDate:'2026-09-01'})).account;
  const foreign=(await post('/accounts',{name:'Synthetic month USD',type:'savings',currency:'USD',onBudget:false,openingDate:'2026-09-30'})).account;
  const opened=openDatabase(isolatedLedger.databasePath);
  try {
    opened.db.insert(schema.fxRate).values([{currency:'USD',date:'2026-09-25',rateMicro:500000,source:'ecb'},{currency:'USD',date:'2026-10-02',rateMicro:750000,source:'ecb'}]).run();
  } finally {opened.close();}
  const pair=await post('/bookings',{type:'transfer',fromAccountId:source.id,toAccountId:partner.id,date:'2026-10-01',amountCents:1234});
  const unrelated=await post('/bookings',{type:'booking',accountId:partner.id,date:'2026-10-02',amountCents:444,memo:'Synthetic visible month row'});
  for (const [date,amountCents] of [['2026-10-01',-101],['2026-10-02',201],['2026-10-02',-10],['2026-10-02',100]] as const)
    await post('/bookings',{type:'booking',accountId:foreign.id,date,amountCents,memo:'Synthetic dated month movement'});
  const partnerFacts=await page.request.get(`${origin}/api/bookings?accountId=${partner.id}&from=2026-10-01&to=2026-10-31&limit=1`);
  expect(partnerFacts.ok()).toBe(true);
  const partnerPage=await partnerFacts.json();
  expect(partnerPage.items.map((row:{id:string})=>row.id)).toEqual([unrelated.id]);
  expect(partnerPage.total).toBe(2);
  expect(partnerPage.sumCents).toBe(1678);
  expect(partnerPage.sumEurCents).toBe(1678);
  const openAccount=async(id:string)=>{
    await page.getByRole('navigation',{name:'Register von Konten'}).getByRole('link',{name:'Übersicht',exact:true}).click();
    await page.locator(`main a[href="/konten/${id}"]`).first().click();
  };
  const month=page.locator('.kacct-month strong');
  await page.goto(`/konten/${partner.id}`);
  await expect(month).toContainText('+16,78 €');
  await openAccount(foreign.id);
  await expect(month).toContainText('USD 1,90');
  await expect(month).toContainText('+1,67 €');
  await page.getByRole('navigation',{name:'Register von Konten'}).getByRole('link',{name:'Buchungen',exact:true}).click();
  if (info.project.name !== 'desktop') await page.getByRole('button',{name:'Auswählen',exact:true}).click();
  const selected=page.locator(`tr[data-booking="${pair.fromBookingId}"]`);
  if (info.project.name === 'desktop') await selected.getByRole('checkbox').check();
  else await selected.locator('.kname-btn').click();
  const bar=page.getByRole('group',{name:'Auswahl bearbeiten',exact:true});
  await expect(bar.getByRole('combobox',{name:'Projekt für die Auswahl setzen'})).toBeEnabled();
  await bar.getByLabel('Weitere Aktionen',{exact:true}).click();
  await bar.getByRole('button',{name:'Löschen',exact:true}).click();
  const preview=page.getByRole('dialog',{name:'Löschen bestätigen',exact:true});
  await expect(preview).toContainText('1 ausgewählt · 2 werden gelöscht · 0 bleiben erhalten.');
  const blocked=new Map<string,Promise<void>>(), release=new Map<string,()=>void>(), seen=new Set<string>();
  for (const id of [partner.id,foreign.id]) blocked.set(id,new Promise<void>((resolve)=>{release.set(id,resolve);}));
  const monthlyRoute='**/api/bookings**';
  await page.route(monthlyRoute,async(route)=>{
    const url=new URL(route.request().url());
    const id=url.searchParams.get('accountId');
    if (route.request().method()==='GET' && url.pathname==='/api/bookings' && url.searchParams.get('limit')==='1' && id && blocked.has(id)) {
      seen.add(id);
      await blocked.get(id);
    }
    await route.continue();
  });
  try {
    const response=page.waitForResponse((row)=>row.url().endsWith('/api/bookings/bulk') && row.request().method()==='POST');
    await preview.getByRole('button',{name:'Ja, löschen',exact:true}).click();
    const result=await (await response).json();
    expect(result.changed.sort()).toEqual([pair.fromBookingId,pair.toBookingId].sort());
    for (const [id,currency] of [[partner.id,'EUR'],[foreign.id,'USD']] as const) {
      await openAccount(id);
      await expect.poll(()=>seen.has(id)).toBe(true);
      await expect(month).toHaveText('Bewegung wird aktualisiert …');
      await expect(month).not.toContainText('+16,78 €');
      await expect(month).not.toContainText('USD 1,90');
      await expect(month).not.toContainText('+1,67 €');
      await page.screenshot({path:info.outputPath(`account-month-pending-${currency}-${info.project.name}.png`),fullPage:false,animations:'disabled'});
      release.get(id)!();
      if (currency==='EUR') await expect(month).toHaveText('+4,44 €');
      else {
        await expect(month).toContainText('USD 1,90');
        await expect(month).toContainText('+1,67 €');
      }
    }
  } finally {
    release.forEach((finish)=>finish());
    await page.unroute(monthlyRoute);
  }
});
