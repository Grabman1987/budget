import {resolveTargetRevision} from './target-model.mjs';
const cents=Number.isSafeInteger;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna'}).format(new Date());
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00Z'))&&new Date(d+'T12:00Z').toISOString().slice(0,10)===d;
export function normalizeFutureEvidence(input){
 const earliestDate=input.earliestDate||null,latestDate=input.latestDate||null,date=input.date||input.dueDate;
 if(earliestDate&&(!validDate(earliestDate)||earliestDate>date)||latestDate&&(!validDate(latestDate)||latestDate<date)||earliestDate&&latestDate&&earliestDate>latestDate)throw Error('Das Zahlungsfenster muss die gewählte Fälligkeit enthalten.');
 const raw=input.settlementTransactionIds??[],ids=typeof raw==='string'?raw.split(/[\s,;]+/).filter(Boolean):raw;
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw Error('Zahlungsreferenzen müssen eindeutige Buchungsanteil-IDs sein.');
 return {earliestDate,latestDate,settlementTransactionIds:[...ids],settlementEvidence:input.settlementEvidence?structuredClone(input.settlementEvidence):null};
}
function settlementRows(live){
 const raw=live.rawTransactions||live.transactions||[],byId=new Map(),parents=new Map(raw.filter(r=>r.id).map(r=>[r.id,r])),parentIds=new Set(raw.filter(r=>r.parent_id).map(r=>r.parent_id));
 const add=(row,parent={})=>{if(row.tombstone||parent.tombstone)return;const r={...parent,...row,account:row.account??parent.account,date:row.date??parent.date,payee:row.payee??parent.payee,transfer_id:row.transfer_id??parent.transfer_id};if(!row.id)return;const list=byId.get(row.id)||[];list.push(r);byId.set(row.id,list);};
 for(const row of raw){if(row.tombstone)continue;if(row.subtransactions?.length&&!row.parent_id){for(const leaf of row.subtransactions)add(leaf,row);}else if(!row.is_parent&&!parentIds.has(row.id))add(row,parents.get(row.parent_id));}
 return byId;
}
const identity=row=>({id:row.id,accountId:row.account,date:row.date,amountEURcents:row.amount});
function futureSettlement(item,live={},settings={},asOf=today()){
 const ids=item.settlementTransactionIds||[],conflicts=[];
 if(item.status==='cancelled')return {status:'cancelled',conflicts,rows:[],amountEURcents:null};
 if(!ids.length)return {status:item.status==='paid'?'manual-paid':'open',conflicts,rows:[],amountEURcents:null};
 const candidates=settlementRows(live),payees=new Map((live.payees||[]).map(p=>[p.id,p])),rows=[];
 if(!item.accountId||!(live.accounts||[]).some(a=>a.id===item.accountId))conflicts.push('Zahlungskonto fehlt.');
 if(new Set(ids).size!==ids.length)conflicts.push('Eine Buchungs-ID ist mehrfach ausgewählt.');
 for(const id of ids){
  const variants=candidates.get(id)||[],row=variants[0];
  if(!row){conflicts.push('Buchungsanteil fehlt: '+id);continue;}
  if(new Set(variants.map(r=>JSON.stringify(identity(r)))).size!==1){conflicts.push('Widersprüchliche Buchungsdaten: '+id);continue;}
  if(!cents(row.amount)||Math.sign(row.amount)!==Math.sign(item.amountEURcents)||row.account!==item.accountId||row.transfer_id||payees.get(row.payee)?.transfer_acct||!validDate(row.date)||row.date>asOf||row.cleared!==true){conflicts.push('Konto, Richtung, Datum oder Bankstatus passt nicht: '+id);continue;}
  if((settings.futureExpenses||[]).some(other=>other.id!==item.id&&other.status!=='cancelled'&&(other.settlementTransactionIds||[]).includes(id)))conflicts.push('Buchungsanteil wird bereits von einem anderen Planereignis verwendet: '+id);
  rows.push(identity(row));
 }
 const amountEURcents=rows.reduce((sum,row)=>sum+row.amountEURcents,0);
 if(!cents(amountEURcents)||amountEURcents!==item.amountEURcents)conflicts.push('Zahlungssumme entspricht nicht dem Planbetrag.');
 const evidence=item.settlementEvidence?.rows;
 if(evidence&&(evidence.length!==rows.length||rows.some(row=>JSON.stringify(evidence.find(old=>old.id===row.id))!==JSON.stringify(row))))conflicts.push('Bestätigte Zahlungsdaten haben sich geändert; erneut prüfen.');
 return {status:conflicts.length?'conflict':evidence?'settled':'unverified',conflicts,rows,amountEURcents:cents(amountEURcents)?amountEURcents:null};
}
function futureFunding(item,live={},settings={},settlement,peers=[],asOf=today()){
 const month=live.currentMonth||null,base={month,categoryId:item.targetId||item.categoryId||null,fundedEURcents:null,remainingEURcents:null,availableCategoryEURcents:null,basis:'Aktuell geladener Actual-Kategoriestand; kein reserviertes Bankguthaben und keine Zusage für spätere Monate.'};
 if(['settled','manual-paid','cancelled'].includes(settlement.status))return {...base,status:settlement.status,remainingEURcents:0};
 if(item.amountEURcents>=0)return {...base,status:'not-applicable'};
 if(['conflict','unverified'].includes(settlement.status))return {...base,status:'settlement-open'};
 if(item.targetId){let target=null;try{target=resolveTargetRevision(settings.categoryTargets?.[item.targetId],month);}catch{}if(!target||item.categoryId&&item.categoryId!==item.targetId)return {...base,status:'link-conflict'};}
 const categoryId=base.categoryId;if(!month||!categoryId)return {...base,status:'unknown'};
 const group=(live.months?.[month]?.categoryGroups||[]).find(g=>(g.categories||[]).some(c=>c.id===categoryId)),category=group?.categories?.find(c=>c.id===categoryId);
 if(!category||group.is_income||!cents(category.balance))return {...base,status:'unknown'};
 const available=Math.max(0,category.balance),shared=peers.filter(other=>other.id!==item.id&&(other.targetId||other.categoryId)===categoryId&&other.amountEURcents<0&&!['settled','manual-paid','cancelled'].includes(futureSettlement(other,live,settings,asOf).status));
 if(shared.length)return {...base,status:'shared-category',availableCategoryEURcents:available,sharedEventIds:shared.map(other=>other.id)};
 const need=-item.amountEURcents,funded=Math.min(need,available);
 return {...base,status:funded===need?'funded':funded>0?'partly-funded':'unfunded',availableCategoryEURcents:available,fundedEURcents:funded,remainingEURcents:need-funded};
}
export function resolveFutureExpense(item,live={},settings={},asOf=today()){
 const settlement=futureSettlement(item,live,settings,asOf);
 return {...item,settlement,funding:futureFunding(item,live,settings,settlement,settings.futureExpenses||[],asOf),needsForecast:!['settled','manual-paid','cancelled'].includes(settlement.status),settlementConflict:['conflict','unverified'].includes(settlement.status)};
}
export function confirmFutureSettlement(item,live,settings,asOf=today()){
 const candidate={...item,settlementEvidence:null},state=futureSettlement(candidate,live,settings,asOf);
 if(state.status!=='unverified')throw Error(state.conflicts.join(' ')||'Bitte Zahlungsreferenzen prüfen.');
 return {rows:state.rows,confirmedAt:new Date().toISOString(),asOf};
}
