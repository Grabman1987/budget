import { hkdfSync } from 'node:crypto';
import {
  clearPayslipPassword,
  readPayslipPasswordCiphertext,
  storePayslipPasswordCiphertext,
  type Db,
} from '@budget/db';
import { bankSecretBox } from '../bank-sync/secrets';

const INFO = 'payslip-pdf-password-v1';
const CONTEXT = 'payslip-pdf-password';
const MIN_PEPPER = 32;

/** Sealing needs the existing BUDGET_PEPPER; without it remembering is disabled. */
export function payslipPasswordBox(env: NodeJS.ProcessEnv = process.env) {
  const pepper = env['BUDGET_PEPPER']?.trim();
  if (!pepper || pepper.length < MIN_PEPPER) return undefined;
  const key = Buffer.from(
    hkdfSync('sha256', Buffer.from(pepper, 'utf8'), Buffer.alloc(0), INFO, 32),
  );
  return bankSecretBox(key.toString('hex'));
}
export type PasswordSource = 'app' | 'server' | null;
/** Remembered (app) password, if it can be opened with the current key. */
export function rememberedPayslipPassword(db: Db, env: NodeJS.ProcessEnv = process.env) {
  const sealed = readPayslipPasswordCiphertext(db),
    box = payslipPasswordBox(env);
  if (!sealed || !box) return undefined;
  try {
    return box.open(sealed, CONTEXT);
  } catch {
    return undefined; // key changed or data damaged: behave as if none were stored
  }
}
export function rememberPayslipPassword(
  db: Db,
  password: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const box = payslipPasswordBox(env);
  if (!box) return false;
  storePayslipPasswordCiphertext(db, box.seal(password, CONTEXT), { actor: 'owner' });
  return true;
}
export const forgetPayslipPassword = (db: Db) => clearPayslipPassword(db, { actor: 'owner' });
/** `app` when a sealed password is stored (even if unreadable), else `server` for the env secret. */
export function payslipPasswordSource(
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): PasswordSource {
  if (readPayslipPasswordCiphertext(db)) return 'app';
  return env['PAYSLIP_PDF_PASSWORD'] ? 'server' : null;
}
