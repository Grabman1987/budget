import {resolvePortfolioAccountMappings,portfolioIdForLegacyName} from './portfolio-account-mapping.mjs';
import {investmentOverview} from './investment-model.mjs';
import {resolveBrokerHoldings,applyBrokerFlatPositions,applyBrokerWealthRows} from './broker-holdings.mjs';
import {applyPlatformSnapshots} from './platform-wealth.mjs';
import {fixedMonthlyContribution,contactCForecastEvents} from './contactC-model.mjs';
// Both modules import model.mjs themselves; every use below happens at call time, never while loading.
import {buildReport,reportPeriod,earliestBooking} from './report-model.mjs';
import {liquidityForecast} from './liquidity-model.mjs';
import {accountRole,legacyAccountRole,rowAccountRole as rowRole,salaryAccount,isLoanAccount,isLoanScheduleName} from './account-roles.mjs';
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna'}).format(new Date());
export const sum = a => a.reduce((s,x)=>s+x,0);
export const dayAdd=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const monthAdd=(s,n)=>{const d=new Date(s+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10)};
export const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
export const isAdjustment=t=>/reconcil|übernahmeabgleich|kursanpassung|marktwert/i.test((t.notes||'')+' '+(t.payee_name||''));
export const normalizeMonth=m=>({...m,totalBudgeted:m.categoryGroups.filter(g=>!g.is_income).reduce((n,g)=>n+sum((g.categories||[]).map(c=>c.budgeted||0)),0)});
// Legacy row adapter consumed by planning-model; totals below describe flat defaults,
// not a month-specific or dated plan. Active reporting uses buildMonthlyPlan.
export function annualPlan(workspace){
 const s=workspace.settings,rows=workspace.planning.rows.map(r=>({...r,value:r.id==='excel-8'?s.salary:r.id==='excel-9'?fixedMonthlyContribution(s):r.id==='excel-23'?s.loanPayment:s.planOverrides[r.id]??r.amount}));
 // A fully reimbursed subscription is a pass-through, never free annual income.
 if(s.contactC&&Number.isSafeInteger(s.contactC.audioSubscriptionMonthlyEURcents)){
  const existing=rows.find(r=>r.group!=='Einnahmen'&&/audioSubscription/i.test(r.name||''));
  if(existing){existing.value=s.contactC.audioSubscriptionMonthlyEURcents;existing.managedByKontakt C=true;}
  else rows.push({id:'contactC-audioSubscription-cost',name:'Hörbuch-Abo · für Kontakt C',group:'Abonnements',amount:null,value:s.contactC.audioSubscriptionMonthlyEURcents,reference:'Aktuelle Abbuchung · von Kontakt C erstattet',history2025:null,managedByKontakt C:true});
 }
 if(Number.isSafeInteger(s.extraRepayment)&&s.extraRepayment>0)rows.push({id:'extra-repayment',name:'Geplante Sondertilgung',group:'Schuldenabbau',amount:null,value:s.extraRepayment,reference:'Gespeichertes Szenario · in Liquidität und Jahresplan eingerechnet',history2025:null,managedScenario:true});
 const income=sum(rows.filter(r=>r.group==='Einnahmen').map(r=>r.value)),expenses=sum(rows.filter(r=>r.group!=='Einnahmen').map(r=>r.value));
 return {rows,income,expenses,net:income-expenses,annualNet:(income-expenses)*12};
}
export function sourceComparison(live,workspace){
 const wealth=mergedWealth(live,workspace),latest=workspace.planning.latestBalances;
 const mapping={'bankA':'bankA - Konto','Visa':'Visa','bankC/bankC':'bankC Bank','brokerB Konto':'brokerB Konto','brokerB Depot':'brokerB - Depot','Broker A Konto':'Broker A - Cashback Konto','Broker A Depot':'Broker A - Depot','Krypto-Plattform':'Krypto-Plattform','Mintos':'Mintos','viainvest':'viainvest','Income':'Income','Indemo':'Indemo'};
 return Object.entries(mapping).flatMap(([excel,account])=>{const portfolioId=portfolioIdForLegacyName(workspace,excel==='Krypto-Plattform'?'Krypto-Plattform Depot':excel),a=portfolioId?wealth.rows.find(a=>a.portfolioId===portfolioId):wealth.rows.find(a=>a.name===account),prior=latest?.values[excel];return a&&prior!=null?[{name:excel,prior,current:a.value,difference:a.value==null?null:a.value-prior,basis:a.basis,date:a.sourceDate,priorDate:latest.date}]:[]});
}
export function portfolioStatus(live,workspace,asOf=today()){
 const mapping=resolvePortfolioAccountMappings(workspace,live.accounts,asOf);
 return mapping.entries.filter(entry=>entry.valid).flatMap(entry=>{
  const p=workspace.investments.portfolios.find(p=>p.id===entry.portfolioId);if(!p||p.retired)return [];
  const date=workspace.investments.trades.filter(t=>t.portfolioId===p.id&&t.date<=asOf).map(t=>t.date).sort().at(-1);
  return [{name:p.name,date,portfolioId:p.id,accountId:entry.accountId,mappingStatus:entry.label,laterMovements:(live.transactions||[]).filter(t=>t.account===entry.accountId&&t.date>date&&t.date<=asOf&&!isAdjustment(t)).length}];
 });
}
export function flattenTransactions(transactions){
 const children=new Set(transactions.filter(t=>t.parent_id).map(t=>t.parent_id));
 return transactions.flatMap(t=>t.subtransactions?.length?t.subtransactions.map(s=>({...t,...s,account:t.account,date:t.date,payee:s.payee??t.payee,is_parent:false,parent_id:t.id})):t.is_parent||children.has(t.id)?[]:[t]);
}
function easter(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),v=h+l-7*m+114;return `${year}-${String(Math.floor(v/31)).padStart(2,'0')}-${String(v%31+1).padStart(2,'0')}`;}
export function previousWorkday(date){const y=date.slice(0,4),e=easter(+y),h=new Set(['01-01','01-06','05-01','08-15','10-26','11-01','12-08','12-25','12-26'].map(x=>`${y}-${x}`).concat([1,39,50,60].map(n=>dayAdd(e,n))));while([0,6].includes(new Date(date+'T12:00Z').getUTCDay())||h.has(date))date=dayAdd(date,-1);return date;}
export function expandSchedule(s,from,to){
 if(s.completed||!s.date)return [];
 if(typeof s.date==='string')return s.date>=from&&s.date<=to?[s.date]:[];
 const rule=s.date,start=rule.start||s.next_date;if(!start)return [];
 const interval=rule.interval||1,out=[];
 for(let n=0;n<10000;n++){
  let raw=rule.frequency==='daily'?dayAdd(start,n*interval):rule.frequency==='weekly'?dayAdd(start,n*7*interval):monthAdd(start,n*interval*(rule.frequency==='yearly'?12:1));
  if(rule.frequency==='monthly'&&rule.patterns?.length===1&&rule.patterns[0].type==='day'&&rule.patterns[0].value===-1){const month=monthAdd(start,n*interval).slice(0,7)+'-01';raw=dayAdd(monthAdd(month,1),-1);}
  if(raw>dayAdd(to,7))break;
  if(rule.endMode==='on_date'&&rule.endDate&&raw>rule.endDate)break;
  if(rule.endMode==='after_n_occurrences'&&n>=(rule.endOccurrences||1))break;
  let d=raw;
  if(rule.skipWeekend){const delta=rule.weekendSolveMode==='before'?-1:1;while([0,6].includes(new Date(d+'T12:00Z').getUTCDay()))d=dayAdd(d,delta)}
  if(d>=from&&d<=to&&(!s.next_date||d>=s.next_date))out.push(d);
  if(!['daily','weekly','monthly','yearly'].includes(rule.frequency))break;
 }
 return [...new Set(out)];
}
export function amortize(principal,apr,payment,extra=0,from=today()){
 if(!Number.isSafeInteger(principal)||principal<0||!Number.isFinite(apr)||apr<0||!Number.isSafeInteger(payment)||payment<=0||!Number.isSafeInteger(extra)||extra<0)return {valid:false,error:'Ungültige Kreditdaten',months:null,rows:[]};
 let balance=principal,interest=0;const rows=[];
 for(let n=1;n<=1200&&balance>0;n++){
  const charge=Math.round(balance*apr/1200),pay=Math.min(balance+charge,payment+extra);
  if(pay<=charge)return {valid:false,error:'Rate deckt die Zinsen nicht',months:null,rows:[]};
  balance=balance+charge-pay;interest+=charge;rows.push({month:monthAdd(from.slice(0,7)+'-01',n).slice(0,7),balance,interest:charge,payment:pay});
 }
 return {valid:balance===0,months:balance===0?rows.length:null,interest,end:balance===0?rows.at(-1)?.month:null,rows};
}
// Compatibility shape for wealth aggregation and the transaction quantity guard.
// All trade ordering, basis and valuation decisions belong to investment-model.
// TD-01: investmentOverview is the most expensive step of every wealth valuation (≈ 0.3 s per
// stichtag). The result for one investments object and one date is kept until the workspace
// object is replaced (every save produces a new one), so a re-render never repeats it.
const holdingsCache=new WeakMap();
export function holdings(data,asOf=today()){
 if(!data||typeof data!=='object')return [];
 let byDate=holdingsCache.get(data);
 if(!byDate){byDate=new Map();holdingsCache.set(data,byDate);}
 if(!byDate.has(asOf))byDate.set(asOf,computeHoldings(data,asOf));
 return byDate.get(asOf).map(position=>({...position}));
}
function computeHoldings(data,asOf){
 return investmentOverview(data,{asOf,range:'1M'}).active.flatMap(security=>security.positions.map(position=>({
  ...position,key:position.portfolioId+':'+security.id,securityId:security.id,
  name:security.name,ticker:security.ticker,isin:security.isin,currency:security.currency,
  portfolio:position.portfolioName,price:security.price,priceDate:security.priceDate,
  ageDays:security.ageDays,value:position.valueEURcents,warnings:security.warnings
 }))).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));
}
export function investmentCash(data,asOf=today()){
 const signs={DEPOSIT:1,REMOVAL:-1,BUY:-1,SELL:1,DIVIDENDS:1,INTEREST:1,INTEREST_CHARGE:-1,FEES:-1,FEES_REFUND:1,TAXES:-1,TAX_REFUND:1,TRANSFER_IN:1,TRANSFER_OUT:-1};const map=new Map();
 for(const t of data.cashTransactions){if(t.date>asOf)continue;const a=map.get(t.accountId)||{id:t.accountId,name:t.account,balance:0,date:null,complete:true};if(t.currency!=='EUR'||signs[t.type]===undefined)a.complete=false;else a.balance+=t.amount*signs[t.type];if(!a.date||t.date>a.date)a.date=t.date;map.set(t.accountId,a)}
 return [...map.values()];
}
// B3: freshness of a bank-connected account is the day of Actual's last bank sync, never the
// moment the app loaded. A manual account is as fresh as its latest booking.
const dayOfTimestamp=value=>{const ms=Number(value);if(!Number.isFinite(ms)||ms<=0)return null;const date=new Date(ms);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna'}).format(date):null;};
export const bankConnected=account=>typeof account?.account_sync_source==='string'&&account.account_sync_source.trim().length>0;
export function bankSyncDay(account,asOf=today()){
 if(!bankConnected(account))return null;
 const day=dayOfTimestamp(account.last_sync);
 return day?(day>asOf?asOf:day):null;
}
function lastBookingByAccount(transactions,asOf){
 const map=new Map();
 for(const t of transactions){if(!t||t.tombstone||typeof t.account!=='string'||typeof t.date!=='string'||t.date>asOf)continue;const known=map.get(t.account);if(!known||t.date>known)map.set(t.account,t.date);}
 return map;
}
export function mergedWealth(live,workspace,asOf=today()){
 const brokerResult=resolveBrokerHoldings(workspace.investments,workspace.settings?.brokerHoldingsSnapshots,asOf,{accounts:live.accounts,transactions:live.transactions||[]});
 const pos=applyBrokerFlatPositions(holdings(workspace.investments,asOf),brokerResult),cash=investmentCash(workspace.investments,asOf);
 const mapping=resolvePortfolioAccountMappings(workspace,live.accounts,asOf);
 const lastBooking=lastBookingByAccount(live.transactions||[],asOf);
 const rows=live.accounts.filter(a=>!a.closed).map(a=>{const bank=bankSyncDay(a,asOf);return {...a,accountRole:accountRole(a,workspace.settings),value:Number.isSafeInteger(a.balance)?a.balance:null,basis:bank?'Actual · Bankabruf':'Actual',sourceDate:bank||lastBooking.get(a.id)||live.refreshedAt?.slice(0,10)||null};});
 for(const entry of mapping.entries){
  const p=pos.filter(x=>x.portfolioId===entry.portfolioId);let a=rows.find(a=>a.id===entry.accountId);
  // An unlinked empty legacy depot is visible in source settings, not a phantom asset.
  if(!entry.valid&&!p.length&&!entry.confirmed&&!entry.accountId)continue;
  if(!a){a={id:'mapping-gap:'+entry.portfolioId,name:entry.portfolioName||entry.portfolioId,offbudget:true,balance:null};rows.push(a);}
  a.portfolioId=entry.portfolioId;a.mappingStatus=entry.label;a.mappingRevisionId=entry.revisionId;a.mappingIssues=entry.issues;a.bookValue=a.balance;
  a.value=entry.valid?(p.some(x=>!Number.isSafeInteger(x.value))?null:sum(p.map(x=>x.value))):null;
  a.basis=entry.valid?`PP · ${p.length?'Marktwert':'keine offenen Positionen'} · ${entry.label}`:'PP · Zuordnung prüfen';
  a.sourceDate=p.map(x=>x.priceDate).filter(Boolean).sort()[0]||null;
 }
 // PP cash balances at brokers complement their securities. TR cash is already in Actual.
 for(const c of cash){
  if(legacyAccountRole(c.name)==='broker-cash'&&c.balance!==0)rows.push({id:'pp:'+c.id,name:c.name,value:c.complete?c.balance:null,balance:c.balance,offbudget:true,basis:'PP · Verrechnung',sourceDate:c.date});
  const key=Object.keys({'Mintos':'Mintos','Viainvest':'viainvest','Income':'Income','Indemo':'Indemo'}).find(k=>c.name.toLowerCase().startsWith(k.toLowerCase()));
  if(key){const a=rows.find(a=>a.name.toLowerCase()===key.toLowerCase());if(a){a.value=c.complete?c.balance:null;a.basis='PP · Konto inkl. Erträge';a.sourceDate=c.date;}}
 }
 const platformResult=applyPlatformSnapshots(rows,workspace.settings?.platformSnapshots,asOf,{transactions:live.transactions||[]});
 const valuedRows=applyBrokerWealthRows(platformResult.rows,brokerResult).map(row=>row.mappingIssues?.length?{...row,value:null,basis:'PP · Zuordnung prüfen'}:row);
 // A broker snapshot must not silently move a depot back to a different account.
 if(brokerResult.snapshot){const entry=mapping.entries.find(e=>e.portfolioId===brokerResult.snapshot.portfolioId);if(entry?.confirmed&&entry.accountId!==brokerResult.snapshot.actualAccountId)for(const row of valuedRows)if(row.id===entry.accountId||row.id===brokerResult.snapshot.actualAccountId){row.value=null;row.basis='PP · Brokerquelle widerspricht Depotzuordnung';row.mappingIssues=[...(row.mappingIssues||[]),'Brokerquellenkonto und bestätigte Depotzuordnung stimmen nicht überein.'];}}

 return {rows:valuedRows,positions:pos,cash,portfolioMappingStatus:mapping,total:valuedRows.some(a=>!Number.isSafeInteger(a.value))?null:sum(valuedRows.map(a=>a.value)),assets:sum(valuedRows.filter(a=>a.value>0).map(a=>a.value)),liabilities:-sum(valuedRows.filter(a=>a.value<0).map(a=>a.value)),platformSnapshotStatus:{applied:platformResult.applied,issues:platformResult.issues},brokerSnapshotStatus:{applied:brokerResult.snapshot?'cryptoPlatform':null,issues:brokerResult.issues}};
}
// B15: one freshness limit per source kind instead of a single 30/7-day rule. Beyond the limit
// the source is due (amber); beyond 30 days it is stale (red). Broker prices count workdays.
export const SOURCE_FRESHNESS={
 bank:{days:2,label:'Bank'},manual:{days:7,label:'Manuell'},broker:{days:3,workdays:true,label:'Broker'},
 platform:{days:30,label:'Plattform'},cash:{days:14,label:'Bargeld'},live:{days:7,label:'Actual'},imported:{days:7,label:'Import'}
};
const STALE_DAYS=30;
function workdaysBetween(from,to){let n=0;for(let d=from;d<to;d=dayAdd(d,1)){const wd=new Date(dayAdd(d,1)+'T12:00Z').getUTCDay();if(wd!==0&&wd!==6)n++;}return n;}
export function sourceKind(row){
 const basis=row?.basis||'';
 if(row?.quality==='manual'||/Manuell/i.test(basis))return 'manual';
 if(rowRole(row)==='cash')return 'cash';
 if(bankConnected(row)||/Bankabruf/.test(basis))return 'bank';
 if(/^(PP|Broker|Buchwert)/.test(basis))return 'broker';
 if(/Plattform/i.test(basis))return 'platform';
 if(/^Actual/.test(basis))return 'live';
 return 'imported';
}
export function sourceQuality(row,asOf=today()){
 const valid=typeof row?.sourceDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row.sourceDate)&&Number.isFinite(Date.parse(row.sourceDate+'T12:00Z'));
 if(!valid)return {key:'unknown',kind:null,label:'Historie offen',ageDays:null,limitDays:null,tone:'unknown',due:true};
 const kind=sourceKind(row),limit=SOURCE_FRESHNESS[kind],age=Math.max(0,daysBetween(row.sourceDate,asOf));
 const measured=limit.workdays?workdaysBetween(row.sourceDate,asOf):age;
 const due=measured>limit.days;
 const ageText=age===0?'heute':age+' '+(age===1?'Tag':'Tage');
 if(age>STALE_DAYS)return {key:'stale',kind,label:'Veraltet · '+age+' Tage',ageDays:age,limitDays:limit.days,tone:'red',due:true};
 const label=kind==='live'&&age===0?'Heute geladen':limit.label+' · '+ageText;
 // `key` keeps the five classes the views style today; `kind` and `tone` carry the finer B15 result.
 const key={bank:'live',cash:'live',broker:'imported',platform:'imported'}[kind]||kind;
 return {key,kind,label,ageDays:age,limitDays:limit.days,tone:due?'amber':'ok',due};
}
export function balanceSheet(live,workspace,asOf=today()){
 const wealth=mergedWealth(live,workspace,asOf),isP2P=row=>rowRole(row)==='p2p';
 const liquid=sum(wealth.rows.filter(r=>r.value>0&&!r.offbudget).map(r=>r.value));
 const platforms=sum(wealth.rows.filter(r=>r.value>0&&isP2P(r)).map(r=>r.value));
 const investments=sum(wealth.rows.filter(r=>r.value>0&&r.offbudget&&!isP2P(r)).map(r=>r.value));
 const debts=-sum(wealth.rows.filter(r=>r.value<0).map(r=>r.value));
 const missingRows=wealth.rows.filter(r=>!Number.isSafeInteger(r.value)),complete=missingRows.length===0,knownNet=liquid+investments+platforms-debts;
 return {liquid,investments,platforms,debts,net:complete?knownNet:null,knownNet,complete,missingRows,rows:wealth.rows.map(r=>({...r,sourceQuality:sourceQuality(r,asOf)}))};
}
/** @deprecated Historical fixture compatibility only; active consumers use liquidityForecast. */
export function forecast(live,settings,asOf=today(),days=45){
 const main=salaryAccount(live.accounts,settings),from=dayAdd(asOf,1),to=dayAdd(asOf,days),payees=new Map(live.payees.map(p=>[p.id,p]));
 const events=[],warnings=[];const salaryDates=[];
 for(const s of live.schedules){
  const p=payees.get(s.payee),target=p?.transfer_acct;
  if(s.account!==main?.id&&target!==main?.id)continue;
  if(s.next_date&&s.next_date<=asOf&&!s.completed)warnings.push('Zahlungsplan „'+s.name+'“ ist bis heute fällig. Bereits verbucht oder noch offen? Nicht zusätzlich eingerechnet.');
  // Salary and the explicitly linked shared-cost schedule are modeled once.
  if(s.amount>0&&/gehalt|employer|GPI/i.test(s.name+' '+p?.name))continue;
  if((settings.contactC?.scheduleId&&s.id===settings.contactC.scheduleId)||(!settings.contactC&&s.amount>0&&/Kontakt C/i.test(s.name+' '+p?.name)))continue;
  if(!Number.isSafeInteger(s.amount)){warnings.push('Betrag des Zahlungsplans „'+s.name+'“ ist nicht eindeutig.');continue;}
  if(s.amountOp&&s.amountOp!=='is')warnings.push('„'+s.name+'“ verwendet einen geschätzten Zahlungsbetrag.');
  for(const date of expandSchedule(s,from,to))events.push({date,name:s.name||p?.name||'Zahlung',amount:s.account===main?.id?s.amount:-s.amount,kind:'schedule'});
 }
 for(let i=0;i<4;i++){
  const month=monthAdd(asOf.slice(0,7)+'-01',i).slice(0,7),date=previousWorkday(month+'-'+String(settings.salaryDay||15).padStart(2,'0'));
  if(date>=from&&date<=to){events.push({date,name:'Gehalt',amount:settings.salary,kind:'income'});salaryDates.push(date);}
  const end=dayAdd(monthAdd(month+'-01',1),-1);
  if(!settings.contactC&&end>=from&&end<=to)events.push({date:end,name:'Kontakt Cs Kostenbeitrag',amount:fixedMonthlyContribution(settings),kind:'income'});
 }
 if(settings.contactC){const contactC=contactCForecastEvents(live,settings,asOf,days);events.push(...contactC.events);warnings.push(...contactC.warnings);}
 if(Number.isSafeInteger(settings.extraRepayment)&&settings.extraRepayment>0){
  const debtDates=[...new Set(events.filter(e=>e.kind==='schedule'&&isLoanScheduleName(e.name)).map(e=>e.date))];
  if(debtDates.length)for(const date of debtDates)events.push({date,name:'Geplante Sondertilgung',amount:-settings.extraRepayment,kind:'scenario'});
  else warnings.push('Die gespeicherte Sondertilgung ist mangels eindeutigem Kredit-Zahlungsplan noch keinem Termin zugeordnet.');
 }
 for(const item of settings.oneOffs||[])if(item.date>=from&&item.date<=to)events.push({...item,kind:'plan'});
 const categories=new Map(live.categories.map(c=>[c.id,c])),accounts=new Map(live.accounts.map(a=>[a.id,a]));
 const everyday=/Groceries|Lebensmittel|Drogerie|Essen gehen|Liefer|Benzin|Tanken|Treibstoff|Freizeit|Kleidung|Friseur|Kosmetik|Haushalt|Gesundheit|Apotheke|Park|Mobilit/i;
 const direct=live.transactions.filter(t=>!accounts.get(t.account)?.offbudget&&!t.transfer_id&&!isAdjustment(t)&&t.amount<0&&t.date<=asOf&&t.date>dayAdd(asOf,-90)&&everyday.test(categories.get(t.category)?.name||''));
 const daily=Math.max(0,-Math.round(sum(direct.map(t=>t.amount))/90));
 let balance=main?.balance||0,burn=balance,stress=balance;const series=[{date:asOf,balance,withEveryday:balance,stress,events:[]}];
 events.sort((a,b)=>a.date.localeCompare(b.date));
 for(let d=from;d<=to;d=dayAdd(d,1)){const e=events.filter(x=>x.date===d),movement=sum(e.map(x=>x.amount));balance+=movement;burn+=movement-daily;stress+=movement-Math.round(daily*1.25);series.push({date:d,balance,withEveryday:burn,stress,events:e});}
 const nextSalary=salaryDates[0],before=series.find(d=>d.date===dayAdd(nextSalary||to,-1));
 return {series,events,daily,directTransactionCount:direct.length,directAccounts:new Set(direct.map(t=>t.account)).size,nextSalary,before,min:Math.min(...series.map(p=>p.balance)),minWithEveryday:Math.min(...series.map(p=>p.withEveryday)),minStress:Math.min(...series.map(p=>p.stress)),warnings};
}
/** @deprecated Historical compatibility only; active consumers use buildReport. */
export function monthlyCashflow(live,asOf=today(),settings={}){
 const accounts=new Map(live.accounts.map(a=>[a.id,a])),transactions=new Map(live.transactions.map(t=>[t.id,t])),months=new Map();
 for(const t of live.transactions){if(t.date>asOf||t.date<'2025-09-01'||accounts.get(t.account)?.offbudget||isAdjustment(t))continue;
  const ym=t.date.slice(0,7),m=months.get(ym)||{month:ym,income:0,spend:0,investments:0,debt:0,cash:0};
  if(t.transfer_id){const target=accounts.get(transactions.get(t.transfer_id)?.account);if(target?.offbudget){if(isLoanAccount(target,settings))m.debt-=t.amount;else m.investments-=t.amount; m.cash+=t.amount;}}
  else {if(t.amount>0)m.income+=t.amount;else m.spend-=t.amount;m.cash+=t.amount;}
  months.set(ym,m);
 }
 return [...months.values()].sort((a,b)=>a.month.localeCompare(b.month));
}

// CALC-04: Actual's "zugewiesen" is a net figure. The plan is the sum of positive assignments;
// negative assignments are money taken back out of categories and are reported separately.
export function assignedSplit(month,live=null){
 const budgetMonth=typeof month==='string'?live?.months?.[month]||null:month||null;
 const key=typeof month==='string'?month:budgetMonth?.month??null;
 let positive=0,negative=0,positiveCount=0,negativeCount=0;
 for(const group of budgetMonth?.categoryGroups||[]){
  if(group.is_income)continue;
  for(const category of group.categories||[]){const b=category.budgeted;if(!Number.isSafeInteger(b)||b===0)continue;if(b>0){positive+=b;positiveCount++;}else{negative+=b;negativeCount++;}}
 }
 return {month:key,complete:Array.isArray(budgetMonth?.categoryGroups),positive,negative,net:positive+negative,positiveCount,negativeCount,
  basis:'Zugewiesen = Summe der positiven Zuweisungen der Ausgabenkategorien; Rücknahmen = Summe der negativen Zuweisungen. Actuals Kopfzahl ist die Nettosumme beider.'};
}

// Weighted average interest of the open loans: the debt register wins, the legacy loanApr is the fallback.
export function averageDebtInterest(live,workspace,asOf=today()){
 const settings=workspace?.settings||{},debts=Array.isArray(settings.debts)?settings.debts:[];
 const loans=(live?.accounts||[]).filter(a=>!a.closed&&Number.isSafeInteger(a.balance)&&a.balance<0&&isLoanAccount(a,settings));
 const rows=loans.map(account=>{
  const debt=debts.find(d=>d.accountId===account.id),terms=(debt?.terms||[]).filter(t=>t.effectiveFrom<=asOf).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);
  const apr=Number.isFinite(terms?.nominalApr)?terms.nominalApr:Number.isFinite(settings.loanApr)?settings.loanApr:null;
  return {accountId:account.id,name:account.name,principalEURcents:-account.balance,apr,source:Number.isFinite(terms?.nominalApr)?'debt-register':apr===null?null:'legacy-loanApr'};
 }).filter(r=>r.apr!==null);
 const weight=sum(rows.map(r=>r.principalEURcents));
 return {rate:weight>0?sum(rows.map(r=>r.apr*r.principalEURcents))/weight:null,principalEURcents:weight,loans:rows,
  source:rows.some(r=>r.source==='debt-register')?'debt-register':rows.length?'legacy-loanApr':null,
  basis:'Gewichteter Sollzins der offenen Kreditkonten nach Restschuld; Konditionen aus dem Schuldenregister, sonst der hinterlegte Kreditzins.'};
}

// CALC-21 / TD-19: the cockpit figures for Heute. Every value carries its basis; nothing here is
// stored, the caller (Paket 2) renders the tiles. Ratios are fractions (0.331), money is cents.
export function cockpitKpis(live,workspace,asOf=today()){
 const settings=workspace?.settings||{};
 const earliest=earliestBooking(live);
 const ytd=reportPeriod('YTD',asOf,{earliest}),year=reportPeriod('1Y',asOf,{earliest});
 const ytdReport=buildReport(live,workspace,{...ytd,person:'all'}),yearReport=buildReport(live,workspace,{...year,person:'all'});
 const income=ytdReport.totals.income;
 // Net consumption of the group: a refund in a fixed-cost category lowers the fixed costs.
 const fixedRows=ytdReport.rows.filter(row=>row.kind==='consumption'&&/fixkosten/i.test(row.groupName||''));
 const fixedGroup=fixedRows.some(row=>row.amount<0);
 const fixedCosts=fixedGroup?-sum(fixedRows.map(row=>row.amount)):-sum(ytdReport.rows.filter(row=>row.kind==='consumption'&&row.amount<0&&row.regularity?.status==='regular').map(row=>row.amount));
 const monthsWithConsumption=yearReport.monthly.filter(m=>Number.isSafeInteger(m.consumption));
 const monthlyConsumption=monthsWithConsumption.length?-sum(monthsWithConsumption.map(m=>m.consumption))/monthsWithConsumption.length:null;
 const sheet=balanceSheet(live,workspace,asOf);
 const forecast=liquidityForecast(live,settings,asOf,45);
 const thirtyDaysAgo=dayAdd(asOf,-30),then=forecast.history.find(p=>p.date===thirtyDaysAgo);
 const delta30=forecast.complete&&Number.isSafeInteger(forecast.cashStart)&&Number.isSafeInteger(then?.cash)?forecast.cashStart-then.cash:null;
 const budgetMonth=live?.months?.[live.currentMonth||asOf.slice(0,7)]||null;
 const overspent=[];
 for(const group of budgetMonth?.categoryGroups||[]){if(group.is_income||group.hidden)continue;for(const c of group.categories||[])if(!c.hidden&&Number.isSafeInteger(c.balance)&&c.balance<0)overspent.push({id:c.id,name:c.name,balance:c.balance});}
 const monthEnd=dayAdd(monthAdd(asOf.slice(0,7)+'-01',1),-1);
 const target=Number.isFinite(settings.savingRateTargetPercent)?settings.savingRateTargetPercent/100:null;
 const interest=averageDebtInterest(live,workspace,asOf);
 return {asOf,period:{ytd,year},
  fixedCostRatio:{value:income>0?fixedCosts/income:null,fixedCostsEURcents:fixedCosts,incomeEURcents:income,source:fixedGroup?'group':'schedules',
   basis:fixedGroup?'Konsum in der Actual-Gruppe „Fixkosten“ geteilt durch das Einkommen seit Jahresbeginn.':'Keine Gruppe „Fixkosten“: regelmäßige Buchungen mit passendem Zahlungsplan geteilt durch das Einkommen seit Jahresbeginn.'},
  emergencyMonths:{value:Number.isFinite(monthlyConsumption)&&monthlyConsumption>0?sheet.liquid/monthlyConsumption:null,liquidEURcents:sheet.liquid,monthlyConsumptionEURcents:Number.isFinite(monthlyConsumption)?Math.round(monthlyConsumption):null,targetMonths:3,
   basis:'Positive Salden der Budgetkonten geteilt durch den durchschnittlichen Monatskonsum der letzten zwölf Monate.'},
  burnRate:{monthlyEURcents:Number.isFinite(monthlyConsumption)?Math.round(monthlyConsumption):null,dailyEURcents:Number.isSafeInteger(forecast.daily)?forecast.daily:null,
   basis:'Monatlich: Ø Konsum der letzten zwölf Monate. Täglich: variable Alltagskäufe der letzten 90 Tage ohne Zahlungspläne.'},
  liquidityDelta30:{value:delta30,from:thirtyDaysAgo,to:asOf,basis:'Kontostand der liquiden Konten heute gegenüber vor 30 Tagen, aus dem Actual-Kontoverlauf.'},
  savingRate:{value:ytdReport.savingRate,target,targetMet:target===null||!Number.isFinite(ytdReport.savingRate)?null:ytdReport.savingRate>=target,basis:ytdReport.savingRateDefinition+' Zeitraum: seit Jahresbeginn. Ziel aus settings.savingRateTargetPercent.'},
  daysToSalary:{value:forecast.nextSalary?daysBetween(asOf,forecast.nextSalary):null,date:forecast.nextSalary||null,basis:'Nächster Gehaltstermin laut Liquiditätsvorschau.'},
  daysToMonthEnd:{value:daysBetween(asOf,monthEnd),date:monthEnd,basis:'Kalendertage bis zum Monatsende.'},
  overspentCategories:{count:overspent.length,totalEURcents:sum(overspent.map(c=>c.balance)),categories:overspent,month:budgetMonth?.month||live?.currentMonth||null,basis:'Sichtbare Kategorien des laufenden Monats mit negativem Saldo in Actual.'},
  netDeposits:{value:-ytdReport.totals.investment||0,basis:'Netto-Überträge von Budgetkonten in Depots und P2P-Konten seit Jahresbeginn; Rückflüsse machen den Wert negativ.'},
  averageInterest:{value:interest.rate,principalEURcents:interest.principalEURcents,source:interest.source,basis:interest.basis}
 };
}
