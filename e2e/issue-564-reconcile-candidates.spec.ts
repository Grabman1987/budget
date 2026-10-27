import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('564 partial pending and duplicate candidates precede corrections, retain exact Undo and explicit zero locking',async({page,isolatedLedger},info)=>{
  const origin=isolatedLedger.origin;
  const post=async(path:string,data:unknown)=>{
    const response=await page.request.post(`${origin}/api${path}`,{headers:{origin},data});
    expect(response.ok(),await response.text()).toBe(true);
    return response.json();
  };
  const account=async(name:string)=>(await post('/accounts',{name,type:'checking',role:'budget',onBudget:true,openingDate:'2026-09-01',openingBalanceCents:100000})).account;
  const partial=await account('Synthetic partial candidate');
  const duplicates=await account('Synthetic duplicate candidates');
  const pending=await post('/bookings',{type:'booking',accountId:partial.id,date:'2026-09-30',amountCents:-3000,status:'pending',memo:'Synthetic partial payment'});
  for(let i=0;i<2;i++)await post('/bookings',{type:'booking',accountId:duplicates.id,date:'2026-09-30',amountCents:-1234,status:'confirmed',memo:'Synthetic twin'});
  const read=async(id:string)=>(await (await page.request.get(`${origin}/api/bookings?accountId=${id}&limit=200`)).json()).items;
  const beforePartial=await read(partial.id),beforeTwins=await read(duplicates.id);
  const check=page.getByRole('dialog',{name:/Kontostand prüfen/});
  const open=async(id:string,statement:string)=>{
    await page.goto(`/konten/${id}?pruefen=reconcile`);
    await expect(check).toBeVisible();
    await check.getByLabel('Stichtag',{exact:true}).fill('2026-09-30');
    await check.getByLabel('Saldo laut Bank',{exact:true}).fill(statement);
  };
  let postedChecks=0;
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/reconciliation'))postedChecks++;});
  await open(partial.id,'960');
  const pendingRow=check.getByTestId(`candidate-pending-${pending.id}`);
  await expect(pendingRow).toContainText('−30,00 €');
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).toHaveCount(0);
  await expect.poll(()=>read(partial.id)).toEqual(beforePartial);
  expect(postedChecks).toBe(0);
  for(const theme of ['light','dark']){
    await page.evaluate(value=>{document.documentElement.dataset['theme']=value;},theme);
    expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    if(info.project.name!=='desktop')for(const button of await pendingRow.getByRole('button').all()){
      await button.evaluate(element=>element.scrollIntoView({block:'center'}));
      const r=await button.boundingBox();
      expect(r!.width).toBeGreaterThanOrEqual(44);
      expect(r!.height).toBeGreaterThanOrEqual(44);
      expect(r!.x).toBeGreaterThanOrEqual(0);
      expect(r!.x+r!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(await button.evaluate(element=>{
        const r=element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      })).toBe(true);
    }
    await page.screenshot({path:info.outputPath(`pending-${info.project.name}-${theme}.png`),fullPage:false,animations:'disabled'});
  }
  await pendingRow.getByRole('button',{name:'Bestätigen',exact:true}).click();
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).toContainText('−10,00 €');
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).not.toContainText('−40,00 €');
  expect((await read(partial.id)).map((row:{status:string;amountCents:number})=>[row.amountCents,row.status])).toEqual([[-3000,'confirmed']]);
  expect(postedChecks).toBe(0);
  await check.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:'Rückgängig',exact:true}).click();
  await expect.poll(()=>read(partial.id)).toEqual(beforePartial);
  await open(duplicates.id,'987,66');
  const candidate=check.locator('[data-testid^="candidate-duplicate-"]').first();
  await expect(candidate).toContainText('−12,34 €');
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).toHaveCount(0);
  await candidate.getByRole('button',{name:'Ignorieren',exact:true}).click();
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).toContainText('+12,34 €');
  expect(await read(duplicates.id)).toEqual(beforeTwins);
  await candidate.getByRole('button',{name:'Ignorieren rückgängig',exact:true}).click();
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).toHaveCount(0);
  await candidate.getByRole('button',{name:'Doppelte Buchung entfernen',exact:true}).click();
  await expect(check.getByRole('button',{name:'Festschreiben (1)',exact:true})).toBeVisible();
  await expect(check.getByRole('button',{name:/Differenz ausgleichen/})).toHaveCount(0);
  expect(postedChecks).toBe(0);
  await check.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:'Rückgängig',exact:true}).click();
  await expect.poll(()=>read(duplicates.id)).toEqual(beforeTwins);
  await open(duplicates.id,'987,66');
  await check.locator('[data-testid^="candidate-duplicate-"]').first().getByRole('button',{name:'Doppelte Buchung entfernen',exact:true}).click();
  await check.getByRole('button',{name:'Festschreiben (1)',exact:true}).click();
  await expect(check).not.toBeVisible();
  const locked=await read(duplicates.id);
  expect(locked.map((row:{status:string;amountCents:number})=>[row.amountCents,row.status])).toEqual([[-1234,'reconciled']]);
  expect(postedChecks).toBe(1);
  const refused=await page.request.patch(`${origin}/api/bookings/${locked[0].id}`,{headers:{origin},data:{amountCents:-1235}});
  expect(refused.status()).toBe(409);
  expect(await read(duplicates.id)).toEqual(locked);
  await page.getByRole('button',{name:'Rückgängig',exact:true}).click();
  expect((await read(duplicates.id)).map((row:{status:string;amountCents:number})=>[row.amountCents,row.status])).toEqual([[-1234,'confirmed']]);
});
