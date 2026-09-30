import type { BookingPatch } from './api';
import type { BookingFlag, BookingPage, ListedBooking } from './types';

/**
 * Optimistic edits of cached booking pages. The server stays the source of truth: every write
 * refetches afterwards, these functions only make the screen answer at once.
 */

/** Names the optimistic view needs to show a patch before the server has answered. */
export interface Names {
  category: (id: string | null) => string | null;
  payee: (id: string | null) => string | null;
}

export function patchListed(b: ListedBooking, patch: BookingPatch, names: Names): ListedBooking {
  const next: ListedBooking = { ...b };
  if (patch.date !== undefined) next.date = patch.date;
  if (patch.amountCents !== undefined) next.amountCents = patch.amountCents;
  if (patch.memo !== undefined) next.memo = patch.memo;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.flag !== undefined) next.flag = patch.flag;
  if (patch.payeeId !== undefined) {
    next.payeeId = patch.payeeId;
    next.payeeName = names.payee(patch.payeeId);
  }
  if (patch.splits) {
    next.splits = patch.splits.map((s, i) => ({
      id: b.splits[i]?.id ?? `pending-${i}`,
      categoryId: s.categoryId,
      categoryName: names.category(s.categoryId),
      amountCents: s.amountCents,
      memo: s.memo ?? null,
      contactId: b.splits[i]?.contactId ?? null,
      incomeTypeId: b.splits[i]?.incomeTypeId ?? null,
      transferId: b.splits[i]?.transferId ?? null,
    }));
  } else if (patch.amountCents !== undefined && b.splits.length === 1) {
    next.splits = [
      { ...(b.splits[0] as ListedBooking['splits'][number]), amountCents: patch.amountCents },
    ];
  }
  return next;
}

/** Set of a bulk edit applied to a booking (only what a bulk edit can carry). */
export interface BulkSet {
  categoryId?: string | null;
  flag?: BookingFlag | null;
  status?: 'pending' | 'confirmed';
}

export const patchOfBulk = (set: BulkSet): BookingPatch => {
  const patch: BookingPatch = {};
  if (set.flag !== undefined) patch.flag = set.flag;
  if (set.status !== undefined) patch.status = set.status;
  return patch;
};

/** A bulk edit changes single-split, non-transfer bookings only (the server skips the rest). */
export function applyBulk(b: ListedBooking, set: BulkSet, names: Names): ListedBooking {
  let next = patchListed(b, patchOfBulk(set), names);
  if (set.categoryId !== undefined && b.splits.length === 1 && !b.transferId) {
    next = patchListed(
      next,
      { splits: [{ categoryId: set.categoryId, amountCents: b.amountCents }] },
      names,
    );
  }
  return next;
}

type PageLike = BookingPage | { pages: BookingPage[]; pageParams: unknown[] };

const isInfinite = (data: PageLike): data is { pages: BookingPage[]; pageParams: unknown[] } =>
  'pages' in data;

/** Apply `fn` to every listed booking of a cached page or infinite query result. */
export function mapCachedBookings<T extends PageLike | undefined>(
  data: T,
  fn: (b: ListedBooking) => ListedBooking | null,
): T {
  if (!data) return data;
  const mapPage = (page: BookingPage): BookingPage => {
    const items: ListedBooking[] = [];
    let sumCents = page.sumCents;
    let removed = 0;
    for (const item of page.items) {
      const next = fn(item);
      if (next === null) {
        removed += 1;
        sumCents -= item.amountCents;
      } else {
        sumCents += next.amountCents - item.amountCents;
        items.push(next);
      }
    }
    return { ...page, items, total: page.total - removed, sumCents };
  };
  if (isInfinite(data)) return { ...data, pages: data.pages.map(mapPage) } as T;
  return mapPage(data as BookingPage) as T;
}
