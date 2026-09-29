const integer = Number.isSafeInteger;
const monthOk = value => typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const isoDate = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value));
const now = () => new Date().toISOString();
const safeId = value => typeof value==='string'&&value.trim();
const amountFields=['grossEURcents','netEURcents','regularNetEURcents','specialNetEURcents','taxEURcents','employeeDeductionsEURcents','reimbursementsEURcents'];
const values = record => Object.fromEntries(amountFields.map(key=>[key,record[key]??null]));
const sum = values => values.reduce((total,value)=>total+value,0);
export const payrollLeaves = live => {
  const result=[],seen=new Set(),accounts=new Map((live?.accounts||[]).map(a=>[a.id,a]));
  for(const parent of live?.rawTransactions||[]){
    if(!parent?.id||parent.tombstone||parent.parent_id||accounts.get(parent.account)?.offbudget)continue;
    for(const child of parent.subtransactions?.length?parent.subtransactions:[parent]){
      if(!child?.id||seen.has(child.id)||child.tombstone)continue;seen.add(child.id);
      result.push({...child,account:parent.account,date:parent.date,payee:child.payee||parent.payee,transfer_id:child.transfer_id||parent.transfer_id,parentId:parent.id});
    }
  }
  return result;
};
const payrollRecords=workspace=>workspace?.settings?.payrollRecords||[];

export function normalizePayrollRecord(input={}){
  const period=String(input.period||''),employer=String(input.employer||'').trim();
  if(!monthOk(period)||!employer||employer.length>180)throw Error('Abrechnungsmonat und Arbeitgeber prüfen.');
  const amounts=values(input);
  for(const [key,value] of Object.entries(amounts))if(value!==null&&(!integer(value)||value<0))throw Error(`${key} muss ein nichtnegativer Centbetrag sein.`);
  const actualTransactionIds=input.actualTransactionIds||[];
  if(!Array.isArray(actualTransactionIds)||actualTransactionIds.some(value=>!safeId(value))||new Set(actualTransactionIds).size!==actualTransactionIds.length)throw Error('Actual-Verknüpfungen prüfen.');
  return {id:safeId(input.id)?input.id:globalThis.crypto.randomUUID(),period,employer,documentId:input.documentId||null,actualTransactionIds:[...actualTransactionIds],...amounts,notes:String(input.notes||'').slice(0,4000),status:input.status==='reviewed'?'reviewed':'draft',reviewedAt:input.reviewedAt||null,reviewedBy:input.reviewedBy||null,receiptMatched:input.receiptMatched===true,mismatchReason:String(input.mismatchReason||'').slice(0,2000)};
}

export function savePayrollRecord(workspace,input){
  const next=structuredClone(workspace);next.settings ||= {};next.settings.payrollRecords ||= [];
  const record=normalizePayrollRecord({...input,status:'draft'}),prior=next.settings.payrollRecords.find(row=>row.id===record.id);
  const history=prior?[...(prior.history||[]),{at:now(),record:Object.fromEntries(Object.entries(prior).filter(([key])=>key!=='history'))}]:[];
  const updated={...record,version:(prior?.version||0)+1,createdAt:prior?.createdAt||now(),updatedAt:now(),history};
  next.settings.payrollRecords=[...next.settings.payrollRecords.filter(row=>row.id!==record.id),updated];
  return {workspace:next,record:updated};
}

export function payrollReceiptStatus(record,live){
  const ids=record.actualTransactionIds||[],all=new Map(payrollLeaves(live).map(row=>[row.id,row]));
  const rows=ids.map(id=>all.get(id));
  const invalid=rows.some(row=>!row||!integer(row.amount)||row.amount<=0||row.transfer_id);
  const actualNetEURcents=invalid?null:sum(rows.map(row=>row.amount));
  const expectedNetEURcents=integer(record.netEURcents)?record.netEURcents:null;
  return {linkedCount:ids.length,actualNetEURcents,expectedNetEURcents,matched:ids.length>0&&!invalid&&actualNetEURcents===expectedNetEURcents,missingIds:ids.filter(id=>!all.has(id)),differenceEURcents:actualNetEURcents===null||expectedNetEURcents===null?null:actualNetEURcents-expectedNetEURcents};
}

export async function reviewPayrollRecord({workspace,saveWorkspace,id,live,reviewer='Nutzer',mismatchReason=''}){
  if(typeof saveWorkspace!=='function')throw Error('Workspace-Speicherung fehlt.');
  const next=structuredClone(workspace),record=next.settings?.payrollRecords?.find(row=>row.id===id);
  if(!record)throw Error('Gehaltsdatensatz nicht gefunden.');
  const required=['grossEURcents','netEURcents','regularNetEURcents','specialNetEURcents','taxEURcents','employeeDeductionsEURcents','reimbursementsEURcents'];
  if(required.some(key=>!integer(record[key])))throw Error('Vor der Prüfung alle Gehaltsfelder in Cent erfassen.');
  if(record.regularNetEURcents+record.specialNetEURcents+record.reimbursementsEURcents!==record.netEURcents)throw Error('Regulär, Sonderzahlung und Erstattung müssen zusammen dem erfassten Netto entsprechen.');
  const used=new Set((next.settings.payrollRecords||[]).filter(row=>row.id!==id&&row.status==='reviewed').flatMap(row=>row.actualTransactionIds||[]));
  if(record.actualTransactionIds.some(transactionId=>used.has(transactionId)))throw Error('Eine Actual-Einnahme ist bereits mit einem geprüften Gehaltsdatensatz verknüpft.');
  const receipt=payrollReceiptStatus(record,live);
  if(!receipt.matched&&!String(mismatchReason).trim())throw Error('Actual-Netto weicht ab oder fehlt. Vor der Prüfung einen Grund dokumentieren.');
  record.status='reviewed';record.reviewedAt=now();record.reviewedBy=reviewer;record.receiptMatched=receipt.matched;record.mismatchReason=receipt.matched?'':String(mismatchReason).trim().slice(0,2000);record.version=(record.version||0)+1;record.updatedAt=now();
  record.history ||= [];record.history.push({at:record.reviewedAt,type:'review',receipt});
  await saveWorkspace(next);
  return {record,receipt};
}

export function payrollReceiptCandidates(record,live,{limit=20}={}){
  const payees=new Map((live?.payees||[]).map(row=>[row.id,row.name||'']));
  const monthStart=record.period+'-01',start=new Date(Date.parse(monthStart+'T12:00:00Z')-45*864e5).toISOString().slice(0,10),end=new Date(Date.parse(monthStart+'T12:00:00Z')+75*864e5).toISOString().slice(0,10);
  return payrollLeaves(live).filter(row=>row.amount>0&&!row.transfer_id&&row.date>=start&&row.date<=end).map(row=>{
    const payeeName=payees.get(row.payee)||row.imported_payee||'',employerMatch=payeeName.toLocaleLowerCase('de-AT').includes(record.employer.toLocaleLowerCase('de-AT'));
    const amountMatch=integer(record.netEURcents)&&row.amount===record.netEURcents;
    const sameMonth=row.date.slice(0,7)===record.period;
    const score=(employerMatch?3:0)+(amountMatch?3:0)+(sameMonth?1:0);
    return {id:row.id,parentId:row.parentId,date:row.date,amountEURcents:row.amount,payeeName,score,confidence:score>=6?'high':score>=3?'medium':'low',reason:[employerMatch?'Empfänger ähnlich':null,amountMatch?'Betrag gleich':null,sameMonth?'gleicher Monat':null].filter(Boolean)};
  }).sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date)).slice(0,Math.max(1,Math.min(100,limit)));
}

export function payrollSummary(workspace,live,year){
  const selected=Number(year);if(!Number.isInteger(selected)||selected<2020||selected>2100)throw Error('Berichtsjahr prüfen.');
  const months=Array.from({length:12},(_,i)=>`${selected}-${String(i+1).padStart(2,'0')}`);
  const records=payrollRecords(workspace).filter(record=>record.status==='reviewed');
  const rows=months.map(month=>{
    const included=records.filter(record=>record.period===month);
    const totals=Object.fromEntries(amountFields.map(key=>[key,included.length?sum(included.map(record=>record[key]||0)):null]));
    return {month,recordIds:included.map(record=>record.id),...totals,receiptMatched:included.length>0&&included.every(record=>payrollReceiptStatus(record,live).matched),complete:included.length>0};
  });
  const total={};
  for(const key of amountFields)total[key]=sum(rows.filter(row=>row[key]!==null).map(row=>row[key]));
  const complete=rows.every(row=>row.complete);
  return {year:selected,rows,knownTotals:total,complete,missingMonths:rows.filter(row=>!row.complete).map(row=>row.month),basis:'Nur manuell geprüfte PayrollRecords; Actual-Bankeingänge bleiben das Cashflow-Ledger.'};
}
