// Provider amounts are integer cents. Observations (cash/P2P balances) never
// become income here: an importer must supply explicit source transactions.
export const canonical = value => JSON.stringify(sort(value));
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,sort(value[k])])) : value; }
export function importError(code,message) { return Object.assign(new Error(message),{code}); }
const fail=(code,message)=>{throw importError(code,message);};
function validImportDate(value) { const d=new Date(value+'T12:00:00Z');return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===value; }
const required=(value,name)=>typeof value==='string'&&value.trim()?value.trim():fail('IMPORT_ID_REQUIRED',`${name} fehlt.`);
export const importIdentity = (providerId,sourceAccountId,importId) => 'cockpit-import:'+canonical([required(providerId,'Anbieter-ID'),required(sourceAccountId,'Quellkonto-ID'),required(importId,'Import-ID')]);
export function normalizeImportBatch(input) {
 const providerId=required(input.providerId,'Anbieter-ID'),sourceAccountId=required(input.sourceAccountId,'Quellkonto-ID'),accountId=required(input.accountId,'Actual-Konto-ID'),batchId=required(input.batchId,'Lauf-ID');
 if(!validImportDate(input.rangeFrom)||!validImportDate(input.rangeTo)||input.rangeFrom>input.rangeTo)fail('IMPORT_RANGE_INVALID','Der Quellenzeitraum ist ungültig.');
 if(!Array.isArray(input.transactions))fail('IMPORT_ROWS_REQUIRED','Explizite Quellenbuchungen fehlen. Ein Saldo ist keine Einnahme.');
 const rows=input.transactions.map(raw=>{
  const importId=required(raw.importId,'Import-ID');
  if(!validImportDate(raw.date)||!Number.isSafeInteger(raw.amount))fail('IMPORT_ROW_INVALID','Datum oder Centbetrag der Quellenbuchung ist ungültig.');
  if((raw.currency??'EUR')!=='EUR')fail('IMPORT_CURRENCY_UNSUPPORTED','Nur explizite EUR-Buchungen werden unterstützt.');
  if(!['booked','pending'].includes(raw.status??'booked'))fail('IMPORT_STATUS_INVALID','Der Quellenstatus ist ungültig.');
  const row={importId,key:importIdentity(providerId,sourceAccountId,importId),accountId,date:raw.date,amount:raw.amount,currency:'EUR',status:raw.status??'booked',payee:String(raw.payee??'').trim(),notes:String(raw.notes??''),sourceRef:String(raw.sourceRef??'')};
  return {...row,fingerprint:canonical(row)};
 });
 return {schemaVersion:1,id:importIdentity(providerId,sourceAccountId,'batch:'+batchId),batchId,providerId,sourceAccountId,accountId,rangeFrom:input.rangeFrom,rangeTo:input.rangeTo,rows};
}
export function importRoots(transactions=[]) { return transactions.filter(t=>!t.tombstone&&!t.parent_id&&!t.is_child); }
export function transactionEvidence(row) {
 // Compare only stored business fields, never UI display names or query order.
 const fields=['id','account','date','amount','payee','notes','category','imported_id','imported_payee','cleared','reconciled','transfer_id','parent_id','is_parent','is_child','error','schedule'];
 return canonical({...Object.fromEntries(fields.map(k=>[k,row[k]??null])),subtransactions:(row.subtransactions||[]).map(t=>JSON.parse(transactionEvidence(t))).sort((a,b)=>a.id.localeCompare(b.id))});
}
export function splitIsValid(row) { return !(row.is_parent||row.subtransactions?.length)||Boolean(row.subtransactions?.length&&row.subtransactions.every(s=>Number.isSafeInteger(s.amount))&&row.subtransactions.reduce((n,s)=>n+s.amount,0)===row.amount); }
function importCandidates(row,transactions,{dayWindow=7}={}) {
 const days=d=>new Date(d+'T12:00:00Z').getTime()/86400000;
 return importRoots(transactions).filter(t=>t.account===row.accountId&&Number.isSafeInteger(t.amount)&&validImportDate(t.date)&&Math.abs(days(t.date)-days(row.date))<=dayWindow&&!t.transfer_id).filter(t=>t.amount===row.amount).map(t=>({id:t.id,date:t.date,amount:t.amount,notes:t.notes??'',payee:t.payee_name||t.imported_payee||t.payee||'',evidence:transactionEvidence(t),eligible:(!t.imported_id||t.imported_id.startsWith('cockpit-manual:'))&&!t.reconciled&&!t.error&&splitIsValid(t),split:Boolean(t.is_parent||t.subtransactions?.length),reason:t.imported_id&&!t.imported_id.startsWith('cockpit-manual:')?'Bereits einer Quelle zugeordnet':t.reconciled?'Bereits abgeglichen':!splitIsValid(t)?'Aufteilung zuerst prüfen':'Gleiches Konto und gleicher Centbetrag; Datum im Zeitfenster'}));
}
export function previewImportRun(input,transactions=[],history=[],{now=new Date().toISOString()}={}) {
 const batch=normalizeImportBatch(input),roots=importRoots(transactions),counts=new Map(),prior=new Map();
 for(const row of batch.rows)counts.set(row.key,(counts.get(row.key)||0)+1);
 for(const run of history)for(const row of run.rows||[])if(row.state==='applied')prior.set(row.key,row);
 const rows=batch.rows.map(row=>{
  const exact=roots.filter(t=>t.account===row.accountId&&t.imported_id===row.key),previous=prior.get(row.key),candidates=importCandidates(row,roots);
  let state='review',reason='Neue Quellenbuchung prüfen';
  if(counts.get(row.key)>1){state='conflict';reason='Import-ID kommt im selben Lauf mehrfach vor';}
  else if(row.date<batch.rangeFrom||row.date>batch.rangeTo){state='excluded';reason='Außerhalb des bestätigten Quellenzeitraums';}
  else if(exact.length>1){state='conflict';reason='Import-ID ist im Ledger mehrfach vorhanden';}
  else if(previous&&previous.fingerprint!==row.fingerprint){state='conflict';reason='Anbieter hat die bereits übernommene Buchung verändert';}
  else if(exact.length===1) {
   if(exact[0].amount!==row.amount){state='conflict';reason='Gleiche Import-ID mit abweichendem Centbetrag';}
   else if(previous&&previous.transactionId===exact[0].id){state='duplicate';reason='Bereits in einem früheren Lauf übernommen';}
   else {state='conflict';reason='Import-ID vorhanden; Übernahmehistorie fehlt oder passt nicht';}
  } else if(previous){state='conflict';reason='Frühere Übernahme fehlt im Ledger; nicht automatisch erneut anlegen';}
  else if(row.status==='pending'){state='pending';reason='Vorgemerkt: noch keine gebuchte Quellenbewegung';}
  else if(candidates.length){reason=candidates.length>1?'Mehrere mögliche Gegenstücke: einzeln entscheiden':'Mögliches Gegenstück: Zuordnung bestätigen';}
  return {...row,state,reason,candidates,decision:null,transactionId:exact[0]?.id??null};
 });
 const signature=canonical({...batch,rows:batch.rows});
 const sameId=history.find(r=>r.id===batch.id);
 if(sameId&&sameId.signature!==signature)fail('IMPORT_BATCH_CHANGED','Diese Lauf-ID wurde bereits mit anderem Inhalt verwendet. Neue Lauf-ID verwenden.');
 return {...batch,signature,createdAt:now,updatedAt:now,status:'preview',rows,events:[{at:now,type:'preview'}]};
}
