import {resolveDebtTerms} from './debt-model.mjs';
import {cardPaymentMode} from './debt-policy.mjs';
import {monthAdd} from './model.mjs';
import {dt} from './text-format.mjs';
const integer=Number.isSafeInteger;
const nonnegative=n=>integer(n)&&n>=0;
const apr=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
const total=values=>values.reduce((a,b)=>a+b,0);
const dateFor=(month,day=31)=>`${month}-${String(Math.min(day,new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate())).padStart(2,'0')}`;
export function strategyDebts(live={},settings={},asOf){
 const canonical=settings.debts||[],profiles=settings.debtProfiles||{},rows=[],excluded=[];
 for(const account of live.accounts||[]){
  if(account.closed)continue;
  const record=canonical.find(d=>d.accountId===account.id),terms=record?resolveDebtTerms(record,asOf):profiles[account.id],mode=terms?.paymentMode||cardPaymentMode(account,settings,asOf);
  if(mode==='full-pay'||cardPaymentMode(account,settings,asOf)==='full-pay'){excluded.push({id:record?.id||account.id,accountId:account.id,name:account.name,reason:'Monatlich vollständig ausgeglichene Karte'});continue;}
  if(integer(account.balance)&&account.balance>=0)continue;
  const missing=[];if(!integer(account.balance))missing.push('Aktueller belegter Kontosaldo');
  if(!terms)missing.push(record?'Am Stichtag gültige Kreditkonditionen':'Bestätigte Kreditkonditionen');
  const nominal=apr(terms?.nominalApr)?terms.nominalApr:null,effective=apr(terms?.effectiveApr)?terms.effectiveApr:null;
  if(nominal===null&&effective===null)missing.push('Soll- oder Effektivzinssatz');
  const minimum=terms?.paymentEURcents??terms?.minimumPaymentEURcents;if(!integer(minimum)||minimum<=0)missing.push('Positive monatliche Mindestrate');
  const rate=nominal!==null?nominal/1200:effective!==null?Math.pow(1+effective/100,1/12)-1:null;
  rows.push({id:record?.id||'legacy:'+account.id,accountId:account.id,name:record?.name||account.name,balanceEURcents:integer(account.balance)?Math.max(0,-account.balance):null,minimumEURcents:integer(minimum)&&minimum>0?minimum:null,monthlyRate:rate,apr:nominal??effective,aprBasis:nominal!==null?'nominal':'effective',monthlyFeesEURcents:nonnegative(terms?.monthlyFeesEURcents)?terms.monthlyFeesEURcents:null,dueDay:integer(terms?.dueDay)&&terms.dueDay>=1&&terms.dueDay<=31?terms.dueDay:31,source:record?'Konditionsrevision '+(terms?.effectiveFrom?dt(terms.effectiveFrom):'fehlt'):'Bestehendes Kreditprofil · undatiert',missing,complete:missing.length===0});
 }
 // A deleted/unloaded canonical account is not a paid-off loan.
 for(const record of canonical)if(!(live.accounts||[]).some(a=>a.id===record.accountId))rows.push({id:record.id,accountId:record.accountId,name:record.name,balanceEURcents:null,minimumEURcents:null,monthlyRate:null,monthlyFeesEURcents:null,dueDay:31,missing:['Verknüpftes Actual-Konto fehlt'],complete:false,source:'Kanonische Schuld'});
 return {rows,excluded,complete:rows.every(r=>r.complete),missing:rows.flatMap(r=>r.missing.map(reason=>({id:r.id,name:r.name,reason})))};
}
export function gateExtraPayment(debts,forecast,requestedEURcents){
 if(!nonnegative(requestedEURcents))throw Error('Die zusätzliche Monatsrate muss nichtnegative ganze Cent enthalten.');
 if(!forecast?.complete||!integer(forecast.minAvailable)||!forecast.series?.length)return {allowedEURcents:0,requestedEURcents,complete:false,reason:'Liquiditätsprognose oder Kontostände unvollständig.',uncoveredMinimums:[]};
 if(debts.some(d=>!d.complete))return {allowedEURcents:0,requestedEURcents,complete:false,reason:'Erst fehlende Kreditdaten ergänzen.',uncoveredMinimums:[]};
 const months=[...new Set(forecast.series.map(p=>p.date.slice(0,7)))],uncoveredMinimums=[];
 for(const month of months)for(const debt of debts){const date=dateFor(month,debt.dueDay);if(date<=forecast.asOf||date>forecast.to)continue;const documented=total((forecast.events||[]).filter(e=>e.date.slice(0,7)===month&&e.counterpartyAccountId===debt.accountId&&e.amountEURcents<0).map(e=>-e.amountEURcents));if(documented<debt.minimumEURcents)uncoveredMinimums.push({debtId:debt.id,name:debt.name,date,amountEURcents:debt.minimumEURcents-documented});}
 let cap=Infinity,payments=0,minimumShortfallEURcents=0;const dates=months.map(m=>dateFor(m)).filter(d=>d>forecast.asOf&&d<=forecast.to);
 for(const point of forecast.series){const reserved=total(uncoveredMinimums.filter(p=>p.date<=point.date).map(p=>p.amountEURcents)),headroom=point.available-reserved,n=dates.filter(d=>d<=point.date).length;minimumShortfallEURcents=Math.max(minimumShortfallEURcents,-headroom);payments=Math.max(payments,n);if(headroom<0)cap=0;else if(n)cap=Math.min(cap,Math.floor(headroom/n));}
 if(!payments||!Number.isFinite(cap))cap=0;
 const allowedEURcents=Math.min(requestedEURcents,Math.max(0,cap));
 return {requestedEURcents,allowedEURcents,complete:true,minimumShortfallEURcents,baseAffordable:minimumShortfallEURcents===0,reason:minimumShortfallEURcents>0?'Schon der Basisplan einschließlich Mindestraten unterschreitet gebundene Mittel oder den geschützten Puffer.':allowedEURcents<requestedEURcents?'Gewünschte Zusatzzahlung würde innerhalb des Ausblicks gebundene Mittel oder den geschützten Puffer unterschreiten.':'Zusatzzahlung passt rechnerisch in den gewählten Liquiditätsausblick.',uncoveredMinimums,through:forecast.to,paymentMonths:payments,maximumEURcents:Math.max(0,cap),definition:'Monatliche Zusatzrate zum Monatsende; vorhandene Prognose bereits nach Puffer. Nicht eindeutig im Ausblick abgebildete Kredit-Mindestraten werden vorsichtshalber zusätzlich reserviert. Aussage gilt nur bis zum Ende dieses Ausblicks.'};
}
export function simulateDebtStrategy(debts,{strategy='avalanche',extraEURcents=0,startMonth,maxMonths=1200}={}){
 if(!['avalanche','snowball'].includes(strategy)||!nonnegative(extraEURcents)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth||'')||!integer(maxMonths)||maxMonths<1||maxMonths>1200)throw Error('Ungültige Tilgungssimulation.');
 if(!debts.length)return {valid:false,reason:'Keine offenen finanzierenden Schulden im ausgewählten Datenbestand.',rows:[]};
 if(debts.some(d=>!d.complete||!nonnegative(d.balanceEURcents)||!integer(d.minimumEURcents)||d.minimumEURcents<=0||typeof d.monthlyRate!=='number'||!Number.isFinite(d.monthlyRate)||d.monthlyRate<0))return {valid:false,reason:'Saldo, Zinssatz oder Mindestrate fehlen.',rows:[]};
 const loans=debts.map(d=>({...d,balance:d.balanceEURcents,interest:0,fees:0,paid:0,paidOffMonth:null})),startingDebt=total(loans.map(d=>d.balance)),budget=total(loans.map(d=>d.minimumEURcents))+extraEURcents,rows=[],feesKnown=loans.every(d=>nonnegative(d.monthlyFeesEURcents));
 if(!integer(startingDebt)||!integer(budget))throw Error('Beträge überschreiten den unterstützten Centbereich.');
 for(let i=0;i<maxMonths;i++){
  const month=monthAdd(startMonth+'-01',i).slice(0,7),active=loans.filter(d=>d.balance>0),startBalance=total(active.map(d=>d.balance)),charges=new Map(),payments=new Map();let funds=budget;
  for(const loan of active){const interest=Math.round(loan.balance*loan.monthlyRate),fees=loan.monthlyFeesEURcents??0;loan.balance+=interest+fees;loan.interest+=interest;loan.fees+=fees;charges.set(loan.id,{interest,fees});const payment=Math.min(loan.minimumEURcents,loan.balance);loan.balance-=payment;loan.paid+=payment;funds-=payment;payments.set(loan.id,payment);}
  const ranked=[...active].sort(strategy==='avalanche'?(a,b)=>b.monthlyRate-a.monthlyRate||a.balance-b.balance||a.id.localeCompare(b.id):(a,b)=>a.balance-b.balance||b.monthlyRate-a.monthlyRate||a.id.localeCompare(b.id));
  for(const loan of ranked){if(!funds)break;const payment=Math.min(loan.balance,funds);loan.balance-=payment;loan.paid+=payment;funds-=payment;payments.set(loan.id,(payments.get(loan.id)||0)+payment);}
  const balance=total(loans.map(d=>d.balance));
  if(!integer(balance)||loans.some(d=>!integer(d.balance)))return {valid:false,reason:'Die Simulation überschreitet den unterstützten Centbereich.',rows};
  const negativeAmortization=active.filter(d=>d.balance>0&&(payments.get(d.id)||0)<=(charges.get(d.id).interest+charges.get(d.id).fees));
  if(negativeAmortization.length||balance>=startBalance&&balance>0)return {valid:false,reason:'Rate deckt Zinsen und bekannte Gebühren nicht ausreichend: '+negativeAmortization.map(d=>d.name).join(', '),rows,insufficientIds:negativeAmortization.map(d=>d.id)};
  for(const loan of active)if(!loan.balance&&!loan.paidOffMonth)loan.paidOffMonth=month;
  rows.push({month,balanceEURcents:balance,paymentEURcents:budget-funds,interestEURcents:total([...charges.values()].map(c=>c.interest)),feesEURcents:total([...charges.values()].map(c=>c.fees)),loans:active.map(d=>({id:d.id,name:d.name,paymentEURcents:payments.get(d.id)||0,balanceEURcents:d.balance}))});
  if(!balance)return {valid:true,strategy,months:rows.length,endMonth:month,startingDebtEURcents:startingDebt,monthlyBudgetEURcents:budget,interestEURcents:total(loans.map(d=>d.interest)),knownFeesEURcents:total(loans.map(d=>d.fees)),feesKnown,totalFinancingCostEURcents:feesKnown?total(loans.map(d=>d.interest+d.fees)):null,totalPaidEURcents:total(loans.map(d=>d.paid)),loans,rows};
 }
 return {valid:false,reason:'Im begrenzten Modellhorizont von '+maxMonths+' Monaten nicht vollständig getilgt.',rows};
}
export function compareDebtStrategies(live,settings,forecast,{asOf,requestedExtraEURcents=0,avalancheFeeEURcents=null,snowballFeeEURcents=null}={}){
 const scope=strategyDebts(live,settings,asOf),gate=gateExtraPayment(scope.rows,forecast,requestedExtraEURcents),startMonth=monthAdd(asOf.slice(0,7)+'-01',1).slice(0,7),options={extraEURcents:gate.allowedEURcents,startMonth};
 const avalanche=scope.complete?simulateDebtStrategy(scope.rows,{...options,strategy:'avalanche'}):{valid:false,reason:'Kreditdaten unvollständig.',rows:[]},snowball=scope.complete?simulateDebtStrategy(scope.rows,{...options,strategy:'snowball'}):{valid:false,reason:'Kreditdaten unvollständig.',rows:[]};
 for(const fee of [avalancheFeeEURcents,snowballFeeEURcents])if(fee!==null&&!nonnegative(fee))throw Error('Sondertilgungsgebühren bitte als nichtnegative Cent oder unbekannt erfassen.');
 const valid=avalanche.valid&&snowball.valid,interestAdvantageEURcents=valid?snowball.interestEURcents-avalanche.interestEURcents:null,feesComplete=valid&&avalanche.feesKnown&&snowball.feesKnown&&avalancheFeeEURcents!==null&&snowballFeeEURcents!==null;
 const netAdvantageEURcents=feesComplete?snowball.totalFinancingCostEURcents+snowballFeeEURcents-avalanche.totalFinancingCostEURcents-avalancheFeeEURcents:null;
 return {scope,gate,avalanche,snowball,valid,interestAdvantageEURcents,netAdvantageEURcents,feeBreakEvenEURcents:valid&&avalanche.feesKnown&&snowball.feesKnown?snowball.totalFinancingCostEURcents-avalanche.totalFinancingCostEURcents:null,feesComplete,definition:'Modellsimulation ab Folgemonat: monatliche Verzinsung, konstante bestätigte Konditionen, bekannte laufende Gebühren, feste Mindestraten. Frei werdende Raten bleiben im gemeinsamen Tilgungsbudget. Keine Kreditaufnahme, Zahlung oder Änderung des Budgets; keine Garantie unveränderter variabler Zinsen.'};
}
