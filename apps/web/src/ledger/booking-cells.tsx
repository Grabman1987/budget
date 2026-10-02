import { ClassSwatch, type SwatchKind } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Check, CheckCheck, Clock, Split } from 'lucide-react';
import { FlagGlyph, FlagPicker } from './flag-picker';
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

/**
 * Flag column (first column of booking tables and lists): a coloured flag glyph that opens the
 * flag popover and saves at once. Transfers carry no flag and show it read-only. The colour name
 * is the text for screen readers and the tooltip.
 */
export function FlagCell({
  booking,
  label,
  onChange,
}: {
  booking: ListedBooking;
  label: string;
  onChange: (flag: BookingFlag | '') => void;
}) {
  if (booking.transferId) {
    if (!booking.flag) return null;
    return (
      <span className="kflag" title={`Markierung ${FLAG_LABEL[booking.flag]}`}>
        <FlagGlyph flag={booking.flag} size={16} />
      </span>
    );
  }
  return <FlagPicker value={booking.flag ?? ''} onChange={onChange} context={label} />;
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
  if (!only?.categoryId && booking.amountCents > 0) {
    // An inflow without a category is money to distribute, nothing missing.
    return (
      <span className="kcat">
        <ClassSwatch kind="open" />
        Zu verteilen
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

/** Payee line plus memo under it. */
export function PayeeCell({ booking }: { booking: ListedBooking }) {
  const name = booking.payeeName ?? (booking.transferId ? 'Umbuchung' : 'Ohne Empfänger');
  return (
    <>
      <span className="kname-s">{name}</span>
      {booking.memo && <span className="kmeta">{booking.memo}</span>}
    </>
  );
}
