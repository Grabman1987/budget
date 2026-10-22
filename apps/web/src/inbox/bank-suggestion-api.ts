import type { BankInboxAcceptance, BankInboxRef } from '@budget/db';
import { request } from '../api/http';

export const acceptSafeBankSuggestions = (rows: BankInboxAcceptance[], expectedChanged: number) =>
  request<{ groupId: string; changedCount: number; skippedCount: number; accepted: string[] }>(
    'POST', '/api/bank-sync/inbox/accept-safe', { rows, expectedChanged },
  );

export const readBankReviewRound = (rows: BankInboxRef[]) =>
  request<{ states: Record<string, 'open' | 'closed' | 'unknown'> }>(
    'GET', `/api/bank-sync/inbox/review-round?rows=${encodeURIComponent(JSON.stringify(rows))}`,
  );
