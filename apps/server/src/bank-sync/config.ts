import type { Db } from '@budget/db';
import { bankProviderFromEnv } from './enable-banking';
import { bankSecretBox } from './secrets';
import { BankSync } from './service';

export function bankSyncFromEnv(db: Db): BankSync | null {
  const provider = bankProviderFromEnv();
  if (!provider) return null;
  const origin = new URL(process.env['BUDGET_ORIGIN'] ?? '');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))
    throw new Error('Bank sync requires an HTTPS origin');
  return new BankSync(
    db,
    provider,
    bankSecretBox(process.env['BANK_SYNC_ENCRYPTION_KEY'] ?? ''),
    origin.origin,
  );
}
