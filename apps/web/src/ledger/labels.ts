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

/** What the account is worth for net worth: cash balance plus the market value of its securities. */
export const accountValue = (account: AccountRow): number =>
  account.balanceCents + account.holdingsCents;

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
