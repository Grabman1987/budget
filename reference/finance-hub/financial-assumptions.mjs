// Effective monthly assumptions, independent of ledger transactions and claims.
const fields=['salary','salaryDay','reserveTarget','contribution','contactCRent','contactCAudioSubscription'];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Vienna'}).format(new Date());
const monthOf=value=>String(value||'').slice(0,7);
const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const resolvedMonth=Symbol('financial-assumption-month');
export const financialAssumptionDate=settings=>settings?.[resolvedMonth]||today();
const money=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function legacyValues(settings={}){
 return {salary:money(settings.salary),salaryDay:Number.isInteger(settings.salaryDay)&&settings.salaryDay>=1&&settings.salaryDay<=31?settings.salaryDay:null,reserveTarget:money(settings.reserveTarget),contribution:money(settings.contribution),contactCRent:money(settings.contactC?.rentMonthlyEURcents),contactCAudioSubscription:money(settings.contactC?.audioSubscriptionMonthlyEURcents)};
}
export function resolveFinancialAssumptions(settings={},date=today()){
 const month=monthOf(date);if(!validMonth(month))throw Error('Ungültiger Monat für Grundannahmen.');
 const candidates=(settings.financialAssumptionRevisions||[]).filter(row=>row.effectiveFrom<=month).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||a.version-b.version);
 const revision=candidates.at(-1);
 return {month,values:revision?structuredClone(revision.values):legacyValues(settings),revisionId:revision?.id||null,version:revision?.version||0,effectiveFrom:revision?.effectiveFrom||null,provenance:revision?.provenance||'legacy-undated'};
}
export function financialSettingsAt(settings={},date=today()){
 const resolved=resolveFinancialAssumptions(settings,date);
 if(!resolved.revisionId)return settings;
 const value=resolved.values,next={...settings,[resolvedMonth]:resolved.month,salary:value.salary,salaryDay:value.salaryDay,reserveTarget:value.reserveTarget,contribution:value.contribution};
 if(settings.contactC)next.contactC={...settings.contactC,rentMonthlyEURcents:value.contactCRent,audioSubscriptionMonthlyEURcents:value.contactCAudioSubscription};
 return next;
}
export function saveFinancialAssumptions(workspace,input,{effectiveFrom,asOf=today(),source='manual',recordedAt=new Date().toISOString()}={}){
 if(!validMonth(effectiveFrom)||effectiveFrom<'2023-01'||effectiveFrom>'2100-12'||!validMonth(monthOf(asOf)))throw Error('Bitte einen gültigen Monat ab 2023 für die Grundannahmen wählen.');
 if(!input||!fields.some(key=>Object.hasOwn(input,key)))throw Error('Keine Grundannahmen übergeben.');
 for(const key of fields)if(Object.hasOwn(input,key)&&(!Number.isSafeInteger(input[key])||input[key]<0||key==='salaryDay'&&(input[key]<1||input[key]>31)))throw Error('Grundannahmen benötigen nichtnegative ganze Cent und einen Gehaltstag von 1 bis 31.');
 const next=structuredClone(workspace);next.settings||={};const s=next.settings;
 if(!s.financialAssumptionRevisions?.length)s.financialAssumptionRevisions=[{id:globalThis.crypto.randomUUID(),version:1,effectiveFrom:'0001-01',values:legacyValues(s),provenance:'legacy-undated',source:'Bisherige gespeicherte Annahmen; historischer Beginn nicht belegt',recordedAt}];
 const prior=resolveFinancialAssumptions(s,effectiveFrom),values={...prior.values,...Object.fromEntries(fields.filter(key=>Object.hasOwn(input,key)).map(key=>[key,input[key]]))};
 if(s.contactC&&Number.isSafeInteger(values.contactCRent)&&Number.isSafeInteger(values.contactCAudioSubscription)){
  values.contribution=values.contactCRent+values.contactCAudioSubscription;if(!Number.isSafeInteger(values.contribution))throw Error('Beitrag ist zu groß.');
 }
 const revision={id:globalThis.crypto.randomUUID(),version:Math.max(...s.financialAssumptionRevisions.map(row=>row.version))+1,effectiveFrom,values,provenance:'explicit-month',source:String(source).trim()||'manual',recordedAt};
 s.financialAssumptionRevisions.push(revision);
 const current=financialSettingsAt(s,asOf);
 // Mirrors exist only for legacy callers. Future revisions never become today's
 // values, and all historical projections resolve the immutable snapshots.
 for(const key of ['salary','salaryDay','reserveTarget','contribution'])if(current[key]!==null)s[key]=current[key];
 if(s.contactC)s.contactC={...s.contactC,rentMonthlyEURcents:current.contactC.rentMonthlyEURcents,audioSubscriptionMonthlyEURcents:current.contactC.audioSubscriptionMonthlyEURcents};
 return next;
}
