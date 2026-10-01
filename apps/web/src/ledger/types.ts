/** Shapes of the ledger API (`docs/api-ledger.md`); amounts are integer cents, days `YYYY-MM-DD`. */

export const ACCOUNT_ROLES = ['budget', 'reserve', 'investment', 'debt', 'receivable'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ACCOUNT_TYPES = [
  'checking',
  'cash',
  'savings',
  'credit_card',
  'loan',
  'brokerage',
  'crypto',
  'p2p',
  'receivable',
  'other_asset',
  'other_liability',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'reconciled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_FLAGS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type BookingFlag = (typeof BOOKING_FLAGS)[number];

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  onBudget: boolean;
  currency: string;
  institutionId: string | null;
  openingBalanceCents: number;
  openingDate: string;
  creditLimitCents: number | null;
  overdraftLimitCents: number | null;
  interestRateBp: number | null;
  termEnd: string | null;
  monthlyFeeCents: number | null;
  sortOrder: number;
  closedAt: string | null;
  note: string | null;
  balanceCents: number;
  clearedCents: number;
  unclearedCents: number;
  scheduledCents: number;
  /** Market value of securities held in the account (depots, crypto). */
  holdingsCents: number | null;
  /** Entire account value in EUR, or null when FX needed by cash or holdings is missing. */
  valueEurCents: number | null;
  /** FX currencies that prevented this account's EUR valuation. */
  missingFxCurrencies: string[];
  bookingCount: number;
  pendingCount: number;
  lastReconciledOn: string | null;
}

export interface AccountList {
  asOf: string;
  accounts: AccountRow[];
  netWorthEurCents: number | null;
  missingFxCurrencies: string[];
}

export interface SeriesPoint {
  date: string;
  balanceCents: number;
}

export interface ListedSplit {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  memo: string | null;
  contactId: string | null;
  incomeTypeId: string | null;
  transferId: string | null;
}

export interface ListedBooking {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amountCents: number;
  payeeId: string | null;
  payeeName: string | null;
  memo: string | null;
  status: BookingStatus;
  flag: BookingFlag | null;
  transferId: string | null;
  transferAccountId: string | null;
  transferAccountName: string | null;
  projectId: string | null;
  currency: string;
  originalAmountCents: number | null;
  originalCurrency: string | null;
  splits: ListedSplit[];
  balanceAfterCents: number | null;
}

export interface BookingPage {
  items: ListedBooking[];
  nextCursor: string | null;
  total: number;
  sumCents: number;
}

export type BookingSort = 'date' | 'amount' | 'payee' | 'account';

/** Filter of the booking list; the same fields are the URL parameters of Alle Buchungen. */
export interface BookingFilter {
  accountId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  categoryId?: string | undefined;
  payeeId?: string | undefined;
  status?: BookingStatus | undefined;
  flag?: BookingFlag | 'none' | undefined;
  q?: string | undefined;
  sort?: BookingSort | undefined;
  direction?: 'asc' | 'desc' | undefined;
}

export interface Category {
  id: string;
  name: string;
  groupId: string | null;
  class: string | null;
  kind: string;
  sortOrder: number;
}

export interface Lookups {
  groups: { id: string; name: string; sortOrder: number }[];
  categories: Category[];
  projects: { id: string; name: string }[];
  incomeTypes: { id: string; name: string }[];
  contacts: { id: string; name: string }[];
  institutions: { id: string; name: string; kind: string }[];
}

export interface PayeeRow {
  id: string;
  name: string;
  /** Category capture pre-fills for this payee. */
  defaultCategoryId?: string | null;
  systemKind?: string | null;
  bookingCount?: number;
  lastBookingDate?: string | null;
}

export interface WriteResult {
  groupId: string;
}

export interface DuplicateCandidate {
  removeId: string;
  keepId: string;
  date: string;
  payeeName: string | null;
  amountCents: number;
  /** Removing it makes the balances agree. */
  explainsDifference: boolean;
}

export interface ReconciliationPreview {
  accountId: string;
  date: string;
  statementBalanceCents: number;
  bookedBalanceCents: number;
  pendingCents: number;
  /** `statement − booked`; negative means the app is too high. */
  differenceCents: number;
  toReconcileCount: number;
  duplicates: DuplicateCandidate[];
  pendingMatches: { bookingIds: string[]; sumCents: number }[];
  missing: { kind: 'expense' | 'income'; amountCents: number } | null;
}

export interface ReconcileResult {
  reconciliationId: string;
  groupId: string;
  differenceCents: number;
  adjustmentBookingId: string | null;
  reconciledCount: number;
}
