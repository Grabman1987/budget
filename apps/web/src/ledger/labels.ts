import { maskMoneyText } from '@budget/ui';
import { apiErrorText } from '../api/error-text';
import { ApiError } from '../api/http';
import type { BulkResult, BulkSkipReason } from './api';
import { pluralBookings } from './format';
import type { AccountRow, AccountType, BookingFlag, BookingStatus } from './types';

/** German (de-AT) names of the ledger vocabulary (glossary in PRODUCT.md). */
export const CAPTURE_SHORTCUT_HINT =
  'Enter weiter · Strg Enter speichert · Strg Umschalt Enter speichert und beginnt neu · Esc schließt';

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

export type AccountGroupId = 'budget' | 'cards' | 'loans' | 'investments';

/** Key that picks a flag in the flag popover (1 to 6; 0 removes the flag). */
export const FLAG_KEY: Record<BookingFlag, string> = {
  red: '1',
  orange: '2',
  yellow: '3',
  green: '4',
  blue: '5',
  purple: '6',
};

export interface AccountGroup {
  id: AccountGroupId;
  title: string;
  sub: string;
}

/**
 * Account groups in YNAB's order: Budget-Konten, Kreditkarten, Kredite, then the tracking side
 * (Investments). Sidebar tree, Konten › Übersicht, its Maßkette and the account selects all use
 * this one list.
 */
export const ACCOUNT_GROUPS: ReadonlyArray<AccountGroup> = [
  { id: 'budget', title: 'Budget-Konten', sub: 'Giro, Bargeld, Tagesgeld' },
  { id: 'cards', title: 'Kreditkarten', sub: 'Kartensalden' },
  { id: 'loans', title: 'Kredite', sub: 'Darlehen' },
  { id: 'investments', title: 'Investments', sub: 'Depot, Krypto, P2P, Sonstiges' },
];

/**
 * Group of an account by its type, not its role: a credit card has the role "budget" but belongs
 * to Kreditkarten. Cash and savings outside the budget count as Investments (tracking only).
 */
export function groupIdOf(account: Pick<AccountRow, 'type' | 'onBudget'>): AccountGroupId {
  switch (account.type) {
    case 'credit_card':
      return 'cards';
    case 'loan':
    case 'other_liability':
      return 'loans';
    case 'checking':
    case 'cash':
    case 'savings':
      return account.onBudget ? 'budget' : 'investments';
    default:
      return 'investments';
  }
}

export const groupOf = (account: Pick<AccountRow, 'type' | 'onBudget'>): AccountGroup =>
  ACCOUNT_GROUPS.find((g) => g.id === groupIdOf(account)) ?? (ACCOUNT_GROUPS[0] as AccountGroup);

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
export const canReconcile = (account: AccountRow): boolean =>
  !account.closedAt && (account.onBudget || account.currency !== 'EUR');

/** Error text for the user; the server's German message is shown when it sent one. */
export function errorText(
  error: unknown,
  fallback = 'Das hat nicht geklappt. Versuch es noch einmal.',
) {
  if (error instanceof Error && ('detail' in error || 'status' in error || 'code' in error)) {
    const like = error as { detail?: unknown; status?: unknown; code?: unknown };
    // Never the raw server text of a generic or technical answer: German text by code instead.
    const text = apiErrorText({
      ...(typeof like.detail === 'string' ? { detail: like.detail } : {}),
      ...(typeof like.status === 'number' ? { status: like.status } : {}),
      ...(typeof like.code === 'string' ? { code: like.code } : {}),
    });
    if (text) return maskMoneyText(text);
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
