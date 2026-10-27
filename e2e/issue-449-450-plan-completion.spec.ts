import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { test } from './isolated-ledger';

test('449 all-target preview preserves view and filter, caps 200 cents to 100 plus 100, cancels without writing and exactly undoes',async({page,isolatedLedger},info)=>{
  const origin=isolatedLedger.origin;
  const send=async(method:string,path:string,data:unknown)=>{
    const response=await page.request.fetch(`${origin}/api${path}`,{method,headers:{origin},data});
    expect(response.ok(),await response.text()).toBe(true);
    return response.json();
  };
  await send('POST','/accounts',{name:'Synthetic preview cash',type:'checking',openingDate:'2026-10-01',openingBalanceCents:200});
  const {group}=await send('POST','/categories/groups',{name:'Synthetic preview targets'});
  const ids:string[]=[];
  for(const [name,amountCents] of [['Synthetic first',100],['Synthetic second',300]] as const){
    const {category}=await send('POST','/categories',{name,groupId:group.id,class:'need',kind:'variable',stage:2});
    ids.push(category.id);
    await send('PUT',`/categories/${category.id}/target`,{validFrom:'2026-10',target:{kind:'monthly',amountCents}});
  }
  const state=async()=>{
    const response=await page.request.get(`${origin}/api/budget/2026-10`);
    const data=await response.json() as BudgetMonthView;
    return [...ids.map(id=>data.summary.envelopes.find(row=>row.categoryId===id)!.assignedCents),data.summary.toBeAssignedCents];
  };
  expect(await state()).toEqual([0,0,200]);
  await page.goto('/plan/monat?monat=2026-10');
  const options=page.locator('.plan-menu-optionen');
  await options.locator('summary').click();
  await options.getByRole('button',{name:'Klassen',exact:true}).click();
  await page.getByRole('searchbox',{name:'Kategorie suchen',exact:true}).fill('Synthetic first');
  await expect(page).toHaveURL(/q=Synthetic/);
  const beforeURL=page.url();
  let writes=0;
  page.on('request',request=>{if(request.method()==='PUT'&&new URL(request.url()).pathname==='/api/budget/2026-10/assigned')writes++;});
  const dialog=page.getByRole('dialog',{name:'Alle Ziele füllen',exact:true});
  const open=async()=>{
    await page.locator('.plan-menu-verteilen > summary').click();
    await page.locator('.plan-menu-verteilen').getByRole('button',{name:'Alle Ziele füllen',exact:true}).click();
    await expect(dialog).toBeVisible();
  };
  await open();
  await expect(dialog.getByText('Synthetic first',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Synthetic second',{exact:true})).toBeVisible();
  await expect(dialog.locator('dd')).toHaveText(['1,00 €','1,00 €']);
  await expect(dialog.getByRole('button',{name:'2,00 € zuweisen',exact:true})).toBeEnabled();
  expect(await state()).toEqual([0,0,200]);
  expect(writes).toBe(0);
  for(const theme of ['light','dark']){
    await page.evaluate(value=>{document.documentElement.dataset['theme']=value;},theme);
    expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(info.project.name!=='desktop')for(const button of await dialog.getByRole('button').all()){
      const box=(await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({path:info.outputPath(`target-preview-${theme}.png`),fullPage:false,animations:'disabled'});
  }
  await dialog.getByRole('button',{name:'Abbrechen',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.plan-menu-verteilen > summary')).toBeFocused();
  await expect(page).toHaveURL(beforeURL);
  expect(await state()).toEqual([0,0,200]);
  expect(writes).toBe(0);
  await open();
  await dialog.getByRole('button',{name:'2,00 € zuweisen',exact:true}).dblclick();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.plan-menu-verteilen > summary')).toBeFocused();
  await expect.poll(state).toEqual([100,100,0]);
  expect(writes).toBe(1);
  await expect(page).toHaveURL(beforeURL);
  await options.locator('summary').click();
  await expect(options.getByRole('button',{name:'Klassen',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await page.locator('.toast.is-open').getByRole('button',{name:'Rückgängig',exact:true}).click();
  await expect.poll(state).toEqual([0,0,200]);
  await expect(page).toHaveURL(beforeURL);
});
