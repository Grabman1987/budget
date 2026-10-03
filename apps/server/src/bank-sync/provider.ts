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
  balance(
    uid: string,
    beforeRequest?: () => void,
  ): Promise<{ amountCents: number; currency: string; date: string | null }>;
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
      | 'consent_expired'
      | 'auth_failed'
      | 'history_unavailable'
      | 'request_limit',
    readonly retrySeconds = 900,
  ) {
    super(code);
    this.name = 'BankError';
  }
}
