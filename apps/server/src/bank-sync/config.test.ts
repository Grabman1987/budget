import { generateKeyPairSync } from 'node:crypto';
import { createTestDatabase } from '@budget/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../api';

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('bank configuration failure isolation', () => {
  it.each([
    { key: 'malformed', encryption: 'ab'.repeat(32), origin: 'https://budget.example' },
    { key: privateKey, encryption: 'malformed', origin: 'https://budget.example' },
    { key: privateKey, encryption: 'ab'.repeat(32), origin: undefined },
  ])(
    'keeps the ledger API available with invalid bank configuration',
    async ({ key, encryption, origin }) => {
      vi.stubEnv('ENABLE_BANKING_APP_ID', 'synthetic-app');
      vi.stubEnv('ENABLE_BANKING_PRIVATE_KEY', key);
      vi.stubEnv('BANK_SYNC_ENCRYPTION_KEY', encryption);
      vi.stubEnv('BUDGET_ORIGIN', origin);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const network = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('No network allowed'));
      const opened = createTestDatabase();
      try {
        const api = createLedgerApi({ db: opened.db, stepUp: async (_c, next) => next() });
        expect(await (await api.request('/bank-sync')).json()).toMatchObject({ configured: false });
        expect(await (await api.request('/bank-sync/institutions')).json()).toEqual({
          error: 'not_configured',
        });
        expect((await api.request('/accounts')).status).toBe(200);
        expect(log).toHaveBeenCalledWith(
          'Bank sync: not_configured; check origin, signing key and encryption configuration.',
        );
        expect(network).not.toHaveBeenCalled();
      } finally {
        opened.close();
      }
    },
  );
});
