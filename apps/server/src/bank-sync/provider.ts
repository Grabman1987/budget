import type { BankTransaction } from '@budget/domain';

export interface BankInstitution {
  name: string;
  country: string;
  maximumConsentSeconds: number;
}
export interface BankSession {
  id: string;
  validUntil: string;
  accounts: { uid: string; label: string; currency: string }[];
}
export interface BankProvider {
  institutions(): Promise<BankInstitution[]>;
  authorize(institution: BankInstitution, state: string, redirect: string): Promise<string>;
  session(code: string): Promise<BankSession>;
  transactions(
    uid: string,
    from: string,
    to: string,
    beforeRequest?: () => void,
  ): Promise<BankBatch>;
  /**
   * With `currency` (multi-currency accounts) only a balance in that currency counts and `null`
   * means the bank reports none; without it a missing balance is an invalid response.
   */
  balance(
    uid: string,
    beforeRequest?: () => void,
    currency?: string,
  ): Promise<{ amountCents: number; currency: string; date: string | null } | null>;
}
export interface BankBatch {
  rows: BankTransaction[];
  skippedInvalid: number;
  skippedOutOfWindow: number;
}
export class BankError extends Error {
  constructor(
    readonly code:
      | 'not_configured'
      | 'unavailable'
      | 'rate_limited'
      | 'invalid_response'
      | 'invalid_validity'
      | 'consent_expired'
      | 'auth_failed'
      | 'history_unavailable'
      | 'request_limit',
    readonly retrySeconds = 900,
    /** Zod issue code@field path only (e.g. `too_small@accounts.0.name`); never provider values. */
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'BankError';
  }
}
