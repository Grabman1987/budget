import { ClassSwatch, type SwatchKind } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Check, CheckCheck, Clock, Flag, Split } from 'lucide-react';
import { FLAG_LABEL, STATUS_LABEL } from './labels';
import { lookupsQuery } from './queries';
import type { BookingFlag, BookingStatus, ListedBooking } from './types';

const STATUS_ICON = { pending: Clock, confirmed: Check, reconciled: CheckCheck } as const;

/** Status with icon and word; colour is never the only signal. */
export function StatusCell({ status }: { status: BookingStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={status === 'pending' ? 'status' : 'status ok'}>
      <Icon className="icon" size={14} strokeWidth={1.75} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Flag: an icon with its colour name as text (flag colours are names here, not hues). */
export function FlagMark({ flag }: { flag: BookingFlag }) {
  return (
    <span className="kflag" title={`Markierung ${FLAG_LABEL[flag]}`}>
      <Flag className="icon" size={13} strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">Markierung </span>
      {FLAG_LABEL[flag]}
    </span>
  );
}

/** Class of every category (Bedarf, Wunsch, Zukunft) for the swatch in front of its name. */
export function useCategoryClasses(): Map<string, SwatchKind> {
  const lookups = useQuery(lookupsQuery());
  const map = new Map<string, SwatchKind>();
  for (const c of lookups.data?.categories ?? []) {
    if (c.class === 'need' || c.class === 'want' || c.class === 'future') map.set(c.id, c.class);
  }
  return map;
}

/**
 * Category of a booking: name with class swatch, "Aufgeteilt" for several splits, the other
 * account for a transfer, and a plain marker when nothing is assigned yet (needs action).
 */
export function CategoryCell({
  booking,
  classes,
}: {
  booking: ListedBooking;
  classes: Map<string, SwatchKind>;
}) {
  if (booking.splits.length > 1) {
    return (
      <span className="kcat">
        <Split className="icon" size={14} strokeWidth={1.75} aria-hidden="true" />
        Aufgeteilt ({booking.splits.length})
      </span>
    );
  }
  const only = booking.splits[0];
  if (booking.transferId && !only?.categoryId) {
    const other = booking.transferAccountName ?? 'anderes Konto';
    return (
      <span className="kcat">
        <ArrowLeftRight className="icon" size={14} strokeWidth={1.75} aria-hidden="true" />
        Umbuchung {booking.amountCents < 0 ? 'nach' : 'von'} {other}
      </span>
    );
  }
  if (!only?.categoryId || !only.categoryName) {
    return (
      <span className="kcat is-none">
        <AlertTriangle className="icon" size={14} strokeWidth={1.75} aria-hidden="true" />
        ohne Kategorie
      </span>
    );
  }
  const kind = classes.get(only.categoryId);
  return (
    <span className="kcat">
      {kind && <ClassSwatch kind={kind} />}
      {only.categoryName}
    </span>
  );
}

/** Payee line plus memo (or the flag) under it. */
export function PayeeCell({ booking }: { booking: ListedBooking }) {
  const name = booking.payeeName ?? (booking.transferId ? 'Umbuchung' : 'Ohne Empfänger');
  return (
    <>
      <span className="kname-s">{name}</span>
      {(booking.memo || booking.flag) && (
        <span className="kmeta">
          {booking.flag && <FlagMark flag={booking.flag} />}
          {booking.memo}
        </span>
      )}
    </>
  );
}
