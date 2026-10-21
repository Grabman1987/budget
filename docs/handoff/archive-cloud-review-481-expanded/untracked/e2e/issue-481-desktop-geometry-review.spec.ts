import { devices, expect } from '@playwright/test';
import { sampleTest as test, SAMPLE_NOW, SAMPLE_URL } from './sample';
import { STORAGE_STATE_SAMPLE } from '../playwright.config';
import { mkdirSync, writeFileSync } from 'node:fs';
test('review parent label bounds in actual desktop bands', async ({ browser }) => {
 const context=await browser.newContext({...devices['Desktop Safari'],viewport:{width:1440,height:900},isMobile:false,hasTouch:false,baseURL:SAMPLE_URL,storageState:STORAGE_STATE_SAMPLE,colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'});
 try {
 const page=await context.newPage();await page.clock.setFixedTime(new Date(SAMPLE_NOW));await page.goto('/plan/monat?monat=2026-09');await page.evaluate(()=>document.fonts.ready);
 await expect(page.locator('.pmulti')).toHaveCount(8);
 const result=await page.locator('.pmulti').evaluateAll(rows=>rows.map(row=>{
  const rect=(el:Element|null)=>el?{x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right}:null;
  const title=row.querySelector('.grp-title')!;const toggle=row.querySelector('.band-parent .grp-toggle')!;const plus=row.querySelector('.band-parent .plan-add')!;const check=row.querySelector('.col-name > .plan-select')!;
  const range=document.createRange();range.selectNodeContents(title);const text=range.getBoundingClientRect();
  const checkBox=check.getBoundingClientRect();const center=document.elementFromPoint(checkBox.x+checkBox.width/2,checkBox.y+checkBox.height/2);
  return {group:title.textContent,parent:rect(row.querySelector('.band-parent')),toggle:rect(toggle),title:rect(title),titleText:{x:text.x,right:text.right,y:text.y,height:text.height},plus:rect(plus),firstCategorySelection:rect(check),checkboxHit:center?.outerHTML,overflow:getComputedStyle(title).overflow,textOverflow:getComputedStyle(title).textOverflow};
 }));
 mkdirSync('test-results/review-481-geometry',{recursive:true});writeFileSync('test-results/review-481-geometry/geometry.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 } finally {await context.close();}
});
