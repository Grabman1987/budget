import { afterEach, expect, it } from 'vitest';
import { explorerTemplate, explorerTemplateSources, explorerTemplateSummaries } from '@budget/domain';
import { createTestDatabase } from '../client';
import { categoryGroup } from '../schema';
import { categories, createEntity } from './entities';
import { createBooking } from './bookings';
import { queryBookings } from './ledger-queries';
import { spendingReport } from './spending-report';
import { reportTables } from './report-tables';
import { seedBasics, testCtx } from './test-helpers';

const opened = createTestDatabase();
afterEach(() => opened.close());

it('retains every signed category and stable group, exact-day prior and matching group/Explorer sources', () => {
  const db=opened.db;
  seedBasics(db);
  createEntity(db,categoryGroup,{id:'same-name',name:'Fixkosten'},testCtx);
  categories.create(db,{id:'refund',name:'Netto-Erstattung',groupId:'same-name',class:'want'},testCtx);
  categories.create(db,{id:'zero',name:'Ohne Bewegung',groupId:'same-name',class:'need'},testCtx);
  categories.create(db,{id:'future',name:'Zukunft',groupId:'g',class:'future'},testCtx);
  const book=(date:string,amount:number,categoryId:string)=>createBooking(db,{
    accountId:'giro',date,amountCents:-amount,splits:[{categoryId,amountCents:-amount}],
  },testCtx);
  // September to the17th: prior17 days are August15..31, not the whole previous month.
  book('2026-08-14',99999,'miete');
  book('2026-08-15',1000,'miete');
  book('2026-08-31',500,'refund');
  book('2026-09-02',2000,'miete');
  book('2026-09-03',333,'essen');
  book('2026-09-04',444,'reise');
  book('2026-09-05',-555,'refund');
  book('2026-09-06',8888,'future');
  book('2026-09-18',77777,'miete');
  const data=spendingReport(db,'2026-09-17','2026-09..2026-09');
  expect(data.consumptionCents).toBe(2222);
  expect(data.breakdown.map(row=>[row.id,row.cents]).sort()).toEqual([
    ['essen',333],['miete',2000],['refund',-555],['reise',444],['zero',0],
  ].sort());
  expect(data.breakdown.find(row=>row.id==='refund')?.groupId).toBe('same-name');
  expect(data.answerComparison.previousFrom).toBe('2026-08-15');
  expect(data.answerComparison.previousTo).toBe('2026-08-31');
  expect(data.answerComparison.days).toBe(17);
  expect(data.answerComparison.previousCents).toBe(1500);
  const group=queryBookings(db,{categoryGroupId:'g',basis:'category-spending',from:'2026-09-01',to:'2026-09-17',limit:1},'2026-09-17');
  expect(group.total).toBe(3);
  expect(group.categorySpendingCents).toBe(2777);
  expect(queryBookings(db,{categoryGroupId:'same-name',from:'2026-09-01',to:'2026-09-17'},'2026-09-17').categorySpendingCents).toBe(-555);
  const tables=reportTables(db,{today:'2026-09-17',withSources:true});
  const facts={...tables,splits:tables.splits!};
  const exact=explorerTemplate(facts,{id:'heatmap',period:'2026-09..2026-09',exactWindow:true});
  expect(exact.months).toEqual(['2026-09']);
  expect(exact.rows.map(row=>[row.key,explorerTemplateSummaries(row).total]).sort()).toEqual([
    ['cat:essen',333],['cat:miete',2000],['cat:refund',-555],['cat:reise',444],['cat:zero',0],
  ].sort());
  expect(exact.rows.flatMap(row=>explorerTemplateSources(facts,exact,row.key,'summe')).reduce((n,row)=>n+row.cents,0)).toBe(2222);
  const ordinary=explorerTemplate(facts,{id:'heatmap',period:'2026-09..2026-09'});
  expect(ordinary.months).toHaveLength(12);
  expect(ordinary.rows.some(row=>row.key==='cat:refund')).toBe(false);
  const unavailable=spendingReport(db,'2026-09-17','Alles');
  expect(unavailable.answerComparison.previousCents).toBeNull();
  expect(unavailable.answerComparison.previousFrom).toBeNull();
});
