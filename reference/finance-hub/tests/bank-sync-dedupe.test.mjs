import test from 'node:test';
import assert from 'node:assert/strict';
import {planDuplicateRemoval,syncAccountWithGuard} from '../bank-sync-dedupe.mjs';

const row=(id,date,amount,extra={})=>({id,date,amount,...extra});

test('a feed without import ids that re-sends the whole window creates copies, which are removed',()=>{
 const before=[row('a','2026-09-19',-2780),row('b','2026-09-19',-3500,{payee:'p1'})];
 const after=[...before,row('c','2026-09-19',-2780),row('d','2026-09-19',-3500)];
 const plan=planDuplicateRemoval(before,after);
 assert.deepEqual(plan.deleteIds,['c','d']);assert.equal(plan.added,2);assert.equal(plan.kept,0);assert.equal(plan.summary.removed,2);
});

test('pending and booked copies of the same movement inside one sync are kept and flagged, never deleted',()=>{
 const plan=planDuplicateRemoval([],[row('x','2026-09-23',-6970),row('y','2026-09-23',-6970),row('z','2026-09-23',-10000)]);
 assert.deepEqual(plan.deleteIds,[]);assert.equal(plan.kept,3);
 assert.deepEqual(plan.possibleDuplicates,[{id:'y',date:'2026-09-23',amountEURcents:-6970}]);
 assert.equal(plan.summary.possibleDuplicates,1);
});

test('two genuine identical bookings on one day survive: at most existingCount copies per key are removed',()=>{
 // The ledger knows one row; the feed re-sends it (one copy) and adds a second, real booking.
 const before=[row('k','2026-09-10',-1500,{imported_payee:'Spar'})];
 const after=[...before,row('n1','2026-09-10',-1500,{imported_payee:'Spar'}),row('n2','2026-09-10',-1500,{imported_payee:'Spar'})];
 const plan=planDuplicateRemoval(before,after);
 assert.deepEqual(plan.deleteIds,['n1']);
 assert.equal(plan.kept,1);
 // Two known rows, three new ones: two removed, one kept.
 const known=[...before,row('k2','2026-09-10',-1500,{imported_payee:'Spar'})];
 const twice=planDuplicateRemoval(known,[...known,row('m1','2026-09-10',-1500,{imported_payee:'Spar'}),row('m2','2026-09-10',-1500,{imported_payee:'Spar'}),row('m3','2026-09-10',-1500,{imported_payee:'Spar'})]);
 assert.deepEqual(twice.deleteIds,['m1','m2']);assert.equal(twice.kept,1);
});

test('a second run over the same ledger is idempotent: nothing added, nothing deleted',()=>{
 const before=[row('a','2026-09-19',-2780)],after=[...before,row('c','2026-09-19',-2780),row('d','2026-09-19',-2780)];
 const first=planDuplicateRemoval(before,after);
 assert.deepEqual(first.deleteIds,['c']);
 const ledger=after.filter(t=>!first.deleteIds.includes(t.id));
 const second=planDuplicateRemoval(ledger,ledger);
 assert.deepEqual(second.deleteIds,[]);assert.equal(second.added,0);assert.equal(second.possibleDuplicates.length,0);
});

test('rows with an import id or a transfer are never touched, and pre-existing rows are never deleted',()=>{
 const before=[row('old','2026-09-01',-1000)];
 const after=[...before,row('n1','2026-09-01',-1000,{imported_id:'bank-1'}),row('n2','2026-09-01',-1000,{transfer_id:'t'}),row('n3','2026-09-01',-1000)];
 const plan=planDuplicateRemoval(before,after);
 assert.deepEqual(plan.deleteIds,['n3']);
});

test('only rows inside the sync window are candidates',()=>{
 const before=[row('old','2026-05-01',-1000)];
 const after=[...before,row('n1','2026-05-01',-1000)];
 assert.deepEqual(planDuplicateRemoval(before,after,{from:'2026-06-01'}).deleteIds,[]);
 assert.deepEqual(planDuplicateRemoval(before,after,{from:'2026-04-01'}).deleteIds,['n1']);
});

test('different bank texts on the same day and amount are two movements',()=>{
 const plan=planDuplicateRemoval([],[row('a','2026-09-05',-250,{imported_payee:'Win2Day'}),row('b','2026-09-05',-250,{imported_payee:'Spar'})]);
 assert.deepEqual(plan.deleteIds,[]);assert.equal(plan.possibleDuplicates.length,0);
});

test('a runaway feed is capped instead of deleting hundreds of rows',()=>{
 const before=Array.from({length:250},(_,i)=>row('k'+i,'2026-09-01',-100));
 const after=[...before,...Array.from({length:250},(_,i)=>row('c'+i,'2026-09-01',-100))];
 const plan=planDuplicateRemoval(before,after,{maxDeletions:200});
 assert.equal(plan.capped,true);assert.deepEqual(plan.deleteIds,[]);assert.equal(plan.summary.reason,'Zu viele Kopien · nichts gelöscht');
});

test('syncAccountWithGuard reads before and after, deletes the copies and syncs once',async()=>{
 const ledger=[row('a','2026-09-19',-2780)];const calls=[];
 const api={getTransactions:async()=>ledger.map(t=>({...t})),runBankSync:async()=>{ledger.push(row('copy','2026-09-19',-2780));calls.push('sync-bank');},deleteTransaction:async id=>{calls.push('delete:'+id);const i=ledger.findIndex(t=>t.id===id);ledger.splice(i,1);},sync:async()=>calls.push('sync')};
 const result=await syncAccountWithGuard(api,'acct',{now:Date.parse('2026-09-24T06:00:00Z')});
 assert.deepEqual(calls,['sync-bank','delete:copy','sync']);assert.equal(result.dedupe.removed,1);assert.equal(ledger.length,1);
 // Second run: the feed sends nothing new, nothing is deleted.
 const again=await syncAccountWithGuard({...api,runBankSync:async()=>calls.push('sync-bank')},'acct',{now:Date.parse('2026-09-25T06:00:00Z')});
 assert.equal(again.dedupe.removed,0);assert.equal(ledger.length,1);
});

test('re-sent history shifted by up to three days is a copy; a weekly standing amount is not',()=>{
 const before=[row('pending','2026-09-22',-840,{payee:'parkgarage'}),row('w1','2026-09-16',13000,{payee:'bankA'})];
 const after=[...before,row('booked','2026-09-24',-840),row('w2','2026-09-23',13000)];
 const plan=planDuplicateRemoval(before,after,{asOf:'2026-09-30'});
 assert.deepEqual(plan.deleteIds,['booked']);
 assert.equal(plan.kept,1);assert.equal(plan.possibleDuplicates.length,0);
});

test('a recent same-amount row next to a stored one is kept and flagged, never deleted',()=>{
 // Two real 1,50 € purchases on consecutive days: the second arrives while the first is stored.
 const before=[row('mc1','2026-09-24',-150,{payee:'mcdonalds'})];
 const after=[...before,row('mc2','2026-09-25',-150)];
 const plan=planDuplicateRemoval(before,after,{asOf:'2026-09-26'});
 assert.deepEqual(plan.deleteIds,[]);assert.equal(plan.kept,1);
 assert.deepEqual(plan.possibleDuplicates,[{id:'mc2',date:'2026-09-25',amountEURcents:-150}]);
 // Without a reference day the shift net stays off entirely.
 assert.deepEqual(planDuplicateRemoval(before,[...before,row('old','2026-09-22',-150)]).deleteIds,[]);
});
