import { ApiError } from '../api/http';
import type { BulkResult, BulkSkipReason } from './api';
import { pluralBookings } from './format';
import type { AccountRole, AccountRow, AccountType, BookingFlag, BookingStatus } from './types';

/** German (de-AT) names of the ledger vocabulary (glossary in PRODUCT.md). */

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Giro',
  cash: 'Bargeld',
  savings: 'Tagesgeld',
  credit_card: 'Kreditkarte',
  loan: 'Kredit',
  brokerage: 'Depot',
  crypto: 'Krypto',
  p2p: 'P2P',
  receivable: 'Forderung',
  other_asset: 'Sonstiges Vermögen',
  other_liability: 'Sonstige Verbindlichkeit',
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'vorgemerkt',
  confirmed: 'bestätigt',
  reconciled: 'geprüft',
};

export const FLAG_LABEL: Record<BookingFlag, string> = {
  red: 'Rot',
  orange: 'Orange',
  yellow: 'Gelb',
  green: 'Grün',
  blue: 'Blau',
  purple: 'Violett',
};

export interface AccountGroup {
  role: AccountRole;
  title: string;
  sub: string;
}

/** Groups of the overview in the order of the net-worth chain (Maßkette). */
export const ACCOUNT_GROUPS: ReadonlyArray<AccountGroup> = [
  { role: 'budget', title: 'Budget-Konten', sub: 'verteilbares Geld' },
  { role: 'reserve', title: 'Sparen', sub: 'Tagesgeld, Notgroschen' },
  { role: 'investment', title: 'Investment', sub: 'Depot, Krypto, P2P' },
  { role: 'debt', title: 'Schulden', sub: 'Kredite' },
  { role: 'receivable', title: 'Forderungen', sub: 'Kontakte' },
];

export const groupOf = (role: AccountRole): AccountGroup =>
  ACCOUNT_GROUPS.find((g) => g.role === role) ?? (ACCOUNT_GROUPS[0] as AccountGroup);

/** Historical detail-page value; it remains native cash plus holdings until FX detail work. */
export const accountValue = (account: AccountRow): number | null =>
  account.holdingsCents === null ? null : account.balanceCents + account.holdingsCents;

/** The overview's shared EUR valuation; never reinterpret a missing rate as zero. */
export const accountValueEur = (account: AccountRow): number | null => account.valueEurCents;

/** Explain unavailable EUR values without confusing a security quote with a currency rate. */
export function valuationMissingText(value: {
  missingFxCurrencies: string[];
  missingPriceSecurityIds: string[];
}): string {
  const reasons: string[] = [];
  if (value.missingPriceSecurityIds?.length) reasons.push('Wertpapierkurs fehlt');
  if (value.missingFxCurrencies.length)
    reasons.push(`Wechselkurs fehlt: ${value.missingFxCurrencies.join(', ')}`);
  return reasons.join(' · ') || 'Bewertung nicht verfügbar';
}

/** Accounts on which Kontostand prüfen makes sense: the bank statement has a closing balance. */
export const canReconcile = (account: AccountRow): boolean => account.onBudget && !account.closedAt;

/** Error text for the user; the server's German message is shown when it sent one. */
export function errorText(
  error: unknown,
  fallback = 'Das hat nicht geklappt. Versuch es noch einmal.',
) {
  if (error instanceof Error && 'detail' in error && typeof error.detail === 'string') {
    return error.detail;
  }
  if (error instanceof Error && 'status' in error && error.status === 0) {
    return 'Keine Verbindung zum Server.';
  }
  return fallback;
}

const SKIP_REASON_LABEL: Record<BulkSkipReason, string> = {
  split: 'Aufteilung',
  transfer: 'Umbuchung',
  transfer_pair: 'Umbuchung (beide Seiten)',
  reconciled_locked: 'geprüft',
  not_found: 'nicht mehr vorhanden',
  invalid: 'nicht möglich',
};

const transfers = (n: number) => `${n} ${n === 1 ? 'Umbuchung' : 'Umbuchungen'}`;

/**
 * Toast text of a bulk action: what changed and why the rest was skipped. Both legs of a transfer
 * in the selection are named as one Umbuchung ("beide Seiten"), not as a skipped booking.
 */
export function bulkSummary(result: BulkResult, verb: 'gelöscht' | 'geändert'): string {
  const skippedPairs = Math.floor(
    result.skipped.filter((s) => s.reason === 'transfer_pair').length / 2,
  );
  const changedPairs = Math.max(0, result.transferPairs - skippedPairs);
  let text = `${pluralBookings(result.changed.length)} ${verb}`;
  text += changedPairs > 0 ? `, davon ${transfers(changedPairs)} (beide Seiten).` : '.';
  if (result.skipped.length > 0) {
    const reasons = [...new Set(result.skipped.map((s) => SKIP_REASON_LABEL[s.reason]))];
    text += ` ${result.skipped.length} übersprungen: ${reasons.join(', ')}.`;
  }
  return text;
}

/** Toast text when "Wiederholen" is refused, e.g. because the booking was changed meanwhile. */
export const redoFailedText = (error: unknown): string =>
  error instanceof ApiError && error.code === 'undo_refused'
    ? 'Wiederholen nicht möglich: Die Buchung wurde inzwischen geändert.'
    : `Wiederholen nicht möglich. ${errorText(error, '')}`.trim();
