import {cardRoleMode} from './account-roles.mjs';
// Nutzer confirmed both named cards are paid in full on 2026-09-23 (name fallback in account-roles.mjs).
// Account-specific payment modes win, then the account role (settings.accountRoles).
export function cardPaymentMode(account,settings={},asOf='2026-09-23'){
 const configured=settings.creditCardPaymentModes?.[account.id];
 if(['full-pay','revolving'].includes(configured))return configured;
 return cardRoleMode(account,settings,asOf);
}
export function debtBuckets(rows,settings={},asOf='2026-09-23'){
 const liabilities=rows.filter(r=>Number.isSafeInteger(r.value)&&r.value<0);
 const cards=liabilities.filter(r=>cardPaymentMode(r,settings,asOf)==='full-pay');
 return {liabilities,cards,financing:liabilities.filter(r=>!cards.includes(r))};
}
