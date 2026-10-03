import { defineConfig } from '@playwright/test';
import isolatedConfig from './bank-followups.config';

/** FX cases bootstrap their own fixed-clock server; no shared sample ledger is needed. */
export default defineConfig({ ...isolatedConfig, testMatch: /fx-detail\.spec\.ts/ });
