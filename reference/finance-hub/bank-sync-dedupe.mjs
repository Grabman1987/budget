// Some bank feeds (Broker A via Enable Banking) deliver rows without an import id.
// Actual then cannot recognise them on the next run and books copies: once per run for the
// whole window, plus a second copy when a movement arrives as pending and again as booked.
// This guard compares the ledger before and after a sync and removes only rows that the
// sync itself created and that carry no import id. Two nets, both counting per original row
// so that a known row can absorb at most one copy:
//  1. Exact net: same (date, amount, bank text) as a row the ledger already held. The feed
//     can re-send each known row once, so at most `existingCount` copies of a triple go.
//  2. Shift net: the booked copy of an older movement often carries a date one to three
//     days after the stored row. For re-sent history (new row dated at least four days
//     before today) a stored row with the same amount within three days absorbs it.
//     Recent rows are never removed by this net, because a genuine second purchase of the
//     same amount a day later (1,50 € at the same café) looks identical; they are kept and
//     listed as possible duplicates for the user instead.
// Two new rows with the same triple inside one sync are kept and flagged, never deleted.
// Nothing older than the window is touched, a second run over the same ledger deletes
// nothing, and a cap keeps a runaway feed from deleting more than a screenful.
const roots=rows=>(rows||[]).filter(t=>t&&!t.tombstone&&!t.parent_id&&!t.is_child);
const key=t=>`${t.date}|${t.amount}|${String(t.imported_payee||'').trim().toLowerCase()}`;
// Calendar days in Vienna (E-01), never the UTC date: between 0:00 and 2:00 they differ.
const viennaDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'});
const day=ms=>viennaDay.format(new Date(ms));
const dayNumber=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Math.round(Date.parse(value+'T12:00:00Z')/86400000):null;
const example=t=>({id:t.id,date:t.date,amountEURcents:t.amount});
const SHIFT_DAYS=3,HISTORY_AGE_DAYS=4;

export function planDuplicateRemoval(before,after,{maxDeletions=200,from=null,asOf=null}={}){
 const beforeRows=roots(before),afterRows=roots(after),known=new Set(beforeRows.map(t=>t.id));
 // Stored rows per triple: the feed may repeat exactly these, each at most once.
 const byKey=new Map();for(const t of beforeRows){const k=key(t);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(t);}
 const claimed=new Set(),today=dayNumber(asOf);
 const exactTwin=t=>(byKey.get(key(t))||[]).find(e=>!claimed.has(e.id));
 const shiftTwin=t=>{
  const d=dayNumber(t.date);if(d===null)return null;
  return beforeRows.filter(e=>e.amount===t.amount&&!claimed.has(e.id)&&dayNumber(e.date)!==null&&Math.abs(dayNumber(e.date)-d)<=SHIFT_DAYS)
   .sort((a,b)=>Math.abs(dayNumber(a.date)-d)-Math.abs(dayNumber(b.date)-d))[0]||null;
 };
 const isHistory=t=>today!==null&&dayNumber(t.date)!==null&&dayNumber(t.date)<=today-HISTORY_AGE_DAYS;
 const added=afterRows.filter(t=>!known.has(t.id)&&(!from||!t.date||t.date>=from)),seenNew=new Map(),remove=[],kept=[],possibleDuplicates=[];
 for(const t of added){
  if(t.imported_id||t.transfer_id){kept.push(t);continue;}
  const exact=exactTwin(t);
  if(exact){claimed.add(exact.id);remove.push(t);continue;}
  const shifted=shiftTwin(t);
  if(shifted&&isHistory(t)){claimed.add(shifted.id);remove.push(t);continue;}
  const k=key(t),repeats=seenNew.get(k)||0;
  if(shifted||repeats>0)possibleDuplicates.push(example(t));
  seenNew.set(k,repeats+1);kept.push(t);
 }
 const capped=remove.length>maxDeletions;
 const deletions=capped?[]:remove;
 return {added:added.length,kept:kept.length,deleteIds:deletions.map(t=>t.id),examples:deletions.slice(0,6).map(t=>({date:t.date,amountEURcents:t.amount})),capped,possibleDuplicates,
  summary:{added:added.length,removed:deletions.length,capped,possibleDuplicates:possibleDuplicates.length,possibleDuplicateExamples:possibleDuplicates.slice(0,6).map(({date,amountEURcents})=>({date,amountEURcents})),reason:deletions.length?'Kopien ohne Import-ID entfernt':capped?'Zu viele Kopien · nichts gelöscht':null}};
}

// Runs one bank sync and applies the guard. `api` is the Actual API (node client or browser bundle).
export async function syncAccountWithGuard(api,accountId,{windowDays=120,now=Date.now(),log=()=>{}}={}){
 const from=day(now-windowDays*86400000),to=day(now+7*86400000),asOf=day(now);
 const read=async()=>{try{return await api.getTransactions(accountId,from,to);}catch{return null;}};
 const before=await read();
 await api.runBankSync({accountId});
 let plan=null;
 if(before){
  const after=await read();
  if(after){
   plan=planDuplicateRemoval(before,after,{from,asOf});
   for(const id of plan.deleteIds)await api.deleteTransaction(id);
   if(plan.deleteIds.length)log(`Bankabruf ${accountId}: ${plan.deleteIds.length} Kopien ohne Import-ID entfernt`);
  }
 }
 await api.sync();
 return {accountId,dedupe:plan?plan.summary:{added:null,removed:0,capped:false,possibleDuplicates:0,reason:'Vorher/Nachher nicht lesbar'}};
}
