// TD-16: account roles instead of hard-wired account names. settings.accountRoles maps an Actual
// account id to one role; without an entry the role is derived from the historical name patterns
// below, so Nutzer's cockpit computes exactly what it computed before roles existed. This module is
// the only place that knows bank names – every other module asks accountRole()/hasAccountRole().
export const ACCOUNT_ROLES=Object.freeze([
 Object.freeze({id:'salary',label:'Gehaltskonto',hint:'Eingang von Gehalt, Startpunkt der Liquiditätsvorschau'}),
 Object.freeze({id:'overdraft-line',label:'Girokonto mit Dispo',hint:'Zahlungskonto; den Rahmen trägst du unter Liquidität ein'}),
 Object.freeze({id:'savings',label:'Tagesgeld / Sparkonto',hint:'Zahlungskonto ohne Karte'}),
 Object.freeze({id:'credit-card-full-pay',label:'Kreditkarte · voll bezahlt',hint:'Saldo wird jeden Monat ganz ausgeglichen, keine Finanzierung'}),
 Object.freeze({id:'fuel-card',label:'Tankkarte · voll bezahlt',hint:'wie Kreditkarte voll bezahlt; Standardkonto für Tankbelege'}),
 Object.freeze({id:'credit-card',label:'Kreditkarte · Teilzahlung',hint:'offener Saldo gilt als Finanzierung'}),
 Object.freeze({id:'loan',label:'Kredit / Darlehen',hint:'Restschuld, Zinsschätzung und Tilgungsrechner'}),
 Object.freeze({id:'cash',label:'Bargeld',hint:'Zählung statt Bankabruf'}),
 Object.freeze({id:'payment',label:'Zahlungsdienst',hint:'z. B. PayPal'}),
 Object.freeze({id:'broker',label:'Depot',hint:'Wertpapiere, Bewertung aus Depotquellen'}),
 Object.freeze({id:'broker-cash',label:'Verrechnungskonto Broker',hint:'Geld beim Broker, zählt zu den Anlagen'}),
 Object.freeze({id:'crypto',label:'Krypto',hint:'Krypto-Plattform'}),
 Object.freeze({id:'p2p',label:'P2P-Plattform',hint:'Plattformstand monatlich'}),
 Object.freeze({id:'other',label:'Keine besondere Rolle',hint:'schaltet die automatische Erkennung für dieses Konto ab'}),
]);
const ROLE_IDS=new Set(ACCOUNT_ROLES.map(role=>role.id));
export const isAccountRole=value=>typeof value==='string'&&ROLE_IDS.has(value);
export const roleLabel=id=>ACCOUNT_ROLES.find(role=>role.id===id)?.label||'Keine besondere Rolle';

// Historical name patterns (before TD-16), first match wins. Cards come before loans because
// "Kreditkarte" contains "kredit".
const LEGACY_PATTERNS=Object.freeze([
 ['cash',/geldb[oö]rse|^cash$|bargeld/i],
 ['credit-card-full-pay',/^visa$/i],
 ['fuel-card',/cardD/i],
 ['credit-card',/visa|kreditkarte/i],
 ['loan',/kredit|bankC|darlehen|\bloan\b|bankC/i],
 ['salary',/bankA/i],
 ['broker-cash',/^(brokerB|cryptoPlatform) konto/i],
 ['p2p',/mintos|viainvest|indemo|^income$/i],
 ['crypto',/cryptoPlatform/i],
 ['broker',/depot|brokerB|brokerE/i],
 ['payment',/paypal/i],
]);
/** Role from the account (or PP cash account) name alone, as the cockpit guessed before roles existed. */
export function legacyAccountRole(name){
 const text=String(name??'').trim();
 if(!text)return null;
 for(const [role,pattern] of LEGACY_PATTERNS)if(pattern.test(text))return role;
 return null;
}
const rolesOf=settings=>{const roles=settings?.accountRoles;return roles&&typeof roles==='object'&&!Array.isArray(roles)?roles:{};};
/** The explicit role stored for this account id, or null. */
export function explicitAccountRole(accountOrId,settings){
 const id=typeof accountOrId==='string'?accountOrId:accountOrId?.id;
 const value=id?rolesOf(settings)[id]:null;
 return isAccountRole(value)?value:null;
}
/** Role of an account or wealth row: settings.accountRoles[id] first, then the name fallback. 'other' → null. */
export function accountRole(account,settings){
 if(!account)return null;
 const explicit=explicitAccountRole(account,settings);
 if(explicit)return explicit==='other'?null:explicit;
 return legacyAccountRole(account.name);
}
/** Role of a wealth row from mergedWealth (carries accountRole) or of a PP row (name fallback). */
export const rowAccountRole=row=>row&&Object.hasOwn(row,'accountRole')?row.accountRole:legacyAccountRole(row?.name);
export const hasAccountRole=(account,settings,...roles)=>{const role=accountRole(account,settings);return role!==null&&roles.includes(role);};
export const accountsWithRole=(accounts,settings,...roles)=>(accounts||[]).filter(account=>hasAccountRole(account,settings,...roles));
/** First account with one of the roles; open accounts before closed ones, list order otherwise. */
export function accountByRole(accounts,settings,...roles){
 const matches=accountsWithRole(accounts,settings,...roles);
 return matches.find(account=>!account.closed)||matches[0]||null;
}
export const CARD_ROLES=Object.freeze(['credit-card-full-pay','fuel-card','credit-card']);
export const FINANCING_ROLES=Object.freeze(['loan',...CARD_ROLES]);
export const isCashAccount=(account,settings)=>hasAccountRole(account,settings,'cash');
export const isLoanAccount=(account,settings)=>hasAccountRole(account,settings,'loan');
export const isCardAccount=(account,settings)=>hasAccountRole(account,settings,...CARD_ROLES);
export const isFinancingAccount=(account,settings)=>hasAccountRole(account,settings,...FINANCING_ROLES);
export const isP2PAccount=(account,settings)=>hasAccountRole(account,settings,'p2p');
export const isBrokerAccount=(account,settings)=>hasAccountRole(account,settings,'broker','crypto','broker-cash');
/** The loan the repayment calculator and the Schulden page talk about: open loan with the largest debt. */
export function primaryLoanAccount(accounts,settings){
 const loans=accountsWithRole(accounts,settings,'loan');
 const open=loans.filter(account=>!account.closed);
 const pool=open.length?open:loans;
 return pool.slice().sort((a,b)=>(Number.isSafeInteger(a.balance)?a.balance:0)-(Number.isSafeInteger(b.balance)?b.balance:0))[0]||null;
}
/** Account for fuel receipts: an explicit or recognised fuel card. */
export const fuelCardAccount=(accounts,settings)=>accountByRole(accounts,settings,'fuel-card');
/** Salary account (liquidity start point, quick entry default). */
export const salaryAccount=(accounts,settings)=>accountByRole(accounts,settings,'salary');
// Credit-card settlement: explicit roles decide at once; the name fallback only from the day Nutzer
// confirmed that both named cards are paid in full (2026-09-23).
export const FULL_PAY_CONFIRMED='2026-09-23';
export function cardRoleMode(account,settings,asOf=FULL_PAY_CONFIRMED){
 const explicit=explicitAccountRole(account,settings);
 if(explicit)return ['credit-card-full-pay','fuel-card'].includes(explicit)?'full-pay':explicit==='credit-card'?'revolving':'unknown';
 const legacy=legacyAccountRole(account?.name);
 return asOf>=FULL_PAY_CONFIRMED&&['credit-card-full-pay','fuel-card'].includes(legacy)&&/^(visa|cardD)$/i.test(String(account?.name||'').trim())?'full-pay':'unknown';
}
// Loan schedules are recognised by their name (Actual schedules carry no account role).
const LOAN_SCHEDULE=/bankC|kredit|darlehen/i;
export const isLoanScheduleName=name=>LOAN_SCHEDULE.test(String(name??''));
// Default order inside an account group (Geldbörse, Gehaltskonto, TR, Visa, cardD, PayPal, Kredit).
const ROLE_RANK=Object.freeze({cash:0,salary:1,'overdraft-line':1,savings:2,'credit-card-full-pay':3,'credit-card':3,'fuel-card':4,payment:5,loan:6});
const LEGACY_RANK=Object.freeze([/geldb[oö]rse|^cash$|^bargeld$/,/bankA/,/brokerA/,/\bvisa\b/,/cardD/,/paypal/,/bankC/]);
export function accountSortRank(account,settings){
 const explicit=explicitAccountRole(account,settings);
 if(explicit)return ROLE_RANK[explicit]??100;
 const name=String(account?.name??'').normalize('NFC').toLocaleLowerCase('de-AT');
 const match=LEGACY_RANK.findIndex(pattern=>pattern.test(name));
 return match<0?100:match;
}
/** Loans group of the account register (historical pattern: bankC, Darlehen, loan, Hochzeitskredit). */
export function isRegisterLoan(account,settings){
 const explicit=explicitAccountRole(account,settings);
 if(explicit)return explicit==='loan';
 return /bankC|darlehen|\bloan\b|hochzeits.kredit/i.test(account?.name||'');
}
/** Stores one role; null/'' removes the entry. Returns a new workspace, the input stays untouched. */
export function setAccountRole(workspace,accountId,role){
 if(typeof accountId!=='string'||!accountId)throw new Error('Konto fehlt.');
 if(role!==null&&role!==''&&!isAccountRole(role))throw new Error('Unbekannte Kontorolle.');
 const settings={...(workspace?.settings||{})},roles={...rolesOf(settings)};
 if(role)roles[accountId]=role;else delete roles[accountId];
 if(Object.keys(roles).length)settings.accountRoles=roles;else delete settings.accountRoles;
 return {...workspace,settings};
}
