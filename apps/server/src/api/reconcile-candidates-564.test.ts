import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, createBooking, schema, type OpenedDatabase, type ReconciliationPreview, type ReconcileResult } from '@budget/db';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened:OpenedDatabase;
beforeEach(()=>{opened=createTestDatabase();seedBasics(opened.db);});
afterEach(()=>opened.close());
const state=()=>({bookings:opened.db.select().from(schema.booking).all(),splits:opened.db.select().from(schema.bookingSplit).all()});
const app=()=>createLedgerApi({db:opened.db,today:()=> '2026-10-02',stepUp:async(_c,next)=>next()});
const send=(api:ReturnType<typeof app>,method:string,path:string,body?:unknown)=>api.request(path,{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});

it('exposes partial pending minus3000 against a minus4000 difference and preserves canonical confirm/Undo without posting a correction',async()=>{
  const id=createBooking(opened.db,{accountId:'giro',date:'2026-09-30',amountCents:-3000,status:'pending',splits:[{categoryId:'essen',amountCents:-3000}]},testCtx);
  const api=app();
  const before=state();
  const auditBefore=opened.db.select().from(schema.auditLog).all();
  const read=async()=>{
    const response=await send(api,'POST','/accounts/giro/reconciliation/preview',{date:'2026-09-30',statementBalanceCents:96000});
    expect(response.status).toBe(200);
    return (await response.json() as {preview:ReconciliationPreview}).preview;
  };
  const initial=await read();
  expect(initial.bookedBalanceCents).toBe(100000);
  expect(initial.differenceCents).toBe(-4000);
  expect(initial.pendingCents).toBe(-3000);
  expect(initial.pendingMatches).toEqual([]);
  expect(initial.pendingBookings).toMatchObject([{id,date:'2026-09-30',amountCents:-3000,payeeName:null}]);
  expect(initial.pendingBookings[0]).toMatchObject({valuation:{currency:'EUR',eurCents:-3000,asOf:'2026-09-30'}});
  expect(state()).toEqual(before);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(auditBefore);
  const confirmedResponse=await send(api,'POST','/bookings/bulk',{action:'update',ids:[id],set:{status:'confirmed'}});
  expect(confirmedResponse.status).toBe(200);
  const confirmed=await confirmedResponse.json() as {changed:string[];skipped:unknown[];groupId:string};
  expect(confirmed.changed).toEqual([id]);
  expect(confirmed.skipped).toEqual([]);
  expect((await read()).differenceCents).toBe(-1000);
  expect((await read()).pendingBookings).toEqual([]);
  expect(opened.db.select().from(schema.accountReconciliation).all()).toEqual([]);
  expect(state().bookings).toHaveLength(before.bookings.length);
  expect((await send(api,'POST','/undo',{groupId:confirmed.groupId})).status).toBe(200);
  expect(state()).toEqual(before);
  expect((await read()).differenceCents).toBe(-4000);
});

it('deletes a shown equal duplicate to literal zero, then explicitly locks without adjustment and exactly undoes both actions',async()=>{
  for(const id of ['original','duplicate']) createBooking(opened.db,{id,accountId:'giro',date:'2026-09-30',amountCents:-1234,status:'confirmed',splits:[{categoryId:'essen',amountCents:-1234}]},testCtx);
  const api=app();
  const before=state();
  const input={date:'2026-09-30',statementBalanceCents:98766};
  const read=async()=> (await (await send(api,'POST','/accounts/giro/reconciliation/preview',input)).json() as {preview:ReconciliationPreview}).preview;
  const preview=await read();
  expect(preview.bookedBalanceCents).toBe(97532);
  expect(preview.differenceCents).toBe(1234);
  expect(preview.duplicates).toHaveLength(1);
  expect(preview.duplicates[0]).toMatchObject({amountCents:-1234,explainsDifference:true});
  expect(state()).toEqual(before);
  const removedResponse=await send(api,'DELETE',`/bookings/${preview.duplicates[0]!.removeId}`);
  expect(removedResponse.status).toBe(200);
  const removed=await removedResponse.json() as {groupId:string};
  expect((await read()).differenceCents).toBe(0);
  expect(opened.db.select().from(schema.accountReconciliation).all()).toEqual([]);
  const afterDelete=state();
  const lockResponse=await send(api,'POST','/accounts/giro/reconciliation',input);
  expect(lockResponse.status).toBe(201);
  const locked=await lockResponse.json() as {result:ReconcileResult};
  expect(locked.result.adjustmentBookingId).toBeNull();
  expect(locked.result.differenceCents).toBe(0);
  expect(locked.result.reconciledCount).toBe(1);
  expect(state().bookings.filter(row=>row.deletedAt===null).map(row=>[row.amountCents,row.status])).toEqual([[-1234,'reconciled']]);
  expect((await send(api,'POST','/undo',{groupId:locked.result.groupId})).status).toBe(200);
  expect(state()).toEqual(afterDelete);
  expect((await send(api,'POST','/undo',{groupId:removed.groupId})).status).toBe(200);
  expect(state()).toEqual(before);
});

it('565 canonical category/null corrections keep literal minus1234 and exact grouped Undo',async()=>{
  const api=app();
  for(const categoryId of [undefined,'essen']){
    const before=state();
    const reconciliationsBefore=opened.db.select().from(schema.accountReconciliation).all();
    const response=await send(api,'POST','/accounts/giro/reconciliation',{date:'2026-09-30',statementBalanceCents:98766,adjust:true,...(categoryId?{categoryId}:{})});
    expect(response.status).toBe(201);
    const {result}=await response.json() as {result:ReconcileResult};
    expect(result.differenceCents).toBe(-1234);
    expect(result.adjustmentBookingId).toBeTruthy();
    const adjustment=state().bookings.find(row=>row.id===result.adjustmentBookingId)!;
    const reconciliation=opened.db.select().from(schema.accountReconciliation).all().find(row=>row.adjustmentBookingId===adjustment.id)!;
    expect(reconciliation).toBeTruthy();
    expect([adjustment.amountCents,adjustment.status]).toEqual([-1234,'reconciled']);
    expect(state().splits.filter(row=>row.bookingId===adjustment.id).map(row=>[row.amountCents,row.categoryId])).toEqual([[-1234,categoryId??null]]);
    expect((await send(api,'POST','/undo',{groupId:result.groupId})).status).toBe(200);
    const after=state();
    expect(after.bookings.filter(row=>row.id!==adjustment.id)).toEqual(before.bookings);
    expect(after.splits).toEqual(before.splits);
    const tombstone=after.bookings.find(row=>row.id===adjustment.id)!;
    // Tombstone status is an internal reversal detail; verify every other retained column.
    expect({...tombstone,status:undefined}).toEqual({...adjustment,status:undefined,deletedAt:expect.any(String),updatedAt:expect.any(String)});
    expect(after.bookings.filter(row=>row.deletedAt===null)).toEqual(before.bookings.filter(row=>row.deletedAt===null));
    expect((await send(api,'GET',`/bookings/${adjustment.id}`)).status).toBe(404);
    const reconciliationsAfter=opened.db.select().from(schema.accountReconciliation).all();
    expect(reconciliationsAfter.filter(row=>row.id!==reconciliation.id)).toEqual(reconciliationsBefore);
    expect(reconciliationsAfter.find(row=>row.id===reconciliation.id)).toEqual({...reconciliation,deletedAt:expect.any(String),updatedAt:expect.any(String)});
    expect(reconciliationsAfter.filter(row=>row.deletedAt===null)).toEqual(reconciliationsBefore.filter(row=>row.deletedAt===null));
  }
});

it('565 lookup metadata distinguishes archived choices without offering deleted categories',async()=>{
  const api=app();
  const hidden=await send(api,'PATCH','/categories/essen',{hidden:true});
  expect(hidden.status).toBe(200);
  const response=await send(api,'GET','/lookups');
  expect(response.status).toBe(200);
  const body=await response.json() as {categories:{id:string;hiddenAt:string|null}[]};
  expect(body.categories.find(row=>row.id==='essen')?.hiddenAt).toBeTruthy();
  expect(body.categories.find(row=>row.id==='miete')?.hiddenAt).toBeNull();
});
