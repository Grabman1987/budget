import { useAmountPrivacy, AmountInput, Button, Field, TextInput } from '@budget/ui';
import { formatDecimal, cents, parseAmount, todayInVienna } from '@budget/domain';
import { useId, useState } from 'react';
import { z } from 'zod';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';

/** The same audited value entry on the account page and during month close. */
export function ManualValue({
  accountId,
  end,
  valueCents,
  currency,
  openingDate,
  lastReconciledOn,
  blockedReason,
  onDone,
}: {
  accountId: string;
  end: string;
  valueCents: number;
  currency: string;
  openingDate: string;
  lastReconciledOn: string | null;
  blockedReason?: string | undefined;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const today = todayInVienna();
  const [date, setDate] = useState(end < today ? end : today);
  const [text, setText] = useState(formatDecimal(cents(valueCents)));
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const write = useBudgetWrite();
  const amount = parseAmount(text);
  const reason =
    blockedReason ??
    (!z.iso.date().safeParse(date).success
      ? 'Bitte einen gültigen Stichtag eingeben.'
      : date > today
        ? 'Stichtag liegt in der Zukunft.'
        : date < openingDate
          ? 'Stichtag liegt vor der Kontoeröffnung.'
          : lastReconciledOn && date <= lastReconciledOn
            ? 'Der Stichtag ist bereits festgeschrieben.'
            : text.trim() === ''
              ? 'Bitte einen Wert eingeben.'
              : !amount.ok
                ? 'Bitte einen gültigen Wert eingeben.'
                : amount.cents < 0
                  ? 'Der Wert darf nicht negativ sein.'
                  : null);
  return (
    <form
      className="kform"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || reason || !amount.ok) return;
        setBusy(true);
        void write(
          () =>
            request<{ groupId: string }>(
              'PUT',
              `/api/accounts/${encodeURIComponent(accountId)}/valuation`,
              { date, valueCents: amount.cents },
            ),
          () => 'Wert aktualisiert.',
        ).then((result) => {
          setBusy(false);
          if (result) onDone();
        });
      }}
    >
      <Field label="Stichtag">
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            value={date}
            min={openingDate}
            max={today}
            required
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      <AmountInput
        label={`Wert in ${currency}`}
        currency={currency}
        value={text}
        onChange={setText}
      />
      <p>Erfasst den Wert der Anlage. Es wird keine Buchung angelegt.</p>
      {(reason || busy) && (
        <p id={reasonId} role="status">
          {busy ? 'Wert wird gespeichert.' : reason}
        </p>
      )}
      <div className="kacct-actions">
        <Button
          type="submit"
          disabled={busy || Boolean(reason)}
          aria-describedby={reason || busy ? reasonId : undefined}
        >
          Wert speichern
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
