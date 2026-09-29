import {securityDetail,investmentOverview} from './investment-model.mjs';
import {plural} from './text-format.mjs';
import {today} from './model.mjs';

const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00Z'))&&new Date(value+'T12:00Z').toISOString().slice(0,10)===value;
const days=(a,b)=>(Date.parse(b+'T12:00Z')-Date.parse(a+'T12:00Z'))/864e5;
const int=value=>Number.isSafeInteger(value);
const qty=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:null};
const signType={BUY:1,DELIVERY_INBOUND:1,TRANSFER_IN:1,SELL:-1,DELIVERY_OUTBOUND:-1,TRANSFER_OUT:-1};
const passiveTypes=new Set(['DELIVERY_INBOUND','DELIVERY_OUTBOUND','TRANSFER_IN','TRANSFER_OUT']);
const incomeTypes=new Set(['DIVIDENDS','INTEREST']);
const expenseTypes=new Set(['FEES','TAXES','INTEREST_CHARGE']);
const weekday=date=>{const day=new Date(date+'T12:00Z').getUTCDay();return day>=1&&day<=5};
/** Handelstage (Mo–Fr) nach dem Kursdatum bis einschließlich Stichtag; Kurs am Freitag, Stichtag Sonntag → 0. */
export function tradingDaysBetween(from,to){
 if(!validDate(from)||!validDate(to)||to<=from)return 0;
 const span=Math.round(days(from,to)),start=new Date(from+'T12:00Z').getUTCDay();
 let count=Math.floor(span/7)*5;
 for(let i=1;i<=span%7;i++){const dow=(start+i)%7;if(dow>=1&&dow<=5)count++}
 return count;
}

/** Klartext für jeden Rohcode aus Ledger, Modell und Quellenprüfung (CALC-10). Ein Code erreicht die Oberfläche nie roh. */
export const ISSUE_LABELS={
 'unknown-cost-basis':'Einstand nicht vollständig belegt',
 'unknown-realized-basis':'Einstand der verkauften Stücke nicht belegt',
 'trade-order-or-quantity':'Reihenfolge oder Stückzahl einer Buchung unklar',
 'negative-position':'Negativer Bestand in der Buchungshistorie',
 'missing-quote':'Kein gespeicherter Kurs',
 'missing-fx':'Keine Fremdwährungsumrechnung hinterlegt',
 'uncertain-quantity':'Stückzahlen nicht eindeutig belegt',
 'ambiguous-trade-order':'Reihenfolge gleichtägiger Buchungen unklar',
 'portfolio-income-unattributed':'Ausschüttungen nicht je Depot zuordenbar',
 'source-quantity-history-open':'Quellenbestand mit offener Historie',
 'source-snapshot-rejected':'Broker-Quellenstand für diesen Stichtag nicht bestätigt; eine Auswertung ist erst ab dem Datum des Quellenabzugs möglich',
 'unsupported-or-invalid-trade':'Buchung nicht auswertbar',
 'quantity-out-of-range':'Stückzahl außerhalb des darstellbaren Bereichs',
};
export const issueLabel=code=>ISSUE_LABELS[code]||`Unbekannter Hinweis (${String(code??'')})`;
/** Klartext der Buchungsarten aus PP-Import und Depotbuchung (Wertpapier- und Verrechnungsbuchungen). */
export const TRANSACTION_LABELS={
 BUY:'Kauf',SELL:'Verkauf',DELIVERY_INBOUND:'Einlieferung / Reward',DELIVERY_OUTBOUND:'Auslieferung',
 TRANSFER_IN:'Depotübertrag ein',TRANSFER_OUT:'Depotübertrag aus',DIVIDENDS:'Dividende',INTEREST:'Zinsen',
 INTEREST_CHARGE:'Sollzinsen',DEPOSIT:'Einzahlung',REMOVAL:'Entnahme',FEES:'Gebühren',FEES_REFUND:'Gebührenerstattung',
 TAXES:'Steuern',TAX_REFUND:'Steuererstattung',
};
export const transactionLabel=type=>TRANSACTION_LABELS[type]||'Sonstige Buchung';

/** Annualised money-weighted rate. A result is emitted only for one finite root. */
export function xirr(flows=[]){
 if(!Array.isArray(flows)||flows.length<2||flows.some(flow=>!validDate(flow.date)||!int(flow.amountEURcents)))return {rate:null,percent:null,status:'invalid-flows'};
 const sorted=flows.slice().sort((a,b)=>a.date.localeCompare(b.date)),start=sorted[0].date;
 if(days(start,sorted.at(-1).date)<1)return {rate:null,percent:null,status:'insufficient-period'};
 if(!sorted.some(flow=>flow.amountEURcents<0)||!sorted.some(flow=>flow.amountEURcents>0))return {rate:null,percent:null,status:'one-sided-flows'};
 const npv=rate=>sorted.reduce((sum,flow)=>sum+flow.amountEURcents/Math.pow(1+rate,days(start,flow.date)/365.2425),0);
 const grid=[-.999999,-.9999,-.999,-.99,-.9,-.75,-.5,-.25,-.1,0,.05,.1,.25,.5,1,2,5,10,20,50,100,1000,10000,100000,1000000];
 const brackets=[];
 for(let i=1;i<grid.length;i++){const a=grid[i-1],b=grid[i],fa=npv(a),fb=npv(b);if(!Number.isFinite(fa)||!Number.isFinite(fb))continue;if(fa===0)brackets.push([a,a]);else if(fa*fb<0||fb===0)brackets.push([a,b])}
 if(brackets.length!==1)return {rate:null,percent:null,status:brackets.length?'multiple-roots':'no-root'};
 let [lo,hi]=brackets[0],flo=npv(lo);
 for(let i=0;i<180&&hi-lo>1e-12;i++){const mid=(lo+hi)/2,fmid=npv(mid);if(!Number.isFinite(fmid))return {rate:null,percent:null,status:'invalid-root'};if(fmid===0){lo=hi=mid;break}if(Math.sign(fmid)===Math.sign(flo)){lo=mid;flo=fmid}else hi=mid}
 const rate=(lo+hi)/2;return Number.isFinite(rate)?{rate,percent:rate*100,status:'complete'}:{rate:null,percent:null,status:'invalid-root'};
}

/**
 * Daily TTWROR needs dated complete valuations and explicitly timed external flows.
 * `acceptEstimated` is an explicit opt-in for a series whose producer marked single days as
 * 'estimated' (a carried-forward quote beyond the agreed tolerance). It stays off by default,
 * so an unaware caller never receives an estimate that looks verified.
 */
export function timeWeightedReturn(points=[],{acceptEstimated=false}={}){
 if(!Array.isArray(points)||points.length<2)return {rate:null,percent:null,status:'insufficient-valuations'};
 const accepted=acceptEstimated?new Set(['verified','estimated']):new Set(['verified']);
 const ordered=points.slice().sort((a,b)=>a.date.localeCompare(b.date));let factor=1;
 for(let i=0;i<ordered.length;i++){
  const p=ordered[i];if(!validDate(p.date)||!int(p.valueEURcents)||p.valueEURcents<0||p.complete!==true||!accepted.has(p.quality)||(i&&days(ordered[i-1].date,p.date)!==1))return {rate:null,percent:null,status:'incomplete-daily-coverage'};
  if(i===0)continue;
  const prior=ordered[i-1].valueEURcents,flow=p.externalFlowEURcents;
  if(!int(flow)||!['start','end'].includes(p.flowTiming))return {rate:null,percent:null,status:'cashflow-timing-unavailable'};
  const denominator=p.flowTiming==='start'?prior+flow:prior,numerator=p.flowTiming==='start'?p.valueEURcents:p.valueEURcents-flow;
  if(denominator<=0||numerator<0)return {rate:null,percent:null,status:'invalid-valuation'};
  factor*=numerator/denominator;
 }
 const rate=factor-1;return Number.isFinite(rate)?{rate,percent:rate*100,status:'complete'}:{rate:null,percent:null,status:'invalid-valuation'};
}

function tradeTime(trade){const time=Date.parse(trade.dateTime||'');return Number.isFinite(time)?time:Infinity}
function realizedLedger(trades){
 const ordered=trades.slice().sort((a,b)=>a.date.localeCompare(b.date)||tradeTime(a)-tradeTime(b)||String(a.id).localeCompare(String(b.id)));
 const positions=new Map(),issues=[];let realized=0,hasRealized=false;
 const dayGroups=new Map();for(const t of ordered){const key=`${t.portfolioId}|${t.securityId}|${t.date}`;const group=dayGroups.get(key)||[];group.push(t);dayGroups.set(key,group)}
 const ambiguous=new Set([...dayGroups.values()].filter(group=>group.some(t=>signType[t.type]>0)&&group.some(t=>signType[t.type]<0)&&group.some(t=>!Number.isFinite(tradeTime(t)))).flatMap(group=>group.map(t=>t.id)));
 for(const t of ordered){
  const key=t.portfolioId||'unknown',position=positions.get(key)||{units:0,basis:0,known:true};const units=qty(t.shares),amount=t.amount;
  if(!validDate(t.date)||!Object.hasOwn(signType,t.type)||units===null||ambiguous.has(t.id)){position.known=false;issues.push('trade-order-or-quantity');positions.set(key,position);continue}
  const previous=position.units,next=previous+units*signType[t.type];
  if(next<-1e-8){position.known=false;issues.push('negative-position');positions.set(key,position);continue}
  if(signType[t.type]>0){
   if(previous===0){position.basis=0;position.known=true}
   // Wie im Modell: eine Einlieferung mit Eurobetrag ist eine bekannte Basis, ein Depotübertrag und eine Einlieferung ohne Betrag nicht.
   const knownAddition=t.currency==='EUR'&&int(amount)&&amount>=0&&t.type!=='TRANSFER_IN'&&!(t.type==='DELIVERY_INBOUND'&&amount===0);
   if(!knownAddition){position.known=false;issues.push('unknown-cost-basis')}
   else position.basis+=amount;
  }else if(t.type==='SELL'){
   if(position.known&&t.currency==='EUR'&&int(amount)&&amount>=0&&previous>0){const released=position.basis*units/previous;realized+=amount-released;hasRealized=true;position.basis-=released}else{position.known=false;issues.push('unknown-realized-basis')}
  }else if(position.known&&previous>0)position.basis*=Math.max(0,next)/previous;
  position.units=Math.abs(next)<1e-8?0:next;
  if(position.units===0){position.basis=0;position.known=true}
  positions.set(key,position);
 }
 // Ohne Verkauf ist nichts realisiert: 0 € ist dann eine Aussage, kein Platzhalter. Ein unbekannter Einstand
 // blockiert das realisierte Ergebnis erst, wenn aus dieser Position verkauft wurde (dann steht unknown-realized-basis).
 const sales=trades.filter(t=>t.type==='SELL').length;
 const blocked=sales>0&&issues.some(issue=>issue!=='unknown-cost-basis');
 return {realizedGainEURcents:sales===0?0:blocked?null:Math.round(realized),hasRealized,sales,issues:[...new Set(issues)]};
}

export function securityPerformance(data,securityId,{asOf,portfolioId='',brokerHoldingsSnapshots}={}){
 const detail=securityDetail(data,securityId,{asOf,range:'ALL',portfolioId,brokerHoldingsSnapshots});
 if(!detail)return null;
 const trades=(detail.trades||[]).filter(t=>!portfolioId||t.portfolioId===portfolioId),ledger=realizedLedger(trades),cash=portfolioId?[]:(data.cashTransactions||[]).filter(t=>t.securityId===securityId&&validDate(t.date)&&t.date<=detail.asOf);
 const unknownCurrency=[...trades,...cash].some(row=>row.currency!=='EUR');
 const income=cash.filter(t=>incomeTypes.has(t.type)),expenses=cash.filter(t=>expenseTypes.has(t.type));
 const cashKnown=![...income,...expenses].some(t=>!int(t.amount)||t.amount<0||t.currency!=='EUR');
 const incomeEURcents=cashKnown?income.reduce((sum,t)=>sum+t.amount,0):null;
 const independentCostsEURcents=cashKnown?expenses.reduce((sum,t)=>sum+t.amount,0):null;
 const capturedTradeFeesEURcents=trades.every(t=>t.feesEURcents==null||int(t.feesEURcents))?trades.reduce((sum,t)=>sum+(t.feesEURcents||0),0):null;
 const capturedTradeTaxesEURcents=trades.every(t=>t.taxesEURcents==null||int(t.taxesEURcents))?trades.reduce((sum,t)=>sum+(t.taxesEURcents||0),0):null;
 const flows=trades.filter(t=>t.type==='BUY'||t.type==='SELL').map(t=>({date:t.date,amountEURcents:t.type==='BUY'?-t.amount:t.amount}));
 if(!portfolioId)for(const t of cash)if(incomeTypes.has(t.type)||expenseTypes.has(t.type))flows.push({date:t.date,amountEURcents:incomeTypes.has(t.type)?t.amount:-t.amount});
 const valuationReliable=int(detail.valueEURcents)&&!detail.currentSource&&!detail.warnings?.some(w=>['missing-quote','missing-fx','uncertain-quantity','ambiguous-trade-order','unknown-cost-basis'].includes(w));
 const cashflowReliable=!unknownCurrency&&cashKnown&&trades.every(t=>!['BUY','SELL'].includes(t.type)||(int(t.amount)&&t.amount>=0))&&!trades.some(t=>passiveTypes.has(t.type));
 const terminal=valuationReliable?{date:detail.asOf,amountEURcents:detail.valueEURcents}:null;
 const moneyWeightedReturn=terminal&&cashflowReliable?xirr([...flows,terminal]):{rate:null,percent:null,status:terminal?'incomplete-cashflows':'incomplete-valuation'};
 // Supplied daily valuations win; otherwise they are derived from holdings x stored quotes.
 const daily=(data.dailyValuations||[]).filter(row=>row.securityId===securityId&&(!portfolioId||row.portfolioId===portfolioId)&&row.date<=detail.asOf);
 const derived=daily.length?null:dailyValuations(data,{range:'ALL',asOf:detail.asOf,securityId,portfolioId,brokerHoldingsSnapshots});
 const timeWeighted=daily.length
  ?{...timeWeightedReturn(daily),quality:'verified',reason:null}
  :periodTimeWeightedReturn(derived);
 return {securityId,portfolioId,asOf:detail.asOf,source:'captured-investment-ledger',valueEURcents:detail.valueEURcents,unrealizedGainEURcents:detail.gain,realizedGainEURcents:ledger.realizedGainEURcents,salesCount:ledger.sales,incomeEURcents,independentCostsEURcents,capturedTradeFeesEURcents,capturedTradeTaxesEURcents,moneyWeightedReturn,timeWeightedReturn:timeWeighted,dailyCoverage:derived?{from:derived.from,to:derived.to,quality:derived.quality,reason:derived.reason,days:derived.days,missing:derived.missing}:{from:daily[0]?.date??null,to:detail.asOf,quality:'verified',reason:null,days:{total:daily.length,valued:daily.length,carriedForward:0,estimated:0,open:0},missing:[]},coverage:{complete:valuationReliable&&cashflowReliable&&ledger.issues.length===0,valuationReliable,cashflowReliable,portfolioIncomeAttribution:portfolioId?'unknown':'all-security',issues:[...new Set([...ledger.issues,...(detail.warnings||[]),...(portfolioId?['portfolio-income-unattributed']:[]),...(unknownCurrency?['missing-fx']:[])])]}};
}

/* ---------------------------------------------------------------------------
 * Abgeleitete Tagesbewertungen, TTWROR und Portfolio-XIRR
 *
 * Ableitungsregeln (dailyValuations):
 * 1. Bestand je Tag = kumulierte Stückzahl aus den erfassten Depotbuchungen.
 * 2. Tageswert = Bestand × gespeicherter Kurs des Tages; fehlt der Tageskurs, wird der
 *    letzte bekannte Kurs fortgeschrieben und der Tag als `carriedForward` markiert.
 * 3. Fortschreibung bis `maxCarryForwardDays` (7) bleibt `quality:'verified'`, darüber
 *    `'estimated'`. Fehlt vor dem Tag jeder gespeicherte Kurs, gilt der zuletzt belegte Handelspreis
 *    (Eurobetrag ÷ Stück der eigenen Buchung) als Kurs, der Tag ist `'estimated'` und nennt das
 *    Papier in `tradePricedIds` (CALC-14). Erst ohne jede Preisbelegung ist der Tag unvollständig.
 *    Kurse werden nie erfunden.
 * 4. Externe Flüsse: Kauf +Betrag, Verkauf −Betrag, Ein-/Auslieferungen und Depotüberträge
 *    mit dem Tageswert der Stücke (derselbe Kurs wie die Bewertung, daher renditeneutral).
 * 5. Ausschüttungen/Zinsen des Wertpapiers bleiben im Perimeter (aufgelaufener Ertrag im
 *    Tageswert, kein externer Fluss); separat gebuchte Gebühren/Steuern liegen außerhalb.
 * 6. `flowTiming` bildet ab, wann das Geld im Perimeter gearbeitet hat: Zufluss `'start'`,
 *    Abfluss `'end'`, Eröffnungstag ohne Vorbestand `'start'`. Eine erfasste Uhrzeit außerhalb
 *    der Börsenzeit dreht das um, solange die Bezugsgröße dadurch nicht zusammenbricht.
 * --------------------------------------------------------------------------- */

const UNIT=1e8;
const RANGE_MONTHS={'1M':1,'3M':3,'6M':6,'1Y':12,'3Y':36};
const BLOCKING_WARNINGS=Object.fromEntries(['uncertain-quantity','source-snapshot-rejected','negative-position','missing-fx','ambiguous-trade-order'].map(code=>[code,ISSUE_LABELS[code]]));
const finite=value=>Number.isFinite(value)?value:null;
const ledgerUnits=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*UNIT))?Math.round(n*UNIT):null};
function subtractMonths(date,months){
 const d=new Date(date+'T12:00Z'),day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);
 d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
 return d.toISOString().slice(0,10);
}

/** PP writes 00:00 when no trade time is known; only a real clock time classifies the flow. */
const EXCHANGE_OPEN=9*60,EXCHANGE_CLOSE=17*60+30;
function tradeClock(trade){
 const value=trade?.dateTime;
 if(typeof value!=='string'||value.slice(0,10)!==trade.date)return null;
 const match=/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d)/.exec(value);
 if(!match)return null;
 const minutes=Number(match[1])*60+Number(match[2]);
 return minutes===0?null:minutes;
}
/**
 * A flow belongs on the side of the day on which the money was actually invested: money in at
 * the start, money out at the end. An end-of-day inflow would divide the whole purchase by a
 * possibly tiny prior position and turn the execution spread into a double-digit day return.
 * Only a booking clearly outside exchange hours reverses that, and only while the resulting
 * base stays meaningful.
 */
function resolveFlowTiming(priorValueEURcents,flowEURcents,clockHint){
 if(!int(priorValueEURcents)||!int(flowEURcents)||flowEURcents===0)return 'end';
 if(priorValueEURcents===0)return 'start';
 const preferred=flowEURcents>0?'start':'end';
 const reversed=preferred==='start'?'end':'start';
 const reverses=(preferred==='start'&&clockHint==='after-close')||(preferred==='end'&&clockHint==='before-open');
 if(!reverses)return preferred;
 const preferredBase=preferred==='start'?priorValueEURcents+flowEURcents:priorValueEURcents;
 const reversedBase=reversed==='start'?priorValueEURcents+flowEURcents:priorValueEURcents;
 return reversedBase>0&&reversedBase>=preferredBase*0.25?reversed:preferred;
}

/** 1M/3M/6M/YTD/1Y/3Y/ALL/CUSTOM exactly as the depot UI offers them. from:null means "ab Beginn". */
export function performancePeriod({range='ALL',from='',to='',asOf=''}={}){
 const end=(range==='CUSTOM'?to:(asOf||to))||today();
 if(!validDate(end))throw new TypeError('Das Zeitraumende muss ein ISO-Kalenderdatum sein.');
 if(range==='CUSTOM'||validDate(from)){
  if(!validDate(from))throw new TypeError('Der Zeitraumstart muss ein ISO-Kalenderdatum sein.');
  if(from>end)throw new RangeError('Der Zeitraumstart muss vor dem Ende liegen.');
  return {range:'CUSTOM',from,to:end};
 }
 if(range==='ALL')return {range,from:null,to:end};
 if(range==='YTD')return {range,from:`${Number(end.slice(0,4))-1}-12-31`,to:end};
 if(!RANGE_MONTHS[range])throw new TypeError('Unbekannter Anlagezeitraum.');
 return {range,from:subtractMonths(end,RANGE_MONTHS[range]),to:end};
}

function quoteRows(security,asOf){
 const unique=new Map();
 for(const quote of security?.quotes||[]){
  if(!Array.isArray(quote))continue;
  const [date,raw]=quote,price=Number(raw);
  if(validDate(date)&&date<=asOf&&Number.isFinite(price)&&price>=0)unique.set(date,price);
 }
 return [...unique].sort(([a],[b])=>a.localeCompare(b)).map(([date,price])=>({date,price}));
}

// The day-by-day ledger is period independent; only the accrued income depends on the window.
const ledgerCache=new WeakMap();
function cachedLedger(data,key,build){
 let store=ledgerCache.get(data);
 if(!store){store=new Map();ledgerCache.set(data,store)}
 if(store.has(key))return store.get(key);
 if(store.size>96)store.clear();
 const value=build();store.set(key,value);return value;
}

function buildLedger(data,{asOf,securityId,portfolioId,maxCarryForwardDays,brokerHoldingsSnapshots}){
 const empty=(blocked,reason)=>({rows:[],securityIds:[],notes:[reason],blocked,reason});
 const trades=(data.trades||[]).filter(t=>validDate(t.date)&&t.date<=asOf&&(!securityId||t.securityId===securityId)&&(!portfolioId||t.portfolioId===portfolioId))
  .map((trade,order)=>({trade,order})).sort((a,b)=>a.trade.date.localeCompare(b.trade.date)||a.order-b.order).map(entry=>entry.trade);
 if(!trades.length)return empty('no-trades','Keine erfassten Depotbuchungen in diesem Bereich.');
 let base=null;
 try{
  base=securityId
   ?securityDetail(data,securityId,{asOf,range:'ALL',portfolioId,brokerHoldingsSnapshots})
   :investmentOverview(data,{asOf,range:'ALL',portfolioId,brokerHoldingsSnapshots});
 }catch{return empty('invalid-period','Der Stichtag ist kein gültiges Kalenderdatum.')}
 if(!base)return empty('unknown-security','Wertpapier nicht gefunden.');
 const valueSeries=securityId?base.valueSeries:base.series;
 if(!Array.isArray(valueSeries)||!valueSeries.length)return empty('no-series','Keine Bewertungsreihe vorhanden.');

 const summaryRows=securityId?[base]:[...(base.active||[]),...(base.closed||[])];
 const blocking=[...new Set(summaryRows.flatMap(row=>(row.warnings||[]).filter(w=>Object.hasOwn(BLOCKING_WARNINGS,w))))];
 const notes=blocking.map(code=>BLOCKING_WARNINGS[code]);
 if(summaryRows.some(row=>(row.warnings||[]).includes('source-quantity-history-open')))
  notes.push('Krypto-Plattform-Marktwert stammt aus dem Quellenstand; die Tagesreihe folgt der Buchungshistorie.');

 // Income and separately booked costs are only attributable to a single depot when the security
 // was traded in exactly that depot; the captured cash rows carry no portfolio.
 const perimeterIds=[...new Set(trades.map(t=>t.securityId))];
 const perimeter=new Set(perimeterIds);
 const depotsPerSecurity=new Map();
 for(const t of data.trades||[])if(validDate(t.date)&&t.date<=asOf&&perimeter.has(t.securityId)){
  if(!depotsPerSecurity.has(t.securityId))depotsPerSecurity.set(t.securityId,new Set());
  depotsPerSecurity.get(t.securityId).add(t.portfolioId);
 }
 const attributable=id=>!portfolioId||(depotsPerSecurity.get(id)?.size===1&&depotsPerSecurity.get(id).has(portfolioId));
 const incomeByDate=new Map(),feeByDate=new Map();
 let unattributed=0,cashIssue=false;
 for(const t of data.cashTransactions||[]){
  const bucket=incomeTypes.has(t.type)?incomeByDate:expenseTypes.has(t.type)?feeByDate:null;
  if(!bucket||!t.securityId||!perimeter.has(t.securityId)||!validDate(t.date)||t.date>asOf)continue;
  if(!attributable(t.securityId)){unattributed++;continue}
  if(t.currency!=='EUR'||!int(t.amount)||t.amount<0){cashIssue=true;continue}
  bucket.set(t.date,(bucket.get(t.date)||0)+t.amount);
 }
 if(unattributed)notes.push(`${unattributed} Ausschüttungs- oder Kostenbuchungen sind keinem einzelnen Depot zuordenbar und bleiben außen vor.`);
 if(cashIssue)notes.push('Ausschüttungen oder Kosten ohne belegbaren Eurobetrag bleiben außen vor.');

 const securityById=new Map((data.securities||[]).map(s=>[s.id,s]));
 const quotes=new Map(perimeterIds.map(id=>[id,quoteRows(securityById.get(id),asOf)]));
 // Belegte Handelspreise je Papier (nur eigene Buchungen mit Eurobetrag und Stückzahl), als Rückfall vor dem ersten Kurs.
 const tradePrice=new Map();
 const cursor=new Map(),latest=new Map(),units=new Map(),missingQuoteIds=new Set(),tradePricedSecurityIds=new Set();
 let tradeIndex=0,hasPassive=false,flowIssues=0;
 const rows=[];
 for(const point of valueSeries){
  const date=point.date;
  for(const id of perimeterIds){
   const list=quotes.get(id);let index=cursor.get(id)??0;
   while(index<list.length&&list[index].date<=date)latest.set(id,list[index++]);
   cursor.set(id,index);
  }
  let flow=0,dayIssue=false;const clocks=[];
  while(tradeIndex<trades.length&&trades[tradeIndex].date<=date){
   const t=trades[tradeIndex++],sign=signType[t.type],quantity=ledgerUnits(t.shares);
   if(sign===undefined||quantity===null){dayIssue=true;continue}
   units.set(t.securityId,(units.get(t.securityId)||0)+sign*quantity);
   if(t.currency==='EUR'&&int(t.amount)&&t.amount>0&&quantity>0)tradePrice.set(t.securityId,{date:t.date,price:t.amount/100/(quantity/UNIT)});
   clocks.push(tradeClock(t));
   if(t.type==='BUY'||t.type==='SELL'){
    if(t.currency!=='EUR'||!int(t.amount)||t.amount<0)dayIssue=true;else flow+=sign*t.amount;
   }else{
    hasPassive=true;
    const quote=latest.get(t.securityId),value=quote?Math.round(quantity/UNIT*quote.price*100):null;
    if(value===null||!int(value))dayIssue=true;else flow+=sign*value;
   }
  }
  let carriedForwardDays=0,tradingDaysSinceQuote=0,missingQuote=false,tradePricedValue=0;
  let tradePricedIds=[];
  for(const [id,held] of units){
   if(Math.abs(held)<1)continue;
   const quote=latest.get(id);
   if(quote){carriedForwardDays=Math.max(carriedForwardDays,days(quote.date,date));tradingDaysSinceQuote=Math.max(tradingDaysSinceQuote,tradingDaysBetween(quote.date,date));continue}
   const fallback=tradePrice.get(id);
   if(fallback&&held>0){tradePricedIds.push(id);tradePricedValue+=Math.round(held/UNIT*fallback.price*100);continue}
   missingQuote=true;missingQuoteIds.add(id);
  }
  let marketValueEURcents=point.complete===true&&int(point.valueEURcents)?point.valueEURcents:null;
  if(marketValueEURcents!==null)tradePricedIds=[];
  else if(tradePricedIds.length&&!missingQuote&&!dayIssue&&int(point.knownValueEURcents)){
   // Der Rückfall gilt nur, wenn genau die Papiere fehlen, für die ein Handelspreis belegt ist.
   const missing=new Set(point.missingSecurityIds||[]);
   if(missing.size===tradePricedIds.length&&tradePricedIds.every(id=>missing.has(id))){
    marketValueEURcents=point.knownValueEURcents+tradePricedValue;
    for(const id of tradePricedIds)tradePricedSecurityIds.add(id);
   }else tradePricedIds=[];
  }else tradePricedIds=[];
  const complete=marketValueEURcents!==null&&!missingQuote&&!dayIssue;
  if(marketValueEURcents===null)for(const id of point.missingSecurityIds||[])if(!tradePrice.has(id))missingQuoteIds.add(id);
  if(dayIssue)flowIssues++;
  rows.push({
   date,marketValueEURcents,complete,
   quality:!complete?'open':tradePricedIds.length||carriedForwardDays>maxCarryForwardDays?'estimated':'verified',
   carriedForward:carriedForwardDays>0,carriedForwardDays,tradingDaysSinceQuote,tradePricedIds,
   externalFlowEURcents:flow,
   flowClockHint:clocks.length>0&&clocks.every(clock=>clock!==null&&clock>=EXCHANGE_CLOSE)?'after-close'
    :clocks.length>0&&clocks.every(clock=>clock!==null&&clock<EXCHANGE_OPEN)?'before-open':null,
   incomeEURcents:incomeByDate.get(date)||0,feeEURcents:feeByDate.get(date)||0,
  });
 }
 if(hasPassive)notes.push('Ein- und Auslieferungen werden mit dem Tageswert als Einlage bzw. Entnahme behandelt; ein Kaufpreis ist dafür nicht belegt.');
 if(flowIssues)notes.push(`${plural(flowIssues,'Tag','Tage')} mit Buchungen ohne belegbaren Eurobetrag.`);
 const nameOf=id=>securityById.get(id)?.name||'Unbekanntes Wertpapier';
 if(tradePricedSecurityIds.size)notes.push(`Kurs aus dem eigenen Handelspreis fortgeschrieben (kein gespeicherter Kurs davor): ${[...tradePricedSecurityIds].map(nameOf).sort().join(', ')}.`);
 if(missingQuoteIds.size)notes.push(`Ohne gespeicherten Kurs im Bestandszeitraum: ${[...missingQuoteIds].map(nameOf).sort().join(', ')}.`);
 return {rows,securityIds:perimeterIds,tradePricedSecurityIds:[...tradePricedSecurityIds].sort(),notes:[...new Set(notes)],
  blocked:blocking.length?'source-quality':null,
  reason:blocking.length?blocking.map(code=>BLOCKING_WARNINGS[code]).join(' · '):null};
}

function valuationLedger(data,options){
 // The size fingerprint keeps an in-place edit of the same object from reusing a stale ledger.
 const fingerprint=[data.asOf??'',(data.trades||[]).length,(data.cashTransactions||[]).length,(data.securities||[]).length,(data.portfolios||[]).length].join('/');
 const key=JSON.stringify(['ledger',fingerprint,options.asOf,options.securityId,options.portfolioId,options.maxCarryForwardDays,options.brokerHoldingsSnapshots??null]);
 return cachedLedger(data,key,()=>buildLedger(data,options));
}

/**
 * Tagesbewertungen für genau den Zeitraum, den timeWeightedReturn() erwartet.
 * Die Punkte tragen complete, quality, externalFlowEURcents und flowTiming.
 */
export function dailyValuations(data,options={}){
 const {range,from,to}=performancePeriod(options);
 const maxCarryForwardDays=Number.isSafeInteger(options.maxCarryForwardDays)&&options.maxCarryForwardDays>=0?options.maxCarryForwardDays:7;
 const ledger=valuationLedger(data&&typeof data==='object'?data:{},{asOf:to,securityId:options.securityId||'',portfolioId:options.portfolioId||'',maxCarryForwardDays,brokerHoldingsSnapshots:options.brokerHoldingsSnapshots});
 const blank=reason=>({range,from:null,to,points:[],quality:'open',reason,
  days:{total:0,valued:0,carriedForward:0,tradingDaysWithoutQuote:0,estimated:0,tradePriced:0,open:0},missing:[...new Set(ledger.notes||[])],securityIds:ledger.securityIds||[],tradePricedSecurityIds:[]});
 if(!ledger.rows.length)return blank(ledger.reason||'Keine Tagesreihe ableitbar.');
 let window=ledger.rows.filter(row=>(!from||row.date>=from)&&row.date<=to);
 // A leading day without a usable quote only shortens the series; it never invents a start value.
 const firstComplete=window.findIndex(row=>row.complete);
 const trimmed=firstComplete>0?firstComplete:0;
 if(trimmed)window=window.slice(trimmed);
 let accrued=0;
 const points=window.map((row,index)=>{
  if(index)accrued+=row.incomeEURcents;
  return {date:row.date,
   valueEURcents:row.marketValueEURcents===null?null:row.marketValueEURcents+accrued,
   marketValueEURcents:row.marketValueEURcents,accruedIncomeEURcents:accrued,
   externalFlowEURcents:row.externalFlowEURcents,flowTiming:'end',flowClockHint:row.flowClockHint,
   complete:row.complete,quality:row.quality,
   carriedForward:row.carriedForward,carriedForwardDays:row.carriedForwardDays,tradingDaysSinceQuote:row.tradingDaysSinceQuote||0,tradePricedIds:row.tradePricedIds||[]};
 });
 // The timing needs the previous day's value, so it is resolved once the window is known.
 for(let i=1;i<points.length;i++)points[i].flowTiming=resolveFlowTiming(points[i-1].valueEURcents,points[i].externalFlowEURcents,points[i].flowClockHint);
 const open=points.filter(point=>!point.complete).length;
 const estimated=points.filter(point=>point.quality==='estimated').length;
 const tradePriced=points.filter(point=>point.tradePricedIds.length).length;
 const tradePricedSecurityIds=[...new Set(points.flatMap(point=>point.tradePricedIds))].sort();
 // Wochenenden zählen nicht als Lücke: nur ein Werktag ohne eigenen Kurs ist ein „Handelstag ohne Kurs“ (CALC-15).
 const tradingDaysWithoutQuote=points.filter(p=>p.complete&&p.carriedForward&&weekday(p.date)).length;
 const dayCounts={total:points.length,valued:points.length-open,carriedForward:points.filter(p=>p.complete&&p.carriedForward).length,tradingDaysWithoutQuote,estimated,tradePriced,open};
 const missing=[...new Set(ledger.notes||[])];
 if(trimmed)missing.push(`Die Reihe beginnt erst am ${points[0]?.date}; davor fehlt ein belegter Kurs.`);
 const quality=ledger.blocked||points.length<2||open?'open':estimated?'estimated':'verified';
 const carriedBeyond=points.filter(point=>point.quality==='estimated'&&!point.tradePricedIds.length).length;
 const estimatedReason=[
  tradePricedSecurityIds.length?`Kurs aus Handelspreis (${plural(tradePricedSecurityIds.length,'Papier','Papiere')})`:'',
  carriedBeyond?`${plural(tradingDaysWithoutQuote,'Handelstag','Handelstage')} ohne eigenen Kurs, zum Teil über ${maxCarryForwardDays} Tage fortgeschrieben`:'',
 ].filter(Boolean).join(' · ');
 const reason=ledger.blocked?ledger.reason
  :points.length<2?'Zu wenige Bewertungstage in diesem Zeitraum.'
  :open?`${plural(open,'Tag','Tage')} ohne vollständige Bewertung.`
  :estimated?estimatedReason+'.':null;
 if(reason&&quality==='open')missing.push(reason);
 return {range,from:points[0]?.date??null,to,points,quality,reason,days:dayCounts,missing:[...new Set(missing)],securityIds:ledger.securityIds,tradePricedSecurityIds};
}

/**
 * Lückenlose Tagesreihe für den Depotchart. Grundlage sind die Bewertungsreihe des Modells
 * (Tagessumme und bekannte Teilsumme je Tag) und dailyValuations() für die Fortschreibung;
 * eine zweite Bewertungslogik entsteht hier nicht.
 *
 * Ein Tag ohne eigenen Kurs behält den zuletzt bekannten Wert und bleibt als fortgeschrieben
 * markiert, über maxCarryForwardDays hinaus als geschätzt. Nur ein Wertpapier ohne jeden
 * früheren Kurs fehlt in der Tagessumme; der übrige Depotwert wird trotzdem als Teilsumme
 * geführt, damit die Linie nicht abreißt. Erst wenn kein einziges Wertpapier bewertbar ist,
 * bleibt der Tag offen — eine Lücke ist kein Nullwert.
 */
export function continuousValueSeries(series=[],valuations=null,options={}){
 const maxCarryForwardDays=int(options.maxCarryForwardDays)&&options.maxCarryForwardDays>=0?options.maxCarryForwardDays:7;
 const byDate=new Map((valuations?.points||[]).map(point=>[point.date,point]));
 const missingSecurityIds=new Set();
 const points=(Array.isArray(series)?series:[]).filter(point=>validDate(point?.date)).map(point=>{
  const day=byDate.get(point.date)||null;
  const carriedForwardDays=int(day?.carriedForwardDays)&&day.carriedForwardDays>0?day.carriedForwardDays:0;
  const tradingDaysSinceQuote=int(day?.tradingDaysSinceQuote)&&day.tradingDaysSinceQuote>0?day.tradingDaysSinceQuote:0;
  const total=int(point.valueEURcents)?point.valueEURcents:null;
  const known=int(point.knownValueEURcents)?point.knownValueEURcents:null;
  const open=total===null?[...new Set(point.missingSecurityIds||[])].sort():[];
  for(const id of open)missingSecurityIds.add(id);
  const partial=total===null&&known!==null&&known>0;
  const valueEURcents=total!==null?total:partial?known:null;
  const estimated=valueEURcents!==null&&(partial||(day?day.quality==='estimated':carriedForwardDays>maxCarryForwardDays));
  return {date:point.date,valueEURcents,complete:total!==null,partial,
   carriedForward:valueEURcents!==null&&carriedForwardDays>0,carriedForwardDays,
   tradingDaysSinceQuote:valueEURcents!==null?tradingDaysSinceQuote:0,
   quality:valueEURcents===null?'open':estimated?'estimated':'verified',
   missingSecurityIds:open};
 });
 const count=predicate=>points.filter(predicate).length;
 const days={total:points.length,
  verified:count(point=>point.quality==='verified'),
  carriedForward:count(point=>point.carriedForward),
  tradingDaysWithoutQuote:count(point=>point.carriedForward&&weekday(point.date)),
  estimated:count(point=>point.quality==='estimated'),
  partial:count(point=>point.partial),
  partialTradingDays:count(point=>point.partial&&weekday(point.date)),
  open:count(point=>point.valueEURcents===null),
  openTradingDays:count(point=>point.valueEURcents===null&&weekday(point.date))};
 return {points,days,missingSecurityIds:[...missingSecurityIds].sort(),
  continuous:points.length>0&&days.open===0,
  first:points.find(point=>point.valueEURcents!==null)||null,
  last:[...points].reverse().find(point=>point.valueEURcents!==null)||null};
}

/**
 * TTWROR über die abgeleitete Tagesreihe. Tage ohne Kapital im Perimeter (kein Bestand und
 * kein Fluss) sind renditeneutral; sie trennen die Reihe in Abschnitte, deren Faktoren
 * verkettet werden, statt die gesamte Auswertung zu verwerfen.
 */
export function periodTimeWeightedReturn(valuations){
 const fail=(status,reason)=>({rate:null,percent:null,status,reason,quality:valuations?.quality??'open'});
 if(!valuations||!Array.isArray(valuations.points))return fail('insufficient-valuations','Keine Tagesreihe vorhanden.');
 if(valuations.quality==='open')return fail('incomplete-daily-coverage',valuations.reason||'Tagesreihe unvollständig.');
 const points=valuations.points,segments=[];
 let current=null;
 for(let i=1;i<points.length;i++){
  const prior=points[i-1],point=points[i];
  const denominator=point.flowTiming==='start'?prior.valueEURcents+point.externalFlowEURcents:prior.valueEURcents;
  const computable=int(prior.valueEURcents)&&int(point.valueEURcents)&&int(point.externalFlowEURcents)&&denominator>0;
  if(computable){if(!current){current=[prior];segments.push(current)}current.push(point)}
  else current=null;
 }
 if(!segments.length)return fail('insufficient-valuations','Im Zeitraum war kein Kapital im Depot investiert.');
 const acceptEstimated=valuations.quality==='estimated';
 let factor=1;
 for(const segment of segments){
  const result=timeWeightedReturn(segment,{acceptEstimated});
  if(result.rate===null)return fail(result.status,'Die Tagesreihe erfüllt die Prüfregeln nicht.');
  factor*=1+result.rate;
 }
 const rate=factor-1;
 if(!Number.isFinite(rate))return fail('invalid-valuation','Das Rechenergebnis ist nicht darstellbar.');
 return {rate,percent:rate*100,status:'complete',quality:valuations.quality,
  reason:valuations.quality==='estimated'?valuations.reason:null};
}

/** Geldgewichtete Rendite des Perimeters: Anfangswert, externe Flüsse, separate Kosten, Endwert. */
function periodMoneyWeightedReturn(valuations,{feeFlows=[]}={}){
 const fail=(status,reason)=>({rate:null,percent:null,status,reason});
 if(!valuations||!Array.isArray(valuations.points)||valuations.points.length<2)return fail('insufficient-valuations',valuations?.reason||'Zu wenige Bewertungstage.');
 if(valuations.quality==='open')return fail('incomplete-valuation',valuations.reason||'Tagesreihe unvollständig.');
 const points=valuations.points,opening=points[0],closing=points.at(-1);
 if(!int(opening.valueEURcents)||!int(closing.valueEURcents))return fail('incomplete-valuation','Anfangs- oder Endwert nicht belegt.');
 const flows=[{date:opening.date,amountEURcents:-opening.valueEURcents}];
 for(let i=1;i<points.length;i++)if(points[i].externalFlowEURcents)flows.push({date:points[i].date,amountEURcents:-points[i].externalFlowEURcents});
 for(const fee of feeFlows)if(int(fee.amountEURcents)&&fee.amountEURcents!==0&&fee.date>opening.date&&fee.date<=closing.date)flows.push(fee);
 flows.push({date:closing.date,amountEURcents:closing.valueEURcents});
 const result=xirr(flows);
 return {...result,reason:result.rate===null?'Die Zahlungsreihe lässt keine eindeutige Rendite zu.':null};
}

function realizedBetween(data,{securityIds,portfolioId,from,to}){
 let total=0,known=true;
 for(const id of securityIds){
  const all=(data.trades||[]).filter(t=>t.securityId===id&&(!portfolioId||t.portfolioId===portfolioId)&&validDate(t.date)&&t.date<=to);
  if(!all.length)continue;
  const untilStart=from?all.filter(t=>t.date<=from):[];
  const after=realizedLedger(all),before=realizedLedger(untilStart);
  if(after.realizedGainEURcents===null||before.realizedGainEURcents===null){known=false;continue}
  total+=after.realizedGainEURcents-before.realizedGainEURcents;
 }
 return known?total:null;
}

function levelFigures(data,{level,id,name,securityId,portfolioId,range,from,to,maxCarryForwardDays,brokerHoldingsSnapshots}){
 const valuations=dailyValuations(data,{range,from:from||'',to,asOf:to,securityId,portfolioId,maxCarryForwardDays,brokerHoldingsSnapshots});
 const ledger=valuationLedger(data,{asOf:to,securityId:securityId||'',portfolioId:portfolioId||'',maxCarryForwardDays:Number.isSafeInteger(maxCarryForwardDays)?maxCarryForwardDays:7,brokerHoldingsSnapshots});
 const start=valuations.from,rows=(ledger.rows||[]).filter(row=>(!start||row.date>start)&&row.date<=to);
 const income=rows.reduce((total,row)=>total+row.incomeEURcents,0);
 const fees=rows.reduce((total,row)=>total+row.feeEURcents,0);
 const feeFlows=rows.filter(row=>row.feeEURcents).map(row=>({date:row.date,amountEURcents:-row.feeEURcents}));
 const ttwror=periodTimeWeightedReturn(valuations);
 const money=periodMoneyWeightedReturn(valuations,{feeFlows});
 const realized=realizedBetween(data,{securityIds:ledger.securityIds||[],portfolioId,from:start,to});
 let marketValue=null,costBasis=null;
 try{
  if(securityId){
   const detail=securityDetail(data,securityId,{asOf:to,range:'ALL',portfolioId,brokerHoldingsSnapshots});
   marketValue=int(detail?.valueEURcents)?detail.valueEURcents:null;
   costBasis=int(detail?.cost)?detail.cost:null;
  }else{
   const overview=investmentOverview(data,{asOf:to,range:'ALL',portfolioId,brokerHoldingsSnapshots});
   marketValue=int(overview.currentValuation.valueEURcents)?overview.currentValuation.valueEURcents:null;
   costBasis=overview.active.every(row=>int(row.cost))?overview.active.reduce((total,row)=>total+row.cost,0):null;
  }
 }catch{marketValue=null;costBasis=null}
 const unrealized=marketValue!==null&&costBasis!==null?marketValue-costBasis:null;
 // Ein Depot ohne Bestand und ohne Fluss im Zeitraum hat keine Rendite, sondern gar kein Kapital (CALC-14).
 const capital=valuations.points.some(point=>(point.valueEURcents??0)>0||point.externalFlowEURcents!==0);
 const missing=[...valuations.missing];
 if(costBasis===null)missing.push('Einstand nicht vollständig belegt.');
 if(realized===null)missing.push('Realisiertes Ergebnis nicht vollständig belegbar.');
 return {
  level,id,name,from:valuations.from,to,range,
  marketValue,costBasis,realized,unrealized,income,fees,
  xirr:{percent:finite(money.percent),rate:finite(money.rate),status:money.status,reason:money.reason??null},
  ttwror:{percent:finite(ttwror.percent),rate:finite(ttwror.rate),status:ttwror.status,reason:ttwror.reason??null},
  quality:valuations.quality,qualityReason:valuations.reason,capital,
  days:valuations.days,tradePricedSecurityIds:valuations.tradePricedSecurityIds||[],missing:[...new Set(missing)],securityIds:ledger.securityIds||[],
 };
}

/**
 * Kennzahlen je Ebene: Gesamtperimeter, Depot und Wertpapier.
 * Geldbeträge sind ganzzahlige Eurocent, Renditen Prozentpunkte oder null mit Begründung.
 */
export function performanceSummary(investments,options={}){
 const data=investments&&typeof investments==='object'?investments:{};
 const period=performancePeriod(options);
 const to=period.to,portfolioId=options.portfolioId||'';
 const maxCarryForwardDays=Number.isSafeInteger(options.maxCarryForwardDays)&&options.maxCarryForwardDays>=0?options.maxCarryForwardDays:7;
 const brokerHoldingsSnapshots=options.brokerHoldingsSnapshots;
 const shared={range:period.range,from:period.from,to,maxCarryForwardDays,brokerHoldingsSnapshots};
 // A caller that renders one level only should not pay for the others.
 const include=new Set(Array.isArray(options.include)&&options.include.length?options.include:['total','portfolios','securities']);
 let overview=null;
 try{overview=investmentOverview(data,{asOf:to,range:'ALL',portfolioId,brokerHoldingsSnapshots})}catch{overview=null}
 const depots=(data.portfolios||[]).filter(depot=>!portfolioId||depot.id===portfolioId);
 const requested=Array.isArray(options.securityIds)?options.securityIds.filter(id=>typeof id==='string'&&id):null;
 const securityIds=[...new Set(requested??(overview?.active||[]).map(row=>row.id))];
 const names=new Map((data.securities||[]).map(security=>[security.id,security.name||'Unbekanntes Wertpapier']));
 return {
  asOf:to,range:period.range,from:period.from,to,portfolioId,
  total:include.has('total')?levelFigures(data,{level:'total',id:portfolioId||'all',name:portfolioId?(depots[0]?.name||'Depot'):'Alle Depots',securityId:'',portfolioId,...shared}):null,
  portfolios:include.has('portfolios')?depots.map(depot=>levelFigures(data,{level:'portfolio',id:depot.id,name:depot.name||'Unbekanntes Depot',securityId:'',portfolioId:depot.id,...shared})):[],
  securities:include.has('securities')?securityIds.map(id=>levelFigures(data,{level:'security',id,name:names.get(id)||'Unbekanntes Wertpapier',securityId:id,portfolioId,...shared})):[],
 };
}
