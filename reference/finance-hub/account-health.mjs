import {applyPlatformSnapshots} from './platform-wealth.mjs';
import {isCashAccount,isBrokerAccount} from './account-roles.mjs';
const validDay=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
const viennaDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna',year:'numeric',month:'2-digit',day:'2-digit'});
const isCash=(account,settings)=>isCashAccount(account,settings);
const isConnected=account=>Boolean(account?.account_id&&account?.account_sync_source);
const dayDiff=(from,to)=>Math.round((Date.parse(to+'T12:00Z')-Date.parse(from+'T12:00Z'))/86400000);

// Freshness per source kind (Audit B15): how old the newest evidence of a source may be
// before the account counts as "nicht frisch". Bank data comes from the nightly sync,
// broker holdings from the nightly job (business days), platforms and cash from the owner.
export const FRESHNESS_RULES=Object.freeze({
 bank:Object.freeze({days:2,businessDays:false,label:'Bank',evidence:'Bankabruf'}),
 manual:Object.freeze({days:7,businessDays:false,label:'Manuell',evidence:'Quellenstand'}),
 broker:Object.freeze({days:3,businessDays:true,label:'Broker',evidence:'Depotstand'}),
 platform:Object.freeze({days:30,businessDays:false,label:'Plattform',evidence:'Plattformstand'}),
 cash:Object.freeze({days:14,businessDays:false,label:'Bargeld',evidence:'Zählung'})
});
// Source-check reminder defaults (Audit B9): monthly platforms and depots do not need a
// weekly reminder; cash follows its freshness rule. Overrides stay per account.
export function defaultIntervalDays(account,settings={}){
 if(isCash(account,settings))return FRESHNESS_RULES.cash.days;
 if(account?.offbudget)return 30;
 return 7;
}
export function intervalDaysFor(account,settings={}){
 const interval=settings.accountReconciliationDays?.[account?.id];
 return Number.isInteger(interval)&&interval>=1&&interval<=365?interval:defaultIntervalDays(account,settings);
}
export function sourceKind(account,settings={}){
 if(isCash(account,settings))return 'cash';
 if(isConnected(account))return 'bank';
 if(account?.offbudget){
  const platforms=Object.values(settings.platformSnapshots||{});
  if(platforms.some(s=>s&&typeof s==='object'&&s.accountId===account.id))return 'platform';
  const brokers=Object.values(settings.brokerHoldingsSnapshots||{});
  if(brokers.some(s=>s&&typeof s==='object'&&s.actualAccountId===account.id)||isBrokerAccount(account,settings))return 'broker';
 }
 return 'manual';
}
// Actual stores last_sync as epoch milliseconds (string). The calendar day is Vienna's.
export function epochDay(raw){
 if(raw===null||raw===undefined||raw==='')return null;
 if(validDay(raw))return raw;
 const value=typeof raw==='string'?raw.trim():raw;
 const ms=typeof value==='number'?value:/^\d+$/.test(String(value))?Number(value):Date.parse(String(value));
 if(!Number.isFinite(ms)||ms<0)return null;
 const day=viennaDay.format(new Date(ms));
 return validDay(day)?day:null;
}
export function businessDaysBetween(from,to){
 if(!validDay(from)||!validDay(to)||from>=to)return 0;
 let count=0;const cursor=new Date(from+'T12:00Z'),end=Date.parse(to+'T12:00Z');
 while(cursor.getTime()<end){cursor.setUTCDate(cursor.getUTCDate()+1);const weekday=cursor.getUTCDay();if(weekday!==0&&weekday!==6)count++;}
 return count;
}
function latestBrokerSnapshotDay(account,settings){
 const days=Object.values(settings.brokerHoldingsSnapshots||{}).filter(s=>s&&typeof s==='object'&&s.actualAccountId===account.id).map(s=>s.asOf).filter(validDay);
 return days.length?days.sort().at(-1):null;
}
function platformSnapshotFor(account,settings,asOf,transactions){
 if(!account?.offbudget)return null;
 const accepted=applyPlatformSnapshots([account],settings.platformSnapshots||{},asOf,{transactions}).applied;
 return accepted.length?settings.platformSnapshots[accepted[0].key]:null;
}
// Age of the newest evidence for the account's source kind, judged against FRESHNESS_RULES.
// fresh:null means "no evidence at all" and is reported, never treated as fresh.
export function sourceFreshness(account,settings={},asOf,{transactions=[],snapshot=null}={}){
 const kind=sourceKind(account,settings),rule=FRESHNESS_RULES[kind],check=settings.accountSourceChecks?.[account?.id];
 let lastAt=null;
 if(kind==='bank')lastAt=epochDay(account.last_sync);
 else if(kind==='platform')lastAt=validDay(snapshot?.asOf)?snapshot.asOf:validDay(check?.rangeTo)?check.rangeTo:null;
 else if(kind==='broker')lastAt=latestBrokerSnapshotDay(account,settings)||(validDay(check?.rangeTo)?check.rangeTo:null);
 else lastAt=validDay(check?.rangeTo)?check.rangeTo:null;
 const unit=rule.businessDays?'Werktage':'Tage';
 const limit=rule.days+' '+unit;
 if(!validDay(asOf)||!lastAt||lastAt>asOf)return {kind,rule,limit,lastAt,ageDays:null,fresh:null,label:rule.evidence+' fehlt'};
 const ageDays=rule.businessDays?businessDaysBetween(lastAt,asOf):dayDiff(lastAt,asOf);
 const fresh=ageDays<=rule.days;
 const age=ageDays===0?'heute':ageDays===1?'vor 1 '+(rule.businessDays?'Werktag':'Tag'):'vor '+ageDays+' '+(rule.businessDays?'Werktagen':'Tagen');
 return {kind,rule,limit,lastAt,ageDays,fresh,label:rule.evidence+' '+age+(fresh?'':' · älter als '+limit)};
}
// Bank sync state as Actual reports it (bank_sync_status + last_sync). Only connected
// accounts get a value; manual accounts stay empty in the table (Audit B1, U-19).
const SYNC_LABELS={ok:'Aktuell',success:'Aktuell',pending:'Abruf läuft','reauth-required':'Erneut verbinden nötig',reauthrequired:'Erneut verbinden nötig',reauth_required:'Erneut verbinden nötig',error:'Fehler beim Abruf',failed:'Fehler beim Abruf',failure:'Fehler beim Abruf'};
const shortDay=day=>day.slice(8,10)+'.'+day.slice(5,7)+'.';
export function bankSyncStatus(account){
 if(!isConnected(account))return null;
 const code=String(account.bank_sync_status||'').trim().toLowerCase();
 const lastSync=epochDay(account.last_sync);
 const level=!code?'unknown':/ok|success/.test(code)?'ok':code==='pending'?'pending':/reauth/.test(code)?'reauth':'error';
 const label=SYNC_LABELS[code]||(code?'Status: '+String(account.bank_sync_status):'Noch kein Abruf');
 return {code:code||null,level,label,lastSync,provider:String(account.account_sync_source),text:label+(lastSync?' · zuletzt '+shortDay(lastSync):'')};
}
// Nightly bank observation (settings.bankObservations[accountId], written by the server
// worker, Audit B7): {asOf, balanceEURcents, observedAt, source}. It is compared at its
// own cutoff like a manual check but never replaces the owner's documented source check.
export function bankObservation(account,settings={},transactions=[],asOf){
 const raw=settings.bankObservations?.[account?.id];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!validDay(raw.asOf)||!Number.isSafeInteger(raw.balanceEURcents))return null;
 const comparison=compareSourceBalance(account,{rangeFrom:raw.asOf,rangeTo:raw.asOf,bookedBalanceEURcents:raw.balanceEURcents},transactions,asOf);
 return {asOf:raw.asOf,balanceEURcents:raw.balanceEURcents,observedAt:typeof raw.observedAt==='string'?raw.observedAt:null,source:typeof raw.source==='string'?raw.source:null,difference:comparison.comparable?comparison.difference:null,explainedByPending:comparison.explainedByPending};
}

// Compare balances at the same calendar cutoff. Current account balances include
// pending entries; those are an explanation, never proof of a verified statement.
export function compareSourceBalance(account,check,transactions=[],asOf){
 const empty={comparable:false,ledgerAtSource:null,difference:null,pending:0,explainedByPending:false,laterCount:0};
 if(!validDay(asOf)||!validDay(check?.rangeFrom)||!validDay(check?.rangeTo)||check.rangeFrom>check.rangeTo||check.rangeTo>asOf||check.rangeTo<'2020-01-01'||!Number.isSafeInteger(account?.balance)||!Number.isSafeInteger(check.bookedBalanceEURcents))return {...empty,reason:'invalid-source'};
 const flat=[];const visit=(t,parent={})=>{if(!t||t.tombstone)return;const row={...parent,...t};if(t.subtransactions?.length){for(const child of t.subtransactions)visit(child,{account:row.account,date:row.date,cleared:row.cleared});}else flat.push(row);};transactions.forEach(t=>visit(t));
 const seen=new Set(),parentIds=new Set(flat.filter(t=>t.parent_id).map(t=>t.parent_id));
 const rows=flat.filter(t=>{if((t.account??t.acct)!==account.id||parentIds.has(t.id))return false;if(t.id&&seen.has(t.id))return false;if(t.id)seen.add(t.id);return true;});
 if(rows.some(t=>!validDay(t.date)||!Number.isSafeInteger(t.amount)))return {...empty,reason:'invalid-transactions'};
 const later=rows.filter(t=>t.date>check.rangeTo&&t.date<=asOf),ledgerAtSource=account.balance-later.reduce((n,t)=>n+t.amount,0);
 const pending=rows.filter(t=>t.date<=check.rangeTo&&t.cleared===false).reduce((n,t)=>n+t.amount,0),difference=ledgerAtSource-check.bookedBalanceEURcents;
 return {comparable:true,ledgerAtSource,difference,pending,explainedByPending:difference!==0&&difference===pending,laterCount:later.length,reason:null};
}

// Inbox priority (Audit B7): a documented difference is urgent (1); a difference that only
// the nightly observation shows is a routine hint (3); everything else is routine (4).
function priorityFor(row){
 if(!row.actionNeeded)return null;
 if(row.status==='difference')return 1;
 if(row.observation?.difference)return 3;
 return 4;
}

export function accountHealth(account,settings={},transactions=[],asOf){
 const intervalDays=intervalDaysFor(account,settings);
 const check=settings.accountSourceChecks?.[account.id],cash=isCash(account,settings),connected=isConnected(account);
 const snapshot=platformSnapshotFor(account,settings,asOf,transactions);
 const base={id:account.id,name:account.name,intervalDays,check,connected,cash,actionNeeded:true,sourceKind:sourceKind(account,settings),freshness:sourceFreshness(account,settings,asOf,{transactions,snapshot}),bankSync:bankSyncStatus(account),observation:bankObservation(account,settings,transactions,asOf)};
 const finish=row=>({...row,priority:priorityFor(row)});
 if(snapshot&&validDay(snapshot.asOf)&&snapshot.asOf<=asOf&&Number.isSafeInteger(snapshot.totalEURcents)&&(!check?.rangeTo||snapshot.asOf>=check.rangeTo)){
  const daysSince=Math.round((Date.parse(asOf)-Date.parse(snapshot.asOf))/86400000),stale=daysSince>=intervalDays;
  return finish({...base,status:stale?'stale-snapshot':'snapshot',kind:'valuation',label:stale?'Bewertungsstand aktualisieren':snapshot.quality==='verified'?'Plattformstand bestätigt':'Manueller Zwischenstand erfasst',action:'Plattformstand öffnen',actionNeeded:stale,daysSince,comparison:null,check:{rangeTo:snapshot.asOf,source:snapshot.source},snapshot});
 }
 if(!check)return finish({...base,status:'missing',label:cash?'Bargeld noch nicht gezählt':'Quelle fehlt',action:cash?'Bargeld zählen':connected?'Quelle aktualisieren':'Stand eintragen',comparison:null});
 const comparison=compareSourceBalance(account,check,transactions,asOf);
 if(!comparison.comparable)return finish({...base,status:'invalid',label:'Quellenstand prüfen',action:'Stand korrigieren',comparison});
 const daysSince=Math.round((Date.parse(asOf)-Date.parse(check.rangeTo))/86400000);
 const unresolved=Array.isArray(check.unresolved)?check.unresolved.filter(x=>typeof x==='string'&&x.trim()):[];
 if(comparison.difference!==0)return finish({...base,status:comparison.explainedByPending?'pending':'difference',label:comparison.explainedByPending?'Vormerkungen erklären Differenz':'Saldoabweichung',action:'Differenz ansehen',comparison,daysSince});
 if(check.status!=='complete'||unresolved.length)return finish({...base,status:'partial',label:'Prüfung noch offen',action:'Offene Hinweise klären',comparison,daysSince});
 if(daysSince>=intervalDays||comparison.laterCount)return finish({...base,status:'stale',label:'Quelle aktualisieren',action:cash?'Bargeld zählen':'Stand aktualisieren',comparison,daysSince});
 return finish({...base,status:'matched',label:cash?'Bargeldstand stimmt':check.quality==='manual'?'Manuell verglichen':'Quellenstand stimmt',action:'Stand ansehen',comparison,daysSince,actionNeeded:false});
}

export function accountHealthSummary(accounts,settings,transactions,asOf){
 const rows=accounts.filter(a=>!a.closed).map(a=>accountHealth(a,settings,transactions,asOf));
 return {rows,actionable:rows.filter(r=>r.actionNeeded),differences:rows.filter(r=>r.status==='difference'),missing:rows.filter(r=>r.status==='missing'),matched:rows.filter(r=>r.status==='matched'),notFresh:rows.filter(r=>r.freshness.fresh===false)};
}
