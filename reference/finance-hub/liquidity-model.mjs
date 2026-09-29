import {resolveFutureExpense} from './future-expense.mjs';
import {today,dayAdd,monthAdd,previousWorkday,expandSchedule,flattenTransactions,isAdjustment} from './model.mjs';
import {cardPaymentMode} from './debt-policy.mjs';
import {contactCForecastEvents,fixedMonthlyContribution} from './contactC-model.mjs';
import {financialSettingsAt,resolveFinancialAssumptions} from './financial-assumptions.mjs';
import {dt} from './text-format.mjs';
import {isCardAccount,salaryAccount,isLoanScheduleName} from './account-roles.mjs';

const integer=Number.isSafeInteger;
const total=rows=>rows.reduce((n,x)=>n+x,0);
const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00Z'))&&new Date(s+'T12:00Z').toISOString().slice(0,10)===s;
const uniq=rows=>[...new Map(rows.map(r=>[r.id,r])).values()];

// Shared base-plan cells only. Scenario planMonths never drive real forecasts.
export function monthlyIncomeAssumption(settings,month,kind){
 const assumptions=resolveFinancialAssumptions(settings,month);settings=financialSettingsAt(settings,month);
 const aliases=kind==='salary'?['excel-8','salary-base']:['excel-9','contactC-base'],cells=settings.planMonths?.[month]||{},present=aliases.filter(key=>Object.hasOwn(cells,key)),fallback=kind==='salary'?settings.salary:fixedMonthlyContribution(settings,month);
 if(present.length){const values=present.map(key=>cells[key]),valid=values.every(n=>integer(n)&&n>=0)&&values.every(n=>n===values[0]);return {amountEURcents:valid?values[0]:null,sourceType:'plan-month',sourceId:`planMonths:${month}:${present.join(',')}`,rowId:present[0],month,overridden:true};}
 const customized=(settings.planRows||[]).filter(row=>aliases.includes(row.id));
 if(customized.length){const values=customized.map(row=>row.archived||row.startMonth&&month<row.startMonth||row.endMonth&&month>row.endMonth?0:row.amountEURcents),valid=values.every(n=>integer(n)&&n>=0)&&values.every(n=>n===values[0]);return {amountEURcents:valid?values[0]:null,sourceType:'plan-row',sourceId:'planRows:'+customized.map(r=>r.id).join(','),rowId:customized[0].id,month,overridden:true};}
 return {amountEURcents:integer(fallback)&&fallback>=0?fallback:null,sourceType:kind==='salary'?'salary':'contactC',sourceId:assumptions.revisionId?'financial-assumptions:'+assumptions.revisionId+':'+kind:kind==='salary'?'monthly-salary':'monthly-contactC-fixed',month,overridden:false};
}

export function liquidityAccounts(live,settings={},asOf=today()){
 const configured=settings.liquidity?.accountIds;
 return (live.accounts||[]).filter(a=>!a.closed&&cardPaymentMode(a,settings,asOf)!=='full-pay'&&(Array.isArray(configured)?configured.includes(a.id):!a.offbudget&&!isCardAccount(a,settings)));
}

export function liquidityForecast(live={},settings={},asOf=today(),days=45){
 if(!validDay(asOf)||!integer(days)||days<1||days>3660)throw Error('Ungültiger Prognosezeitraum.');
 const accounts=liquidityAccounts(live,settings,asOf),ids=new Set(accounts.map(a=>a.id)),all=new Map((live.accounts||[]).map(a=>[a.id,a])),cards=(live.accounts||[]).filter(a=>!a.closed&&cardPaymentMode(a,settings,asOf)==='full-pay');
 const cardIds=new Set(cards.map(a=>a.id)),payees=new Map((live.payees||[]).map(p=>[p.id,p]));
 const main=accounts.find(a=>a.id===settings.liquidity?.incomeAccountId)||salaryAccount(accounts,settings)||accounts[0];
 const from=dayAdd(asOf,1),to=dayAdd(asOf,days),warnings=[],events=[],missingAssumptions=[];
 const protectedBuffer=integer(settings.liquidity?.protectedBufferEURcents)&&settings.liquidity.protectedBufferEURcents>=0?settings.liquidity.protectedBufferEURcents:0;
 // Overdraft lines are credit, not cash: they never raise `available`, only the headroom before the bank blocks payments.
 const limits=settings.liquidity?.overdraftLimits||{},overdraftLimits=Object.fromEntries(accounts.filter(a=>integer(limits[a.id])&&limits[a.id]>0).map(a=>[a.id,limits[a.id]])),overdraftLimit=total(Object.values(overdraftLimits));
 const missingBalances=[...accounts,...cards].filter(a=>!integer(a.balance));
 if(!accounts.length)warnings.push('Keine liquiden Konten ausgewählt.');
 if(missingBalances.length)warnings.push('Kontostände fehlen: '+missingBalances.map(a=>a.name).join(', '));
 const tx=uniq(flattenTransactions(live.rawTransactions||live.transactions||[]).filter(t=>!t.tombstone));
 const add=e=>{if(validDay(e.date)&&e.date>=from&&e.date<=to&&integer(e.amountEURcents)&&!events.some(old=>old.id===e.id))events.push(e);};
 const resolvedFuture=(settings.futureExpenses||[]).map(item=>resolveFutureExpense(item,live,settings,asOf)),settledDates=new Set(resolvedFuture.filter(e=>['settled','manual-paid'].includes(e.settlement.status)&&e.scheduleId).map(e=>e.scheduleId+'|'+e.date)),conflictDates=new Set(resolvedFuture.filter(e=>e.settlementConflict&&e.scheduleId).map(e=>e.scheduleId+'|'+e.date));
 const schedules=live.schedules||[],coveredCategories=new Set();
 let salaryCovered=false,contactCCovered=false;
 for(const s of schedules){
  if(s.completed)continue;
  const p=payees.get(s.payee),target=p?.transfer_acct;
  if(!ids.has(s.account)&&!ids.has(target)&&!cardIds.has(s.account))continue;
  const salary=s.amount>0&&/gehalt|employer|\bGPI\b/i.test((s.name||'')+' '+(p?.name||''));
  const contactC=s.id===settings.contactC?.scheduleId||s.amount>0&&/contactC/i.test((s.name||'')+' '+(p?.name||''));
  // Configured component projections replace these schedules once, with provenance.
  if(salary&&(integer(settings.salary)||Object.values(settings.planMonths||{}).some(m=>Object.hasOwn(m,'excel-8')||Object.hasOwn(m,'salary-base')))){salaryCovered=true;continue;}
  if(contactC&&(settings.contactC||integer(settings.contribution))){contactCCovered=true;continue;}
  if(!integer(s.amount)){warnings.push('Betrag offen: '+(s.name||s.id));continue;}
  if(s.category)coveredCategories.add(s.category);
  if(s.next_date&&s.next_date<=asOf)warnings.push('Fälligkeit prüfen: '+(s.name||s.id)+' ('+dt(s.next_date)+'). Überfällige Termine werden nicht nochmals abgezogen.');
  let card=cards.find(a=>a.id===target);
  if(!card&&!target&&s.amount<0)card=cards.find(a=>String(s.name||'').toLowerCase().includes(a.name.toLowerCase()));
  const classification=card&&ids.has(s.account)&&s.amount<0?'card-settlement':target?'transfer':s.amount>0?'income':'expense';
  for(const date of expandSchedule(s,from,to)){
   if(tx.some(t=>t.schedule===s.id&&t.date===date)||settledDates.has(s.id+'|'+date)||conflictDates.has(s.id+'|'+date))continue;
   add({id:`schedule:${s.id}:${date}`,sourceType:'schedule',sourceId:s.id,date,name:s.name||p?.name||'Zahlung',accountId:s.account,counterpartyAccountId:target||card?.id||null,cardId:card?.id||null,amountEURcents:s.amount,classification,confidence:s.amountOp&&s.amountOp!=='is'?'estimate':'planned',categoryId:s.category||null});
  }
 }
 if(main){
  for(let offset=0;offset<=Math.ceil(days/28)+1;offset++){
   const month=monthAdd(asOf.slice(0,7)+'-01',offset).slice(0,7);
   const monthEnd=Number(dayAdd(monthAdd(month+'-01',1),-1).slice(8));
   const day=Math.max(1,Math.min(monthEnd,Number(financialSettingsAt(settings,month).salaryDay)||15));
   const date=previousWorkday(month+'-'+String(day).padStart(2,'0'));
   if(date>to)break;
   if(date<from)continue;
   const planned=monthlyIncomeAssumption(settings,month,'salary');
   if(planned.amountEURcents===null){missingAssumptions.push(planned);warnings.push('Gehaltsannahme offen oder widersprüchlich: '+month);continue;}
   if(planned.overridden)warnings.push('Gehalt '+month+' verwendet den gespeicherten Monatsplan; künftiges Einkommen bleibt eine Annahme.');
   if(planned.amountEURcents>0)add({id:'salary:'+date,sourceType:'salary',sourceId:planned.sourceId,planSourceType:planned.sourceType,date,name:'Gehalt',accountId:main.id,amountEURcents:planned.amountEURcents,classification:'income',confidence:'assumption'});
  }
 }
 if(main){
 const contactC=contactCForecastEvents(live,settings,asOf,days);warnings.push(...contactC.warnings);
  const replacedMonths=new Set();
  for(let offset=0;offset<=Math.ceil(days/28)+1;offset++){
   const month=monthAdd(asOf.slice(0,7)+'-01',offset).slice(0,7),date=dayAdd(monthAdd(month+'-01',1),-1);if(date>to)break;if(date<from)continue;
   const planned=monthlyIncomeAssumption(settings,month,'contactC');
   if(planned.amountEURcents===null){missingAssumptions.push(planned);replacedMonths.add(month);warnings.push('Kontakt Cs fixer Monatsbeitrag ist offen oder widersprüchlich: '+month);continue;}
   if(!planned.overridden)continue;
   replacedMonths.add(month);
   if(planned.amountEURcents===0)continue;
   const overview=contactC.overview,current=month===asOf.slice(0,7);
   // Current-month already received components must not be forecast again.
   if(current&&overview.configured&&(!overview.dataComplete||overview.paymentTiming!=='month-end'||!overview.rent?.matchingAvailable||!overview.audioSubscription?.matchingAvailable)){missingAssumptions.push(planned);warnings.push('Monatsplan für Kontakt C benötigt zuerst eindeutige bereits erhaltene Beiträge und Zahlungszeitpunkt.');continue;}
   const paid=current&&overview.configured?overview.rent.receivedEURcents+overview.audioSubscription.receivedEURcents:0;
   const remaining=Math.max(0,planned.amountEURcents-paid);
   if(remaining)add({id:'contactC:plan:'+date,sourceType:'contactC',sourceId:planned.sourceId,planSourceType:planned.sourceType,date,name:'Kontakt C · fixer Monatsplan',accountId:main.id,amountEURcents:remaining,classification:'income',confidence:'assumption',component:'fixed-plan'});
   warnings.push('Kontakt C '+month+' verwendet den fixen Monatsplan; offene Auslagen bleiben separat und werden nicht neu berechnet.');
  }
  for(const e of contactC.events)if(e.component==='outlays'||!replacedMonths.has(e.date.slice(0,7)))add({...e,id:e.id||'contactC:'+e.date+':'+e.component,sourceType:'contactC',sourceId:e.id||e.source,accountId:main.id,amountEURcents:e.amount,classification:'income',confidence:'expected'});
 }
 const future=resolvedFuture;
 const superseded=new Set(future.map(x=>x.legacyOneOffId).filter(Boolean));
 for(const item of [...(settings.oneOffs||[]).filter(x=>!superseded.has(x.id)),...future]){
  if(item.settlementConflict){warnings.push((item.name||'Planereignis')+': Zahlungszuordnung prüfen. '+item.settlement.conflicts.join(' '));if(item.date>=from&&item.date<=to)missingAssumptions.push({sourceType:'future-expense',sourceId:item.id,reason:'settlement-conflict'});continue;}
  if(item.needsForecast===false||item.status==='cancelled'||!item.settlement&&item.status==='paid'||item.scheduleId&&schedules.some(s=>s.id===item.scheduleId&&!s.completed))continue;
  const amount=item.amountEURcents??item.amount,date=item.date||item.dueDate,accountId=item.accountId||main?.id;
  if(!ids.has(accountId)&&!cardIds.has(accountId))continue;
  add({id:'future:'+item.id,sourceType:item.kind==='wish'?'wish':'future-expense',sourceId:item.id,date,name:item.name||'Einmalzahlung',amountEURcents:amount,accountId,classification:amount>0?'income':'expense',confidence:item.confirmed?'confirmed':'assumption',categoryId:item.categoryId||null});
 }
 if(integer(settings.extraRepayment)&&settings.extraRepayment>0){
  for(const e of [...events].filter(e=>e.sourceType==='schedule'&&isLoanScheduleName(e.name)&&e.amountEURcents<0))add({id:'extra:'+e.id,sourceType:'scenario',sourceId:e.sourceId,date:e.date,name:'Zusätzliche Tilgung',accountId:e.accountId,amountEURcents:-settings.extraRepayment,classification:'expense',confidence:'scenario'});
 }
 const reservations=(settings.liquidity?.reservations||[]).filter(r=>!r.closed&&ids.has(r.accountId)&&integer(r.amountEURcents)&&r.amountEURcents>0);
 const legacy=settings.trCashReservation;
 if(legacy&&ids.has(legacy.accountId)&&legacy.verified&&integer(legacy.reservedEURcents)&&legacy.reservedEURcents>0&&!reservations.some(r=>r.sourceId==='trCashReservation'))reservations.push({id:'tr-roundup',accountId:legacy.accountId,amountEURcents:legacy.reservedEURcents,sourceId:'trCashReservation',name:'Broker A · Round-up',asOf:legacy.asOf,releaseScheduleId:settings.liquidity?.roundupScheduleId||null});
 for(const r of reservations)if(r.asOf&&r.asOf!==asOf)warnings.push(`${r.name||'Reservierung'}: ${dt(r.asOf)} als letzter Beleg. Betrag bleibt vorsichtshalber reserviert; aktuellen Stand bestätigen.`);
 const variableIds=settings.liquidity?.variableCategoryIds;
 const names=new Map((live.categories||[]).map(c=>[c.id,c.name]));
 const variable=/Groceries|Lebensmittel|Drogerie|Essen gehen|Liefer|Benzin|Tanken|Treibstoff|Freizeit|Kleidung|Friseur|Kosmetik|Haushalt|Gesundheit|Apotheke|Park|Mobilit/i;
 const eligible=tx.filter(t=>(ids.has(t.account)||cardIds.has(t.account))&&!t.transfer_id&&!payees.get(t.payee)?.transfer_acct&&!isAdjustment(t)&&integer(t.amount)&&t.amount<0&&t.date>dayAdd(asOf,-90)&&t.date<=asOf&&!coveredCategories.has(t.category)&&(Array.isArray(variableIds)?variableIds.includes(t.category):variable.test(names.get(t.category)||'')));
 const daily=integer(settings.liquidity?.dailySpendEURcents)&&settings.liquidity.dailySpendEURcents>=0?settings.liquidity.dailySpendEURcents:Math.max(0,Math.round(-total(eligible.map(t=>t.amount))/90));
 const cashStart=total(accounts.filter(a=>integer(a.balance)).map(a=>a.balance)),initialLiabilities=new Map(cards.map(a=>[a.id,-(a.balance||0)]));
 const series=[],liabilities=new Map(initialLiabilities),activeReservations=new Map(reservations.map(r=>[r.id,r]));
 let cash=cashStart,estimatedSpending=0;
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const point=(date,dayEvents=[])=>{
  const cardReserve=total([...liabilities.values()].map(v=>Math.max(0,v))),reserved=total([...activeReservations.values()].map(r=>r.amountEURcents));
  const plannedAvailable=cash-cardReserve-reserved-protectedBuffer;
  return {date,cash,cardReserve,reserved,protectedBuffer,plannedAvailable,available:plannedAvailable-estimatedSpending,headroom:plannedAvailable-estimatedSpending+overdraftLimit,stress:plannedAvailable-Math.round(estimatedSpending*1.25),estimatedSpending,events:dayEvents};
 };
 series.push(point(asOf));
 for(let date=from;date<=to;date=dayAdd(date,1)){
  const dayEvents=events.filter(e=>e.date===date);
  for(const e of dayEvents){
   const sourceIncluded=ids.has(e.accountId),targetIncluded=ids.has(e.counterpartyAccountId);
   if(sourceIncluded&&!targetIncluded)cash+=e.amountEURcents;
   if(!sourceIncluded&&targetIncluded)cash-=e.amountEURcents;
   if(e.classification==='card-settlement')liabilities.set(e.cardId,(liabilities.get(e.cardId)||0)+e.amountEURcents);
   else if(cardIds.has(e.accountId))liabilities.set(e.accountId,(liabilities.get(e.accountId)||0)-e.amountEURcents);
   for(const [key,r] of activeReservations)if(r.releaseEventId===e.id||r.releaseScheduleId&&e.sourceType==='schedule'&&r.releaseScheduleId===e.sourceId){
    // A separately held round-up is an additional outflow at the investment date.
    if(r.sourceId==='trCashReservation'&&!r.includedInSchedule)cash-=r.amountEURcents;
    activeReservations.delete(key);
   }
  }
  estimatedSpending+=daily;series.push(point(date,dayEvents));
 }
 const nextSalary=events.find(e=>e.sourceType==='salary')?.date,before=series.find(p=>p.date===dayAdd(nextSalary||to,-1))||series.at(-1);
 const history=[];for(let i=180;i>=0;i--){const date=dayAdd(asOf,-i);const later=tx.filter(t=>ids.has(t.account)&&t.date>date&&t.date<=asOf);history.push({date,cash:cashStart-total(later.map(t=>t.amount)),kind:'actual-ledger'});}
 const complete=accounts.length>0&&!missingBalances.length&&!missingAssumptions.length;
 if(!complete){for(const p of series)for(const key of ['cash','cardReserve','plannedAvailable','available','headroom','stress'])p[key]=null;for(const p of history)p.cash=null;}
 return {asOf,to,days,accounts:accounts.map(a=>({id:a.id,name:a.name,balance:a.balance})),cards:cards.map(a=>({id:a.id,name:a.name,balance:a.balance})),complete,missingAssumptions,cashStart:complete?cashStart:null,protectedBuffer,reservations,initialCardReserve:complete?total([...initialLiabilities.values()].map(v=>Math.max(0,v))):null,daily,dailyBasis:{days:90,count:eligible.length,excludedScheduledCategories:[...coveredCategories]},events,series,history,nextSalary,before,current:series[0],minAvailable:complete?Math.min(...series.map(p=>p.available)):null,overdraftLimit,overdraftLimits,minHeadroom:complete?Math.min(...series.map(p=>p.headroom)):null,minCash:complete?Math.min(...series.map(p=>p.cash)):null,warnings:[...new Set(warnings)],assumptions:{salaryCovered,contactCCovered,everydayTiming:'Zukünftige variable Käufe werden vorsichtig am Kauftag abgezogen, auch bei Kartenzahlung.'}};
}

export function planReadiness(live,forecast){
 const month=live.months?.[live.nextMonth],need=month?Math.max(0,month.totalBudgeted||0):null;
 if(!forecast.complete)return {state:'incomplete',label:'Kontenumfang prüfen',need,available:null,shortfall:null};
 const available=Math.max(0,forecast.current.available),shortfall=integer(month?.toBudget)?Math.max(0,-month.toBudget):null;
 const state=need===null||need===0?'unplanned':shortfall===null?'incomplete':shortfall>0||forecast.minAvailable<0?'funding-gap':'funded';
 return {state,label:state==='unplanned'?'Nächsten Monat planen':state==='incomplete'?'Budgetdaten prüfen':state==='funding-gap'?'Finanzierung offen':'Zuweisungen im verfügbaren Budget',need,available,shortfall};
}

// Heute (Paket 2, FG-01/FG-02): the three numbers the owner acts on, derived once from a
// forecast. "Inkl. Dispo" is the headroom before the bank blocks payments, "ohne Dispo" the
// available money itself; both stay null while the forecast is incomplete.
export function salaryOutlook(forecast,asOf=forecast?.asOf){
 const f=forecast||{},complete=Boolean(f.complete),series=Array.isArray(f.series)?f.series:[];
 const salaryDate=typeof f.nextSalary==='string'?f.nextSalary:null,daysToSalary=salaryDate&&validDay(asOf)?Math.max(0,Math.round((Date.parse(salaryDate+'T12:00Z')-Date.parse(asOf+'T12:00Z'))/86400000)):null;
 const before=f.before||null,limit=integer(f.overdraftLimit)?f.overdraftLimit:0;
 let low=null;for(const p of series)if(integer(p.available)&&(!low||p.available<low.available))low=p;
 const limits=f.overdraftLimits||{};
 const used=complete?total((f.accounts||[]).filter(a=>integer(a.balance)&&a.balance<0&&limits[a.id]>0).map(a=>-a.balance)):null;
 const horizonEnd=series.at(-1)?.date||f.to||null;
 return {
  complete,salaryDate,daysToSalary,
  // Whether the number really runs until the salary or only until the end of the horizon.
  untilSalary:Boolean(salaryDate&&before&&before.date<salaryDate),horizonEnd,
  withOverdraft:complete&&before?before.headroom:null,withoutOverdraft:complete&&before?before.available:null,
  low:complete&&low?{date:low.date,available:low.available,headroom:low.headroom}:null,
  overdraft:{limit,used,free:complete&&limit>0&&integer(used)?limit-used:null},
  // Red only when the money runs out even with the overdraft (owner decision 2 of the audit).
  alert:complete&&before?before.headroom<0:false
 };
}

// "Das steht als Nächstes an" (FG-10): events of the next `days` days grouped by day with
// sums; internal transfers between liquidity accounts are net zero and counted separately.
export function nextUpGroups(forecast,asOf=forecast?.asOf,{days=7,limit=6}={}){
 const f=forecast||{},to=validDay(asOf)?dayAdd(asOf,days):null,ids=new Set((f.accounts||[]).map(a=>a.id));
 const all=(f.events||[]).filter(e=>validDay(e.date)&&(!to||e.date<=to)&&integer(e.amountEURcents));
 const internal=all.filter(e=>e.classification==='transfer'&&ids.has(e.accountId)&&ids.has(e.counterpartyAccountId));
 const visible=all.filter(e=>!internal.includes(e)).sort((a,b)=>a.date.localeCompare(b.date)||a.amountEURcents-b.amountEURcents);
 const shown=visible.slice(0,limit),days_=[];
 for(const e of shown){let day=days_.at(-1);if(!day||day.date!==e.date){day={date:e.date,events:[],inflow:0,outflow:0};days_.push(day);}day.events.push(e);if(e.amountEURcents>0)day.inflow+=e.amountEURcents;else day.outflow+=e.amountEURcents;}
 return {days:days_,count:visible.length,hidden:Math.max(0,visible.length-shown.length),internalTransfers:internal.length,inflow:total(visible.filter(e=>e.amountEURcents>0).map(e=>e.amountEURcents)),outflow:total(visible.filter(e=>e.amountEURcents<0).map(e=>e.amountEURcents)),to};
}
