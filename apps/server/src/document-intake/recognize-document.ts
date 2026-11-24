import {
  acceptsTradeConfirmation,
  defaultPayslipAdapters,
  isPayrollNotice,
  parseCardDocument,
  parsePayrollDocument,
  parseStatementText,
  extractReceiptProposal,
  type ReceiptProposal,
  type PayslipSourceConfig,
  type TradeConfirmationIntake,
} from '@budget/domain';
import { digest, receiptMime } from '../receipts/files';
import { extractPdfText } from '../payslips/pdf-text';

export type DocumentType =
  | 'card_statement'
  | 'bank_statement'
  | 'payslip'
  | 'bonus'
  | 'pension'
  | 'trade_confirmation'
  | 'receipt'
  | 'unreadable';
export type DocumentClassification = {
  type: DocumentType;
  confidence: 'certain' | 'probable' | 'unknown';
  /** Non-sensitive facts only: no amounts, names, references or passwords. */
  hints: { period?: string; accountHint?: string; mime: string };
  needsPassword: boolean;
  /** Editable proposal read from a receipt PDF's text layer; present only if something was found. */
  receipt?: ReceiptProposal;
  /** Broker trade confirmations only: the trade form proposal and its duplicate state. */
  trade?: TradeConfirmationIntake;
};

/** The central detector and local checker share the same PDF and classification path. */
export async function recognizeDocument(
  bytes: Buffer,
  filename: string,
  options: {
    passwords?: () => string[];
    payrollConfig: () => PayslipSourceConfig;
  },
): Promise<{ classification: DocumentClassification; text?: string }> {
  const mime = receiptMime(bytes);
  const hints = { mime };
  if (mime !== 'application/pdf')
    return {
      classification: { type: 'receipt', confidence: 'probable', hints, needsPassword: false },
    };

  const passwords = options.passwords?.() ?? [];
  let result: Awaited<ReturnType<typeof extractPdfText>> = {};
  for (const password of passwords.length ? passwords : [undefined]) {
    result = await extractPdfText(bytes, password);
    if (result.text !== undefined || result.error !== 'password') break;
  }
  const text = result.text;
  if (result.error || text === undefined || !text.trim() || text.length > 200000)
    return {
      classification: {
        type: 'unreadable',
        confidence: 'unknown',
        hints,
        needsPassword: result.error === 'password',
      },
    };
  return {
    classification: classifyText(text, filename, digest(bytes), mime, options.payrollConfig),
    text,
  };
}

function classifyText(
  text: string,
  filename: string,
  sha: string,
  mime: string,
  payrollConfig: () => PayslipSourceConfig,
): DocumentClassification {
  const hints: DocumentClassification['hints'] = { mime };
  if (acceptsTradeConfirmation(text))
    return {
      type: 'trade_confirmation',
      confidence: 'certain',
      hints,
      needsPassword: false,
    };
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
      const parsed = parsePayrollDocument(text, filename, payrollConfig());
      if (isPayrollNotice(parsed))
        return {
          type: parsed.documentType as 'bonus' | 'pension',
          confidence: 'certain',
          hints: { mime },
          needsPassword: false,
        };
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
  const proposal = extractReceiptProposal(text);
  const hasProposal = [proposal.totalCents, proposal.date, proposal.payee].some((v) => v !== null);
  return {
    type: 'receipt',
    confidence: 'unknown',
    hints: { mime },
    needsPassword: false,
    ...(hasProposal ? { receipt: proposal } : {}),
  };
}
