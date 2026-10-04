import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { TextInput, maskMoneyText } from '@budget/ui';
import { useRef, useState, type ReactNode } from 'react';
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
}: {
  booking: ListedBooking;
  field: 'date' | 'amountCents';
  children: ReactNode;
  onSave: (patch: BookingPatch) => Promise<unknown>;
  onOpen: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const restoreFocus = useRef(false);
  const saving = useRef(false);
  const label = field === 'date' ? 'Datum' : 'Betrag';
  const cancel = (focus = false) => {
    restoreFocus.current = focus;
    active.current = false;
    setEditing(false);
    setError(undefined);
  };
  const save = async () => {
    if (!active.current || saving.current) return;
    const patch: BookingPatch = {};
    if (field === 'date') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value
      )
        return setError('Bitte ein gültiges Datum wählen.');
      if (value !== booking.date) patch.date = value;
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
        disabled={busy}
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
      {error && (
        <span id={`inline-${booking.id}-${field}`} className="field-error" role="alert">
          {maskMoneyText(error)}
        </span>
      )}
    </div>
  ) : (
    <button
      type="button"
      ref={(el) => {
        if (el && restoreFocus.current) {
          restoreFocus.current = false;
          el.focus();
        }
      }}
      className="kcell-edit"
      aria-label={`${label} ändern: ${booking.payeeName ?? 'Buchung'}`}
      title={booking.status === 'reconciled' ? 'Geprüft: im Dialog freigeben' : `${label} ändern`}
      onClick={() => {
        if (booking.status === 'reconciled') return onOpen();
        active.current = true;
        setValue(field === 'date' ? booking.date : formatDecimal(cents(booking.amountCents)));
        setEditing(true);
      }}
    >
      {children}
    </button>
  );
}
