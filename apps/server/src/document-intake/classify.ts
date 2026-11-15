import { getPayslipSourceConfig, type Db } from '@budget/db';
import {
  defaultPayslipAdapters,
  parseCardDocument,
  parsePayrollDocument,
  parseStatementText,
} from '@budget/domain';
import { digest, receiptMime } from '../receipts/files';
import { extractPayslipText } from '../payslips/service';
import { rememberedPayslipPassword } from '../payslips/password';

export type DocumentType =
  'card_statement' | 'bank_statement' | 'payslip' | 'receipt' | 'unreadable';
export type DocumentClassification = {
  type: DocumentType;
  confidence: 'certain' | 'probable' | 'unknown';
  /** Non-sensitive facts only: no amounts, names, references or passwords. */
  hints: { period?: string; accountHint?: string; mime: string };
  needsPassword: boolean;
};

/**
 * Read-only "does this look like X" pass over the existing deterministic parsers. It stores
 * nothing, books nothing and never calls a network service. Order: finite card layouts, payroll
 * adapters, generic statement labels; everything else is a plain receipt.
 */
export async function classifyDocument(
  db: Db,
  bytes: Buffer,
  filename: string,
  password?: string,
): Promise<DocumentClassification> {
  const mime = receiptMime(bytes); // throws RangeError for unsupported types
  if (mime !== 'application/pdf')
    return { type: 'receipt', confidence: 'probable', hints: { mime }, needsPassword: false };
  const candidates = [
    password,
    rememberedPayslipPassword(db),
    process.env['PAYSLIP_PDF_PASSWORD'],
  ].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i);
  let result: { text?: string; error?: string } = { error: 'pdf' };
  for (const candidate of candidates.length ? candidates : [undefined]) {
    result = await extractPayslipText(bytes, candidate);
    if (result.text !== undefined || result.error !== 'password') break;
  }
  const hints: DocumentClassification['hints'] = { mime };
  if (result.error === 'password')
    return { type: 'unreadable', confidence: 'unknown', hints, needsPassword: true };
  const text = result.text;
  if (result.error || text === undefined || !text.trim() || text.length > 200000)
    return { type: 'unreadable', confidence: 'unknown', hints, needsPassword: false };
  const sha = digest(bytes);
  const card = parseCardDocument(text, sha, {
    accountId: 'classify',
    currency: 'EUR',
    mappingKey: 'classify',
    mappedCardAccounts: {},
  });
  const summary = card.summary.fields;
  if (summary.accountHint.value) hints.accountHint = summary.accountHint.value;
  if (summary.periodFrom.value && summary.periodTo.value)
    hints.period = `${summary.periodFrom.value}/${summary.periodTo.value}`;
  if (card.layout)
    return { type: 'card_statement', confidence: 'certain', hints, needsPassword: false };
  if (defaultPayslipAdapters.some((a) => a.accepts(text))) {
    let certain = false;
    try {
      const parsed = parsePayrollDocument(text, filename, getPayslipSourceConfig(db));
      certain = parsed.documentType !== 'unknown';
      if (parsed.draft?.month) hints.period = parsed.draft.month;
    } catch {
      // An unsupported value keeps the document a probable payslip; the payslip flow explains it.
    }
    delete hints.accountHint;
    return {
      type: 'payslip',
      confidence: certain ? 'certain' : 'probable',
      hints,
      needsPassword: false,
    };
  }
  const found = parseStatementText(text, sha).fields;
  const printed = [
    found.reference.candidates.length,
    found.issueDate.candidates.length,
    found.periodFrom.candidates.length,
    found.payableCents.candidates.length,
    found.debitDate.candidates.length,
  ].filter(Boolean).length;
  if (printed >= 2) {
    const cardLike =
      Boolean(summary.accountHint.value) || /kreditkarte|kartenabrechnung/i.test(text);
    return {
      type: cardLike ? 'card_statement' : 'bank_statement',
      confidence: printed >= 3 ? 'probable' : 'unknown',
      hints,
      needsPassword: false,
    };
  }
  return { type: 'receipt', confidence: 'unknown', hints: { mime }, needsPassword: false };
}
