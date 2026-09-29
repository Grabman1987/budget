import {expandSchedule,dayAdd} from './model.mjs';
const days=(a,b)=>(Date.parse(b+'T12:00Z')-Date.parse(a+'T12:00Z'))/86400000;
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
const scheduleFrequency=s=>typeof s.date==='string'?'once':s.date?.frequency;
export function recurringReview(live,settings={},asOf){
 const accounts=new Map((live.accounts||[]).map(a=>[a.id,a])),payees=new Map((live.payees||[]).map(p=>[p.id,p]));
 const raw=live.rawTransactions||live.transactions||[],groups=new Map(),seen=new Set();
 for(const row of raw){
  if(row.tombstone||row.parent_id||seen.has(row.id)||!row.id||!row.payee||row.transfer_id||payees.get(row.payee)?.transfer_acct||accounts.get(row.account)?.closed||accounts.get(row.account)?.offbudget||!Number.isSafeInteger(row.amount)||!row.amount||row.date>asOf||row.date<dayAdd(asOf,-800)||!row.cleared)continue;
  seen.add(row.id);const key=JSON.stringify([row.account,row.payee,Math.sign(row.amount)]);const items=groups.get(key)||[];items.push(row);groups.set(key,items);
 }
 const schedules=(live.schedules||[]).filter(s=>!s.completed),candidates=[];
 for(const rows of groups.values()){
  rows.sort((a,b)=>a.date.localeCompare(b.date));const recent=rows.slice(-8),dates=[...new Set(recent.map(r=>r.date))];if(dates.length!==recent.length||recent.length<3)continue;
  const intervals=dates.slice(1).map((date,i)=>days(dates[i],date)),gap=median(intervals),rule=[['weekly',7,2],['monthly',30.4,5],['yearly',365,20]].find(([,target,tolerance])=>Math.abs(gap-target)<=tolerance&&intervals.every(n=>Math.abs(n-target)<=tolerance));
  if(!rule)continue;const [frequency,expected]=rule,last=recent.at(-1),amount=median(recent.map(r=>r.amount)),min=Math.min(...recent.map(r=>r.amount)),max=Math.max(...recent.map(r=>r.amount));
  if(days(last.date,asOf)>expected*1.6||max-min>Math.max(100,Math.abs(amount)*.1))continue;
  if(schedules.some(s=>s.account===last.account&&s.payee===last.payee&&Math.sign(s.amount)===Math.sign(amount)&&scheduleFrequency(s)===frequency))continue;
  const key=JSON.stringify([last.account,last.payee,frequency,last.date]);if(settings.recurringDismissals?.[key])continue;
  const next=expandSchedule({date:{start:last.date,frequency,interval:1}},dayAdd(asOf,1),dayAdd(asOf,400))[0];
  if(next)candidates.push({key,accountId:last.account,payeeId:last.payee,name:payees.get(last.payee)?.name||last.imported_payee||'Wiederkehrende Zahlung',frequency,amount,minAmount:min,maxAmount:max,nextDate:next,transactionIds:recent.map(r=>r.id),lastDate:last.date,count:recent.length});
 }
 const warnings=[];
 for(const s of schedules){
  if(!accounts.has(s.account)||accounts.get(s.account).closed)warnings.push({id:s.id,kind:'account',text:`${s.name}: Konto fehlt oder ist geschlossen.`,scheduleIds:[s.id]});
  if(s.payee&&!payees.has(s.payee))warnings.push({id:s.id,kind:'payee',text:`${s.name}: Empfänger fehlt.`,scheduleIds:[s.id]});
 }
 for(let i=0;i<schedules.length;i++)for(let j=i+1;j<schedules.length;j++){
  const a=schedules[i],b=schedules[j];if(!a.payee||a.account!==b.account||a.payee!==b.payee||a.amount!==b.amount||scheduleFrequency(a)!==scheduleFrequency(b))continue;
  const x=expandSchedule(a,asOf,dayAdd(asOf,400))[0],y=expandSchedule(b,asOf,dayAdd(asOf,400))[0];
  if(x&&y&&Math.abs(days(x,y))<=3)warnings.push({id:a.id+':'+b.id,kind:'duplicate',text:`${a.name} / ${b.name}: gleicher Empfänger, Betrag, Turnus und nahe Termine. Möglicherweise doppelt.`,scheduleIds:[a.id,b.id]});
 }
 return {candidates,warnings,basis:'Mindestens drei gebuchte Zahlungen desselben Empfängers und Kontos mit regelmäßigem Abstand. Vorschläge sind keine bestätigten Verträge.'};
}

// Konto-Default für neue Zahlungspläne: das offene Konto mit den meisten aktiven Plänen (FG-16).
export function defaultScheduleAccount(schedules=[],accounts=[]){
 const open=accounts.filter(a=>a&&!a.closed&&!a.tombstone),openIds=new Set(open.map(a=>a.id)),counts=new Map();
 for(const s of schedules)if(s&&!s.completed&&openIds.has(s.account))counts.set(s.account,(counts.get(s.account)||0)+1);
 const best=[...counts].sort((a,b)=>b[1]-a[1])[0];
 return best?.[0]||open[0]?.id||null;
}
// Ein erkannter Vorschlag wird ohne Formular als Zahlungsplan angelegt; er bucht nie automatisch
// (Entscheidung 5 des Gesamtaudits: posts_transaction bleibt false).
export function candidateSchedule(candidate){
 if(!candidate||typeof candidate.accountId!=='string'||!candidate.accountId||!Number.isSafeInteger(candidate.amount)||!candidate.amount||!/^\d{4}-\d{2}-\d{2}$/.test(candidate.nextDate||'')||!['weekly','monthly','yearly'].includes(candidate.frequency))throw new Error('Der Vorschlag ist unvollständig und kann nicht übernommen werden.');
 return {name:String(candidate.name||'Wiederkehrende Zahlung').trim().slice(0,100),account:candidate.accountId,payee:candidate.payeeId||'',amount:candidate.amount,amountOp:'is',date:{start:candidate.nextDate,frequency:candidate.frequency,interval:1},posts_transaction:false};
}
