import { getPayslipSourceConfig, type Db } from '@budget/db';
import { digest } from '../receipts/files';
import { rememberedPayslipPassword } from '../payslips/password';
import { recognizeDocument, type DocumentClassification } from './recognize-document';
import { tradeConfirmationIntake } from './trade-confirmation';

export async function classifyDocument(
  db: Db,
  bytes: Buffer,
  filename: string,
  password?: string,
): Promise<DocumentClassification> {
  const { classification, text } = await recognizeDocument(bytes, filename, {
    passwords: () =>
      [password, rememberedPayslipPassword(db), process.env['PAYSLIP_PDF_PASSWORD']].filter(
        (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
      ),
    payrollConfig: () => getPayslipSourceConfig(db),
  });
  if (classification.type === 'trade_confirmation' && text !== undefined)
    classification.trade = tradeConfirmationIntake(db, text, digest(bytes));
  return classification;
}
