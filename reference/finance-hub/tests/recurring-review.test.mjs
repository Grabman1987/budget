import test from 'node:test';import assert from 'node:assert/strict';import {recurringReview} from '../recurring-review.mjs';
const live={accounts:[{id:'a'}],payees:[{id:'p',name:'Internet'},{id:'transfer',transfer_acct:'b'}],rawTransactions:['06','07','08','09'].map(m=>({id:m,account:'a',payee:'p',date:`2026-${m}-01`,amount:-5400,cleared:true})),schedules:[]};
test('recurrence is a reviewable draft, never a transaction; existing and dismissed plans are excluded',()=>{const result=recurringReview(live,{},'2026-09-23');assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].nextDate,'2026-10-01');assert.equal(result.candidates[0].amount,-5400);assert.equal(recurringReview(live,{recurringDismissals:{[result.candidates[0].key]:true}},'2026-09-23').candidates.length,0);const schedule={id:'s',name:'Internet',account:'a',payee:'p',amount:-5400,date:{start:'2026-06-01',frequency:'monthly',interval:1}};assert.equal(recurringReview({...live,schedules:[schedule]}, {},'2026-09-23').candidates.length,0);assert.equal(recurringReview({...live,schedules:[schedule,{...schedule,id:'copy'}]}, {},'2026-09-23').warnings[0].kind,'duplicate');});
test('unreliable patterns, transfers, splits and pending rows never invent a recurring contract',()=>{for(const patch of [{payee:'transfer'},{parent_id:'parent'},{cleared:false}])assert.equal(recurringReview({...live,rawTransactions:live.rawTransactions.map(t=>({...t,...patch}))},{},'2026-09-23').candidates.length,0);assert.equal(recurringReview({...live,rawTransactions:live.rawTransactions.map((t,i)=>({...t,amount:-1000*(i+1)}))},{},'2026-09-23').candidates.length,0);});
import {defaultScheduleAccount,candidateSchedule} from '../recurring-review.mjs';
test('FG-16: Konto-Default ist das Konto mit den meisten Plänen; Übernahme legt einen Plan ohne automatische Buchung an',()=>{
 const accounts=[{id:'a',name:'Geldbörse'},{id:'b',name:'Giro'},{id:'c',name:'Alt',closed:true}];
 const schedules=[{id:'1',account:'b'},{id:'2',account:'b'},{id:'3',account:'a'},{id:'4',account:'c'},{id:'5',account:'c'},{id:'6',account:'c'},{id:'7',account:'b',completed:true}];
 assert.equal(defaultScheduleAccount(schedules,accounts),'b');
 assert.equal(defaultScheduleAccount([],accounts),'a');
 const result=recurringReview(live,{},'2026-09-23');
 const payload=candidateSchedule(result.candidates[0]);
 assert.deepEqual(payload,{name:'Internet',account:'a',payee:'p',amount:-5400,amountOp:'is',date:{start:'2026-10-01',frequency:'monthly',interval:1},posts_transaction:false});
 assert.throws(()=>candidateSchedule({...result.candidates[0],frequency:'daily'}),/unvollständig/);
 assert.throws(()=>candidateSchedule(null),/unvollständig/);
});
