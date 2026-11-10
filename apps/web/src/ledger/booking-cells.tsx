import { BookingStatusIcon, ClassSwatch, type SwatchKind } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert, ArrowLeftRight, Check, CircleCheck, Clock, Split } from 'lucide-react';
import { bookingCounterparty } from './booking-counterparty';
import { FlagGlyph, FlagPicker } from './flag-picker';
import { FLAG_LABEL, STATUS_LABEL } from './labels';
import { accountsQuery, lookupsQuery } from './queries';
import { depotTradesQuery } from './depot-queries';
import type { BookingFlag, BookingStatus, ListedBooking } from './types';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { CategoryIcon } from '../budget/category-icon';

const STATUS_ICON = { pending: Clock, confirmed: Check, reconciled: CircleCheck } as const;

/** Status with icon and word; colour is never the only signal. */
export function StatusCell({
  status,
  iconOnly = false,
  onToggle,
  disabled = false,
}: {
  status: BookingStatus;
  iconOnly?: boolean;
  onToggle?: (() => void) | undefined;
  disabled?: boolean;
}) {
  const Icon = STATUS_ICON[status];
  const content = (
    <>
      {REDESIGN_ENABLED ? (
        <BookingStatusIcon status={status} className="icon" />
      ) : (
        <Icon className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
      )}
      {!iconOnly && STATUS_LABEL[status]}
    </>
  );
  return onToggle ? (
    <button
      type="button"
      className="kstatus-btn"
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
      onClick={onToggle}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <span
      className={iconOnly ? 'kstatus-btn' : status === 'pending' ? 'status' : 'status ok'}
      role={iconOnly ? 'img' : undefined}
      title={STATUS_LABEL[status]}
      aria-label={iconOnly ? STATUS_LABEL[status] : undefined}
    >
      {content}
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
    return (
      <span
        className="kflag"
        title={
          booking.flag ? `Markierung ${FLAG_LABEL[booking.flag]}` : 'Umbuchung: ohne Markierung'
        }
      >
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
  showClass = true,
}: {
  booking: ListedBooking;
  classes: Map<string, SwatchKind>;
  /** Registers omit class squares; category choices elsewhere retain their class identity. */
  showClass?: boolean;
}) {
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery({ ...lookupsQuery(), enabled: REDESIGN_ENABLED });
  const investment =
    accounts.data?.accounts.find((a) => a.id === booking.accountId)?.role === 'investment';
  const missingExpenseSplit = booking.splits.some(
    (split) =>
      split.amountCents < 0 &&
      !split.categoryId &&
      !split.transferId &&
      !split.contactId &&
      !split.incomeTypeId,
  );
  const trades = useQuery({
    ...depotTradesQuery(),
    enabled:
      investment && (!booking.splits[0]?.categoryId || (REDESIGN_ENABLED && missingExpenseSplit)),
  });
  if (booking.splits.length > 1) {
    const missingCategory =
      REDESIGN_ENABLED &&
      !booking.transferId &&
      booking.amountCents <= 0 &&
      booking.payeeSystemKind !== 'reconciliation_adjustment' &&
      booking.payeeSystemKind !== 'manual_adjustment' &&
      missingExpenseSplit &&
      !(investment && trades.data?.trades.some((trade) => trade.bookingId === booking.id));
    return (
      <span className={missingCategory ? 'kcat is-none' : 'kcat'}>
        {missingCategory ? (
          <TriangleAlert className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Split className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        )}
        {missingCategory ? (
          <>
            <span className="kcat-split-description">Aufgeteilt ({booking.splits.length}) · </span>
            ohne Kategorie
          </>
        ) : (
          <>Aufgeteilt ({booking.splits.length})</>
        )}
      </span>
    );
  }
  const only = booking.splits[0];
  if (booking.transferId && !only?.categoryId) {
    const other = booking.transferAccountName ?? 'anderes Konto';
    return (
      <span className="kcat">
        <ArrowLeftRight className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        Umbuchung {booking.amountCents < 0 ? 'nach' : 'von'} {other}
      </span>
    );
  }
  if (
    !only?.categoryId &&
    (booking.amountCents > 0 ||
      booking.payeeSystemKind === 'reconciliation_adjustment' ||
      booking.payeeSystemKind === 'manual_adjustment')
  ) {
    // Explicit balance corrections can also take money out of Zu verteilen.
    return (
      <span className="kcat">
        {showClass && <ClassSwatch kind="open" />}
        Zu verteilen
      </span>
    );
  }
  if (
    !only?.categoryId &&
    investment &&
    trades.data?.trades.some((t) => t.bookingId === booking.id)
  )
    return <span className="kcat">Trade · Verrechnung</span>;
  if (!only?.categoryId || !only.categoryName) {
    return (
      <span className="kcat is-none">
        <TriangleAlert className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
        ohne Kategorie
      </span>
    );
  }
  const kind = classes.get(only.categoryId);
  return (
    <span className="kcat">
      {showClass && kind && <ClassSwatch kind={kind} />}
      {REDESIGN_ENABLED && (
        <CategoryIcon
          icon={lookups.data?.categories.find((c) => c.id === only.categoryId)?.icon ?? null}
          name={only.categoryName}
        />
      )}
      {only.categoryName}
    </span>
  );
}

/** Payee line plus memo under it. */
export function PayeeCell({
  booking,
  noteClassName,
  hideNote = false,
}: {
  booking: ListedBooking;
  noteClassName?: string;
  /** The account register shows the note in its own column and phone line instead. */
  hideNote?: boolean;
}) {
  const name = bookingCounterparty(booking);
  return (
    <>
      <span className="kname-s">{name}</span>
      {booking.memo && booking.memo.trim() !== name && !hideNote && (
        <span className={noteClassName ? `kmeta ${noteClassName}` : 'kmeta'}>{booking.memo}</span>
      )}
    </>
  );
}
