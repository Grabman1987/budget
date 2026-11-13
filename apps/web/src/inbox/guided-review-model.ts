import type { InboxEntry } from './api';

/** `?modus=gefuehrt` on /konten/pruefen opens the guided pass through the open Umsätze. */
export const GUIDED_MODE = 'gefuehrt';
const STORAGE_KEY = 'budget.pruefen.gefuehrt';

/** Short reasons offered for "Später"; the choice is shown again in the end summary. */
export const DEFER_REASONS = [
  'Rückfrage offen',
  'Beleg fehlt',
  'Betrag unklar',
  'Später entscheiden',
] as const;

/** One bank line (candidate or booked) in the shape the guided card needs. */
export interface GuidedItem {
  id: string;
  kind: 'candidate' | 'booking';
  /** Bank candidate id (candidate) or booking id (booking). */
  refId: string;
  payee: string;
  amountCents: number;
  currency: string;
  date: string;
  accountName: string;
  memo: string | null;
  /** Booked lines can be confirmed directly only while they are still pending. */
  pending: boolean;
  /** Label prepared by the server for a candidate, when it is not flagged for review. */
  serverLabel: string | null;
}

export function toGuidedItem(entry: InboxEntry): GuidedItem | undefined {
  if (entry.type === 'booking')
    return {
      id: entry.id,
      kind: 'booking',
      refId: entry.bookingId,
      payee: entry.payeeName || entry.memo || 'Buchung ohne Empfänger',
      amountCents: entry.amountCents,
      currency: entry.currency,
      date: entry.date,
      accountName: entry.accountName,
      memo: entry.memo,
      pending: entry.status === 'pending',
      serverLabel: null,
    };
  if (entry.type === 'stored' && entry.refType === 'bank-sync-candidate' && entry.refId) {
    const data = entry.bankCandidate;
    return {
      id: entry.id,
      kind: 'candidate',
      refId: entry.refId,
      payee: data?.payeeName || data?.memo || entry.title,
      amountCents: data?.amountCents ?? 0,
      currency: data?.currency ?? 'EUR',
      date: data?.date ?? entry.createdAt.slice(0, 10),
      accountName: data?.accountName ?? 'Konto nicht verfügbar',
      memo: data?.memo ?? null,
      pending: true,
      serverLabel: data?.suggestion && !data.suggestion.needsReview ? data.suggestion.label : null,
    };
  }
  return undefined;
}

/** Facts about one candidate that decide whether a direct confirmation is safe. */
export interface CandidateReadiness {
  loading: boolean;
  failed: boolean;
  ruleName: string | null;
  categoryName: string | null;
  /** True only when the same conditions as the bulk shortcut hold. */
  canConfirm: boolean;
  /** Why the suggestion is "Unbekannt" or why a direct confirmation is held back. */
  reason: string | null;
}

export interface CandidateFacts {
  review?:
    | {
        existingTransfer: unknown;
        suggestions: {
          id: string;
          name: string;
          automatic?: boolean;
          unavailable?: unknown;
          actions?: { categoryId?: string | null };
        }[];
      }
    | undefined;
  reviewFailed: boolean;
  matches?: { merge: unknown[]; link?: unknown[]; transfers: unknown[] } | undefined;
  matchesFailed: boolean;
  categoryNames: Map<string, string>;
  serverLabel: string | null;
}

/** The dialog preselects such a rule; the guided confirmation uses the same ones. */
export const usableRules = <T extends { id: string; automatic?: boolean; unavailable?: unknown }>(
  rows: T[],
) => rows.filter((row) => (row.automatic || row.id.startsWith('inbox-learn:')) && !row.unavailable);

/** Mirrors the dialog's default rule and the stricter bulk-safe checks (one rule, no merge or transfer). */
export function candidateReadiness(facts: CandidateFacts): CandidateReadiness {
  const { review, matches } = facts;
  const failed = facts.reviewFailed || facts.matchesFailed;
  const loading = !failed && (!review || !matches);
  const usable = usableRules(review?.suggestions ?? []);
  const first = usable[0];
  const hits =
    (matches?.merge.length ?? 0) + (matches?.link?.length ?? 0) + (matches?.transfers.length ?? 0);
  const duplicate = hits > 0 || Boolean(review?.existingTransfer);
  const ruleName = first?.name ?? facts.serverLabel;
  const categoryId = first?.actions?.categoryId;
  const categoryName = (categoryId && facts.categoryNames.get(categoryId)) || null;
  const canConfirm = !failed && !loading && Boolean(first) && usable.length === 1 && !duplicate;
  let reason: string | null = null;
  if (failed) reason = 'Der Vorschlag konnte nicht geladen werden. Bearbeiten ist weiter möglich.';
  else if (!loading && duplicate)
    reason =
      'Möglicher Treffer bei bestehenden Buchungen oder Umbuchung. Bitte unter Bearbeiten prüfen.';
  else if (!loading && !first)
    reason = 'Keine Regel passt zu diesem Umsatz. Wähle die Kategorie unter Bearbeiten.';
  else if (!loading && usable.length > 1)
    reason = 'Mehrere Regeln passen. Bitte unter Bearbeiten entscheiden.';
  return { loading, failed, ruleName, categoryName, canConfirm, reason };
}

export interface GuidedProgress {
  currentId: string | null;
  deferred: Record<string, string>;
  resolved: number;
}
const EMPTY: GuidedProgress = { currentId: null, deferred: {}, resolved: 0 };

/** The position survives a reload within the browser session; storage can be unavailable. */
export function loadProgress(): GuidedProgress {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const value = JSON.parse(raw) as Partial<GuidedProgress>;
    const deferred: Record<string, string> = {};
    for (const [id, reason] of Object.entries(value.deferred ?? {}))
      if (typeof reason === 'string') deferred[id] = reason;
    return {
      currentId: typeof value.currentId === 'string' ? value.currentId : null,
      deferred,
      resolved:
        typeof value.resolved === 'number' && Number.isSafeInteger(value.resolved)
          ? Math.max(value.resolved, 0)
          : 0,
    };
  } catch {
    return EMPTY;
  }
}

export function saveProgress(progress: GuidedProgress) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Without storage the pass simply starts at the oldest item next time.
  }
}

export function clearProgress() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * First index at or after `from` that is not deferred, then wrapping to the start; -1 when every
 * item is deferred (or there is none).
 */
export function nextOpenIndex(ids: string[], deferred: Record<string, string>, from: number) {
  for (let step = 0; step < ids.length; step++) {
    const index = (Math.max(from, 0) + step) % ids.length;
    if (!(ids[index]! in deferred)) return index;
  }
  return -1;
}
