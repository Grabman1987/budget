import test from 'node:test';
import assert from 'node:assert/strict';
import {previewImportRun,normalizeImportBatch,importIdentity} from '../import-matching.mjs';
import {decideImportRow,upsertImportRun} from '../import-run-model.mjs';
import {applyImportRun} from '../import-actions.mjs';
import {parseImportFile,renderImportReview} from '../src/import-review.js';
const batch=(transactions=[{importId:'i1',date:'2026-09-22',amount:-1250,payee:'Market'}],extra={})=>({providerId:'bank',sourceAccountId:'source',accountId:'a',batchId:'b1',rangeFrom:'2026-09-01',rangeTo:'2026-09-23',transactions,...extra});
const manual=(extra={})=>({id:'m',account:'a',date:'2026-09-21',amount:-1250,notes:'Own note',category:'food',cleared:false,imported_id:'cockpit-manual:1',...extra});
const decide=(r,type='match',transactionId='m')=>decideImportRow(r,r.rows[0].key,{type,transactionId});
function fixture(initial,metadata={}) {
 let rows=structuredClone(initial),saved,writes=0,failSync=false,failFinal=false;
 const api={getTransactions:async()=>structuredClone(rows),updateTransaction:async(id,fields)=>{writes++;const row=rows.find(r=>r.id===id);Object.assign(row,fields);if(row.subtransactions)row.subtransactions.forEach(s=>s.cleared=fields.cleared);},sync:async()=>{if(failSync)throw Error('synthetic');},importTransactions:async(account,payload,opts)=>{if(opts.dryRun)return {added:['new'],updated:[],errors:[]};writes++;rows.push({...payload[0],account,id:'new'});return {added:['new'],updated:[],errors:[]};}};
 return {api,readMetadata:()=>metadata,saveRun:async r=>{if(failFinal&&r.rows[0].state==='applied')throw Error('workspace');saved=structuredClone(r);},get rows(){return rows;},get saved(){return saved;},get writes(){return writes;},set failSync(v){failSync=v;},set failFinal(v){failFinal=v;}};
}
test('provider/account/import IDs do not collide and duplicate source IDs block',()=>{
 assert.notEqual(importIdentity('a:b','c','d'),importIdentity('a','b:c','d'));
 const source=batch();source.transactions.push({...source.transactions[0]});const run=previewImportRun(source);assert.ok(run.rows.every(r=>r.state==='conflict'));assert.throws(()=>decide(run,'add'),/Datenkonflikt/);
});
test('same amount candidates never auto-merge; cents and account must match',()=>{
 const run=previewImportRun(batch(),[manual(),manual({id:'m2'}),manual({id:'cent',amount:-1251}),manual({id:'other',account:'other'})]);assert.equal(run.rows[0].candidates.length,2);assert.equal(run.rows[0].decision,null);assert.equal(run.rows[0].state,'review');
});
test('source cutoff excludes movements outside the confirmed period and pending stays unwritten',()=>{
 const run=previewImportRun(batch([{importId:'old',date:'2026-08-31',amount:100},{importId:'future',date:'2026-09-24',amount:100},{importId:'p',date:'2026-09-22',amount:100,status:'pending'}]));assert.deepEqual(run.rows.map(r=>r.state),['excluded','excluded','pending']);assert.throws(()=>normalizeImportBatch(batch([{importId:'bad',date:'2026-02-30',amount:1}])));
});
test('explicit match retains manual ID, split IDs, notes, categories, person and exact claim',async()=>{
 const m=manual({is_parent:true,category:null,subtransactions:[{id:'s1',parent_id:'m',amount:-1000,category:'food',notes:'Own',cleared:false},{id:'s2',parent_id:'m',amount:-250,category:'contactC',notes:'Her',cleared:false}]});
 const dimensions={s2:{person:'Kontakt C',reimbursementClaim:{amountEURcents:173,status:'open'},documentIds:['doc']}},before=structuredClone(dimensions),f=fixture([m],dimensions),run=decide(previewImportRun(batch(),[m]));
 const result=await applyImportRun({...f,run});assert.equal(result.status,'complete');assert.equal(f.rows[0].id,'m');assert.equal(f.rows[0].notes,m.notes);assert.deepEqual(f.rows[0].subtransactions.map(s=>[s.id,s.amount,s.category,s.notes]),m.subtransactions.map(s=>[s.id,s.amount,s.category,s.notes]));assert.deepEqual(dimensions,before);assert.equal(f.writes,1);
 const again=previewImportRun(batch(undefined,{batchId:'b2'}),f.rows,[result]);assert.equal(again.rows[0].state,'duplicate');await applyImportRun({...f,run:again});assert.equal(f.writes,1);
 const changed=previewImportRun(batch([{importId:'i1',date:'2026-09-22',amount:-1251,payee:'Market'}],{batchId:'b3'}),f.rows,[result]);assert.equal(changed.rows[0].state,'conflict');
});
test('same new import twice creates only one transaction',async()=>{
 const f=fixture([]);const done=await applyImportRun({...f,run:decide(previewImportRun(batch()),'add')});const again=previewImportRun(batch(),f.rows,[done]);await applyImportRun({...f,run:again});assert.equal(f.writes,1);assert.equal(f.rows.length,1);
});
test('same batch ID with changed payload rejects history overwrite',()=>{
 const r=previewImportRun(batch());assert.throws(()=>previewImportRun(batch([{importId:'i1',date:'2026-09-22',amount:-10}]),[],[r]),/Lauf-ID/);assert.throws(()=>upsertImportRun([r],{...r,signature:'different'}));
});
test('one manual entry cannot be selected for two imported entries',()=>{
 let r=previewImportRun(batch([{importId:'i1',date:'2026-09-22',amount:-1250},{importId:'i2',date:'2026-09-22',amount:-1250}]),[manual()]);r=decide(r);assert.throws(()=>decideImportRow(r,r.rows[1].key,{type:'match',transactionId:'m'}),/nur einmal/);
});
test('pending booking with changed cents cannot match a manual row',()=>{
 const pending=previewImportRun(batch([{importId:'i1',date:'2026-09-22',amount:-1250,status:'pending'}]),[manual()]);const posted=previewImportRun(batch([{importId:'i1',date:'2026-09-22',amount:-1251,status:'booked'}],{batchId:'b2'}),[manual()],[pending]);assert.equal(posted.rows[0].candidates.length,0);assert.throws(()=>decide(posted));
});
test('sync failure resumes metadata journal without repeating a ledger write',async()=>{
 const f=fixture([manual()]);f.failSync=true;await assert.rejects(applyImportRun({...f,run:decide(previewImportRun(batch(),f.rows))}),e=>e.run.rows[0].state==='ledger-confirmed');assert.equal(f.writes,1);f.failSync=false;const done=await applyImportRun({...f,run:f.saved});assert.equal(done.status,'complete');assert.equal(f.writes,1);
});
test('uncertain write without ledger proof cannot be blindly repeated',async()=>{
 const f=fixture([manual()]);f.api.updateTransaction=async()=>{throw Error('network');};await assert.rejects(applyImportRun({...f,run:decide(previewImportRun(batch(),f.rows))}));const saved=f.saved;assert.equal(saved.rows[0].state,'writing');let repeated=false;f.api.updateTransaction=async()=>{repeated=true;};await assert.rejects(applyImportRun({...f,run:saved}),{code:'IMPORT_WRITE_UNCONFIRMED'});assert.equal(repeated,false);
});
test('stale manual metadata prevents overwrite and native fuzzy match blocks add',async()=>{
 const m=manual(),r=decide(previewImportRun(batch(),[m])),f=fixture([{...m,notes:'Edited'}]);await assert.rejects(applyImportRun({...f,run:r}),{code:'IMPORT_STALE'});assert.equal(f.writes,0);
 const g=fixture([m]);g.api.importTransactions=async()=>({added:[],updated:['m'],errors:[]});await assert.rejects(applyImportRun({...g,run:decide(previewImportRun(batch(),[m]),'add')}),{code:'IMPORT_NATIVE_MATCH_CONFLICT'});assert.equal(g.writes,0);
});
test('local CSV/JSON intake uses explicit cents and safely renders source content',()=>{
 const context=batch();delete context.transactions;
 const parsed=parseImportFile('importId;date;amount;payee;notes\n1;2026-09-22;-1250;"Market;Vienna";"Own ""note"""','bank.csv',context);assert.equal(parsed.transactions[0].payee,'Market;Vienna');assert.equal(parsed.transactions[0].notes,'Own "note"');assert.equal(parsed.transactions[0].amount,-1250);
 assert.throws(()=>parseImportFile('importId,date,amount\n1,2026-09-22,-12.50','bad.csv',context),{code:'IMPORT_CENTS_REQUIRED'});
 const json=parseImportFile(JSON.stringify([{importId:'1',date:'2026-09-22',amount:-1,payee:'<script>alert(1)</script>'}]),'bank.json',context);const html=renderImportReview(previewImportRun(json));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
