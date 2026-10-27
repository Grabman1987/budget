// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { analyseSpending } from '@budget/domain';
import { spendingGroups } from './spending-analysis-report';

it('groups the complete signed breakdown by IDs, including beyond six rows and zero, with literal equality', () => {
  const categories=Array.from({length:7},(_,i)=>({id:`c${i}`,name:`Category${i}`,groupId:'g',groupName:'Same label',class:'need' as const}));
  categories.push({id:'refund',name:'Refund',groupId:'other',groupName:'Same label',class:'need'});
  categories.push({id:'zero',name:'Zero',groupId:'other',groupName:'Same label',class:'need'});
  const analysis=analyseSpending({categories,spend:{'2026-09':{c0:100,c1:200,c2:300,c3:400,c4:500,c5:600,c6:700,refund:-555}},months:['2026-09'],previousMonths:null,available:['2026-09']});
  const data={...analysis,answerComparison:{from:'2026-09-01',to:'2026-09-30',days:30,previousFrom:'2026-08-02',previousTo:'2026-08-31',rows:categories.map(c=>({id:c.id,previousCents:0})),previousCents:0}};
  const groups=spendingGroups(data);
  expect(analysis.consumptionCents).toBe(2245);
  expect(groups.map(group=>[group.id,group.cents])).toEqual([['g',2800],['other',-555]]);
  expect(groups[0]!.rows).toHaveLength(7);
  expect(groups[1]!.rows.map(row=>row.cents).sort((a,b)=>a-b)).toEqual([-555,0]);
  expect(groups.reduce((n,group)=>n+group.cents,0)).toBe(2245);
  expect(groups.flatMap(group=>group.rows).reduce((n,row)=>n+row.cents,0)).toBe(2245);
  expect(()=>spendingGroups({...data,consumptionCents:2246})).toThrow('Spending groups do not match');
});
