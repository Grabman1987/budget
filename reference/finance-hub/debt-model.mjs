// Canonical debt identity + effective-dated contract facts. No name heuristics,
// no inferred rates, and no mutations to Actual balances or budget assignments.
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00Z'))&&new Date(value+'T12:00Z').toISOString().slice(0,10)===value;
const nullable=(value,valid,message)=>{if(value==null||value==='')return null;if(!valid(value))throw Error(message);return value;};
export function normalizeDebtTerms(input){
 if(!day(input.effectiveFrom))throw Error('Kreditkonditionen benötigen ein gültiges Gültig-ab-Datum.');
 const rate=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100,amount=n=>Number.isSafeInteger(n)&&n>=0;
 const result={effectiveFrom:input.effectiveFrom,nominalApr:nullable(input.nominalApr,rate,'Bitte den Sollzins prüfen.'),effectiveApr:nullable(input.effectiveApr,rate,'Bitte den Effektivzins prüfen.'),paymentEURcents:nullable(input.paymentEURcents??input.minimumPaymentEURcents,amount,'Bitte die Kreditrate in Cent prüfen.'),monthlyFeesEURcents:nullable(input.monthlyFeesEURcents,amount,'Bitte die monatlichen Gebühren prüfen.'),limitEURcents:nullable(input.limitEURcents,amount,'Bitte den Kreditrahmen prüfen.'),dueDay:nullable(input.dueDay,n=>Number.isInteger(n)&&n>=1&&n<=31,'Bitte den Fälligkeitstag prüfen.'),rateType:input.rateType||'unknown',paymentMode:input.paymentMode||'unknown',source:String(input.source||'Manuell bestätigt'),notes:String(input.notes??input.specialTerms??'')};
 if(!['unknown','fixed','variable'].includes(result.rateType)||!['unknown','installment','revolving','full-pay'].includes(result.paymentMode))throw Error('Bitte Kreditart und Verzinsung prüfen.');return result;
}
export function saveDebtTerms(workspace,{id,accountId,name,terms,components},now=new Date().toISOString()){
 if(typeof id!=='string'||!id.trim()||typeof accountId!=='string'||!accountId.trim())throw Error('Eine Schuld benötigt eine feste ID und eine Actual-Kontoverknüpfung.');
 const next=structuredClone(workspace);next.settings||={};next.settings.debts||=[];
 const existing=next.settings.debts.find(d=>d.id===id),duplicate=next.settings.debts.find(d=>d.id!==id&&d.accountId===accountId);
 if(duplicate)throw Error('Dieses Actual-Konto ist bereits einer anderen kanonischen Schuld zugeordnet. Zuerst die Identität prüfen.');
 if(existing&&existing.accountId!==accountId)throw Error('Die Kontoverknüpfung einer bestehenden Schuld darf nicht still geändert werden.');
 const normalized=normalizeDebtTerms(terms),revisions=existing?.terms||[],version=Math.max(0,...revisions.map(t=>t.version||0))+1;
 const mappings=components??existing?.components??{};
 for(const key of Object.keys(mappings))if(!['principalCategoryIds','interestCategoryIds','feeCategoryIds'].includes(key)||!Array.isArray(mappings[key])||mappings[key].some(v=>typeof v!=='string'||!v))throw Error('Bitte die Kategoriezuordnung für Tilgung, Zinsen und Gebühren prüfen.');
 const assigned=Object.values(mappings).flat();if(new Set(assigned).size!==assigned.length)throw Error('Eine Kategorie darf nur einer Kreditkomponente zugeordnet werden.');
 const record={...(existing||{}),id,accountId,name:String(name||existing?.name||'Kredit'),terms:[...revisions,{...normalized,version,recordedAt:now}],components:structuredClone(mappings),updatedAt:now};
 next.settings.debts=[...next.settings.debts.filter(d=>d.id!==id),record];return next;
}
export function resolveDebtTerms(debt,asOf){if(!day(asOf))throw Error('Bitte einen gültigen Konditionsstichtag wählen.');return (debt?.terms||[]).filter(t=>t.effectiveFrom<=asOf).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||(a.version||0)-(b.version||0)).at(-1)||null;}
export function debtComponent(transaction,debt){for(const [field,kind] of [['principalCategoryIds','principal'],['interestCategoryIds','interest'],['feeCategoryIds','fees']])if(debt.components?.[field]?.includes(transaction.category))return {debtId:debt.id,accountId:debt.accountId,component:kind,amountEURcents:transaction.amount,sourceTransactionId:transaction.id};return null;}
export function debtTermsHistory(debt,asOf){const terms=resolveDebtTerms(debt,asOf);return {id:debt.id,name:debt.name,accountId:debt.accountId,asOf,terms,known:!!terms,tilgungCandidate:!!terms&&terms.paymentMode!=='full-pay'&&terms.paymentMode!=='unknown',revisions:[...(debt.terms||[])]};}
