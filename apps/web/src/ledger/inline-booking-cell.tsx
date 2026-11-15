import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { Select, TextInput, maskMoneyText } from '@budget/ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import { errorText } from './labels';
import type { BookingPatch } from './api';
import type { ListedBooking } from './types';

/** Native fields share the ledger PATCH, including its server-side transfer/checked locks. */
export function InlineBookingCell({
  booking,
  field,
  children,
  onSave,
  onOpen,
  payees = [],
  disabled = false,
}: {
  booking: ListedBooking;
  field: 'date' | 'amountCents' | 'payeeId';
  payees?: readonly { id: string; name: string }[];
  disabled?: boolean;
  children: ReactNode;
  onSave: (patch: BookingPatch) => Promise<unknown>;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const active = useRef(false);
  const restoreFocus = useRef(false);
  const saving = useRef(false);
  const label = field === 'date' ? 'Datum' : field === 'payeeId' ? 'Empfänger' : 'Betrag';
  const blocked =
    field === 'payeeId'
      ? booking.transferId
        ? 'Umbuchung: Empfänger im Buchungsdialog bearbeiten.'
        : booking.splits.length !== 1
          ? 'Aufgeteilte Buchung: Empfänger im Buchungsdialog bearbeiten.'
          : undefined
      : undefined;
  const reason =
    blocked ?? (booking.status === 'reconciled' ? 'Geprüft: im Dialog freigeben' : undefined);
  const cancel = (focus = false) => {
    restoreFocus.current = focus;
    active.current = false;
    setEditing(false);
    setError(undefined);
  };
  const save = async () => {
    if (!active.current || saving.current || disabled) return;
    const patch: BookingPatch = {};
    if (field === 'date') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        return setError('Bitte ein gültiges Datum wählen.');
      if (value !== booking.date) patch.date = value;
    } else if (field === 'payeeId') {
      if ((value || null) !== booking.payeeId) patch.payeeId = value || null;
    } else {
      const parsed = parseAmount(value);
      if (!parsed.ok || parsed.cents === 0)
        return setError('Bitte einen Betrag ungleich 0 eintragen.');
      if (parsed.cents !== booking.amountCents) patch.amountCents = parsed.cents;
    }
    if (!Object.keys(patch).length) return cancel();
    saving.current = true;
    setBusy(true);
    try {
      await onSave(patch);
      cancel();
    } catch (e) {
      setError(errorText(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return editing ? (
    <div className="kinline">
      {field === 'payeeId' ? (
        <Select
          // Opened deliberately by the cell button.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label="Empfänger bearbeiten"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `inline-${booking.id}-${field}` : undefined}
          value={value}
          disabled={busy || disabled}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (!saving.current) cancel(true);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
        >
          <option value="">ohne Empfänger</option>
          {booking.payeeId && !payees.some((p) => p.id === booking.payeeId) && (
            <option value={booking.payeeId}>{booking.payeeName}</option>
          )}
          {payees.map((payee) => (
            <option key={payee.id} value={payee.id}>
              {payee.name}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput
          // Opened deliberately by the cell button.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          type={field === 'date' ? 'date' : 'text'}
          inputMode={field === 'date' ? undefined : 'decimal'}
          aria-label={`${label} bearbeiten`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `inline-${booking.id}-${field}` : undefined}
          value={value}
          disabled={busy || disabled}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (!saving.current) cancel(true);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
        />
      )}
      {error && (
        <span id={`inline-${booking.id}-${field}`} className="field-error" role="alert">
          {maskMoneyText(error)}
        </span>
      )}
    </div>
  ) : (
    <>
      <button
        type="button"
        ref={(el) => {
          if (el && restoreFocus.current) {
            restoreFocus.current = false;
            el.focus();
          }
        }}
        className="kcell-edit"
        disabled={disabled}
        title={reason ?? `${label} ändern`}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => {
          if (blocked || booking.status === 'reconciled') return onOpen();
          active.current = true;
          setValue(
            field === 'date'
              ? booking.date
              : field === 'payeeId'
                ? (booking.payeeId ?? '')
                : formatDecimal(cents(booking.amountCents)),
          );
          setEditing(true);
        }}
      >
        <span className="sr-only">
          {label} ändern: {booking.payeeName ?? 'Buchung'} ·
        </span>{' '}
        {children}
      </button>
      {reason && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}
