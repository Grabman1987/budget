import { createHash } from 'node:crypto';
import type { RawModel } from './model';

/**
 * Idempotency key per raw booking (`docs/migration/ynab-export.md` §Import run and checks): a hash
 * of file kind, account, date, payee, category, memo and amount of every row of the booking plus
 * the occurrence index among identical bookings, in file order. The status (`Cleared`) and the
 * flag are not part of it, so a booking that got cleared in a newer export keeps its key and is
 * updated; the mapping is not part of it either, so re-mapping never changes a key.
 */
export function importKeys(raw: RawModel): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const b of raw.bookings) {
    const identity = JSON.stringify([
      'register',
      b.account,
      b.date,
      b.memo,
      b.amountCents,
      b.splits.map((s) => [s.payee, s.categoryKey, s.memo, s.amountCents]),
    ]);
    const n = seen.get(identity) ?? 0;
    seen.set(identity, n + 1);
    const hash = createHash('sha256').update(`${identity}#${n}`).digest('hex');
    out.set(b.id, `ynab:${hash.slice(0, 32)}`);
  }
  return out;
}
