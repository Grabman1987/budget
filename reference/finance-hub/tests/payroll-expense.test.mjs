import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollReceiptCandidates,payrollReceiptStatus,payrollSummary,reviewPayrollRecord,savePayrollRecord} from '../payroll-model.mjs';
import {allocateExpenseRepayment,expenseClaimsSummary,expenseRepaymentCandidates,reverseExpenseRepayment} from '../expense-claims.mjs';
import {addDocument,proposeDocumentMatches,proposeTextExtraction} from '../document-model.mjs';
import {renderDocumentsWorkspace} from '../src/documents-workspace.js';
import {renderPayrollPanel} from '../src/payroll-panel.js';

const rows=[
  {id:'salary-parent',account:'bank',date:'2026-09-23',amount:320000,is_parent:true,subtransactions:[{id:'salary-net',amount:300000,category:'salary'},{id:'salary-reimbursement',amount:20000,category:'reimbursement'}],payee:'employer'},
  {id:'expense1',account:'bank',date:'2026-09-01',amount:-10000,category:'travel'},
  {id:'expense2',account:'bank',date:'2026-09-03',amount:-8000,category:'travel'},
  {id:'repayment',account:'bank',date:'2026-09-24',amount:12000,category:'reimbursement',payee:'employer'},
];
const live={accounts:[{id:'bank',name:'Bank',offbudget:false}],rawTransactions:rows,payees:[{id:'employer',name:'Synthetic GmbH'}]};
const baseWorkspace=()=>({settings:{transactionDimensions:{expense1:{person:'user',expenseClaim:{status:'submitted',note:'Train'}},expense2:{person:'user',expenseClaim:{status:'reimbursed',note:'Hotel'}}}}});
const saver=()=>{let workspace;return {get workspace(){return workspace;},saveWorkspace:async next=>{workspace=structuredClone(next);}};};

test('payroll record is reviewed only with explicit cents and matching Actual income leaves',async()=>{
  let workspace=baseWorkspace();
  const saved=savePayrollRecord(workspace,{period:'2026-09',employer:'Synthetic GmbH',grossEURcents:500000,netEURcents:320000,regularNetEURcents:300000,specialNetEURcents:0,taxEURcents:110000,employeeDeductionsEURcents:70000,reimbursementsEURcents:20000,actualTransactionIds:['salary-net','salary-reimbursement']});
  workspace=saved.workspace;
  assert.equal(payrollReceiptStatus(saved.record,live).matched,true);
  const candidates=payrollReceiptCandidates(saved.record,live);
  assert.ok(candidates.some(row=>row.id==='salary-net'));
  const ctx=saver();
  const reviewed=await reviewPayrollRecord({workspace,saveWorkspace:ctx.saveWorkspace,id:saved.record.id,live});
  assert.equal(reviewed.record.status,'reviewed');assert.equal(reviewed.record.receiptMatched,true);
  assert.equal(ctx.workspace.settings.payrollRecords[0].reviewedBy,'Nutzer');
  const summary=payrollSummary(ctx.workspace,live,2026);
  assert.equal(summary.rows.find(row=>row.month==='2026-09').netEURcents,320000);
  assert.equal(summary.rows.find(row=>row.month==='2026-08').netEURcents,null);
  assert.equal(summary.complete,false);
  assert.equal(summary.knownTotals.netEURcents,320000);
  assert.equal(ctx.workspace.settings.salary,undefined); // No forecast salary or Actual write.
});

test('payroll mismatch is visible and requires a documented reason; same Actual leaf cannot back two reviewed records',async()=>{
  let workspace=savePayrollRecord(baseWorkspace(),{period:'2026-09',employer:'Synthetic GmbH',grossEURcents:500000,netEURcents:310000,regularNetEURcents:310000,specialNetEURcents:0,taxEURcents:110000,employeeDeductionsEURcents:70000,reimbursementsEURcents:0,actualTransactionIds:['salary-net']}).workspace;
  const id=workspace.settings.payrollRecords[0].id,ctx=saver();
  await assert.rejects(reviewPayrollRecord({workspace,saveWorkspace:ctx.saveWorkspace,id,live}),/Grund dokumentieren/);
  assert.equal(ctx.workspace,undefined);
  await reviewPayrollRecord({workspace,saveWorkspace:ctx.saveWorkspace,id,live,mismatchReason:'Bank split needs manual correction'});
  assert.equal(ctx.workspace.settings.payrollRecords[0].receiptMatched,false);
  workspace=savePayrollRecord(ctx.workspace,{period:'2026-10',employer:'Synthetic GmbH',grossEURcents:500000,netEURcents:300000,regularNetEURcents:300000,specialNetEURcents:0,taxEURcents:110000,employeeDeductionsEURcents:70000,reimbursementsEURcents:0,actualTransactionIds:['salary-net']}).workspace;
  const second=workspace.settings.payrollRecords.at(-1);
  await assert.rejects(reviewPayrollRecord({workspace,saveWorkspace:ctx.saveWorkspace,id:second.id,live}),/bereits mit einem geprüften/);
});

test('expense outstanding falls only with explicit capped partial repayment allocations',async()=>{
  let workspace=baseWorkspace();const ctx=saver();
  assert.equal(expenseClaimsSummary(live,workspace).outstandingEURcents,18000); // "reimbursed" label alone is not proof.
  const candidates=expenseRepaymentCandidates(live,workspace,'expense1');
  assert.ok(candidates.some(item=>item.id==='repayment'));
  const first=await allocateExpenseRepayment({workspace,saveWorkspace:ctx.saveWorkspace,live,claimLeafId:'expense1',receiptLeafId:'repayment',amountEURcents:7000});workspace=ctx.workspace;
  assert.equal(expenseClaimsSummary(live,workspace).outstandingEURcents,11000);
  await assert.rejects(allocateExpenseRepayment({workspace,saveWorkspace:ctx.saveWorkspace,live,claimLeafId:'expense2',receiptLeafId:'repayment',amountEURcents:6000}),/bereits ganz oder teilweise/);
  await allocateExpenseRepayment({workspace,saveWorkspace:ctx.saveWorkspace,live,claimLeafId:'expense2',receiptLeafId:'repayment',amountEURcents:5000});workspace=ctx.workspace;
  assert.equal(expenseClaimsSummary(live,workspace).outstandingEURcents,6000);
  await assert.rejects(allocateExpenseRepayment({workspace,saveWorkspace:ctx.saveWorkspace,live,claimLeafId:'expense1',receiptLeafId:'salary-net',amountEURcents:5000}),/überschreitet die Ausgabe/);
  await reverseExpenseRepayment({workspace,saveWorkspace:ctx.saveWorkspace,allocationId:first.id,reason:'Falscher Beleg'});
  assert.equal(expenseClaimsSummary(live,ctx.workspace).outstandingEURcents,13000);
});

test('changed Actual amounts invalidate a repayment allocation until explicitly repaired',async()=>{
  const changedLive=structuredClone(live),ctx=saver();
  await allocateExpenseRepayment({workspace:baseWorkspace(),saveWorkspace:ctx.saveWorkspace,live:changedLive,claimLeafId:'expense1',receiptLeafId:'repayment',amountEURcents:7000});
  changedLive.rawTransactions.find(row=>row.id==='repayment').amount=11000;
  const summary=expenseClaimsSummary(changedLive,ctx.workspace);
  assert.equal(summary.conflicts.length,1);
  assert.equal(summary.outstandingEURcents,18000);
  await assert.rejects(allocateExpenseRepayment({workspace:ctx.workspace,saveWorkspace:ctx.saveWorkspace,live:changedLive,claimLeafId:'expense2',receiptLeafId:'repayment',amountEURcents:1000}),/Actual-Betrag wurde/);
});

test('TXT and CSV produce labelled suggestions and document matching never writes a link automatically',async()=>{
  const ctx=saver(),workspace=baseWorkspace();
  const textFile=Object.assign(new Blob(['Datum: 2026-09-01\nBetrag: 100,00\nHändler: Synthetic GmbH'],{type:'text/plain'}),{name:'receipt.txt'});
  const upload=await addDocument({file:textFile,workspace,saveWorkspace:ctx.saveWorkspace});
  const proposal=proposeTextExtraction(ctx.workspace,upload.id);
  assert.equal(proposal.status,'proposal');assert.equal(proposal.fields.amountEURcents,10000);assert.equal(proposal.confidence.amountEURcents,'medium');
  const matches=proposeDocumentMatches(ctx.workspace,upload.id,live);
  assert.ok(matches.some(row=>row.id==='expense1'));
  assert.deepEqual(ctx.workspace.settings.documents[0].transactionIds,[]);
  const csvFile=Object.assign(new Blob(['date;merchant;amount\n2026-09-03;Hotel;80,00'],{type:'text/csv'}),{name:'receipt.csv'});
  const second=await addDocument({file:csvFile,workspace:ctx.workspace,saveWorkspace:ctx.saveWorkspace});
  assert.equal(proposeTextExtraction(ctx.workspace,second.id).fields.amountEURcents,8000);
  const html=renderDocumentsWorkspace({live,workspace:ctx.workspace});
  assert.match(html,/Mögliche passende Buchungen/);
  assert.match(html,/Gehalt im Jahresvergleich/);
});

test('payroll comparison shows prior and current month side by side without a false delta for missing coverage',()=>{
  const year=new Date().getFullYear(),period=month=>`${year}${month}`,record=(date,net)=>({id:date,period:date,status:'reviewed',grossEURcents:net*2,netEURcents:net,specialNetEURcents:0,taxEURcents:0,reimbursementsEURcents:0,actualTransactionIds:[]});
  const workspace={settings:{payrollRecords:[record(`${year-1}-01`,10000),record(`${year}-01`,12000),record(`${year}-02`,15000)]}};
  const html=renderPayrollPanel({workspace,live},null);
  assert.match(html,new RegExp(`Monate im Vorjahr vergleichen · ${year-1} / ${year}`));
  assert.match(html,/€\s*20,00/);
  assert.match(html,/Teilbestand/);
  assert.match(html,/Eine Differenz erscheint nur, wenn beide Monate belegt sind/);
});
