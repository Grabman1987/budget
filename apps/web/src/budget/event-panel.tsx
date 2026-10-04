import type { PlannedEventView } from '@budget/db';
import {
  cents,
  EVENT_RECURRENCES,
  formatDecimal,
  parseAmount,
  type EventRecurrence,
} from '@budget/domain';
import { AmountInput, Button, DetailPanel, Field, Select, TextInput } from '@budget/ui';
import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AccountOptions } from '../ledger/account-options';
import { errorText } from '../ledger/labels';
import type { AccountRow } from '../ledger/types';
import {
  createPlannedEvent,
  deletePlannedEvent,
  patchPlannedEvent,
} from '../reports/liquidity-api';
import type { CategoryRow } from './api';
import { useBudgetWrite } from './use-category-writes';

export const RECURRENCE_LABELS: Record<EventRecurrence, string> = {
  once: 'Einmalig',
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  yearly: 'Jährlich',
  months: 'Bestimmte Monate',
};
export const EVENT_MONTH_LABELS = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export function EventPanel({
  event,
  date,
  categories,
  accounts,
  onClose,
}: {
  event: PlannedEventView | undefined;
  date: string;
  categories: CategoryRow[];
  accounts: Pick<AccountRow, 'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'>[];
  onClose: () => void;
}) {
  const [original] = useState(() => ({
    name: event?.name ?? '',
    date: event?.date ?? date,
    amount: event ? formatDecimal(cents(Math.abs(event.amountCents))) : '',
    kind: event && event.amountCents > 0 ? '1' : '-1',
    categoryId: event?.categoryId ?? '',
    accountId: event?.accountId ?? '',
    recurrence: event?.recurrence ?? 'once',
    recurrenceMonths: event?.recurrenceMonths ?? [],
    recurrenceUntil: event?.recurrenceUntil ?? '',
    enabled: event?.enabled ?? true,
    note: event?.note ?? '',
  }));
  const [draft, setDraft] = useState(original);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const dirty = useRef(false);
  const saving = useRef(false);
  const blockedDuringSave = useRef(false);
  const write = useBudgetWrite();
  const blocker = useBlocker({
    shouldBlockFn: () => {
      if (saving.current) blockedDuringSave.current = true;
      return dirty.current || saving.current;
    },
    withResolver: true,
    enableBeforeUnload: () => dirty.current || saving.current,
  });
  const { status, reset } = blocker;
  useEffect(() => {
    if (status !== 'blocked') return;
    if (blockedDuringSave.current || saving.current) {
      blockedDuringSave.current = false;
      reset();
    } else setAsking(true);
  }, [status, reset, busy]);
  const close = () => {
    dirty.current = false;
    onClose();
  };
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    const next = { ...draft, [key]: value };
    // Month selections only belong to the specific-month rule.
    if (key === 'recurrence' && value !== 'months') next.recurrenceMonths = [];
    if (key === 'recurrence' && value === 'once') next.recurrenceUntil = '';
    dirty.current = JSON.stringify(next) !== JSON.stringify(original);
    setDraft(next);
    setError('');
  };
  const save = async (action: 'save' | 'remove') => {
    if (saving.current) return;
    const parsed = parseAmount(draft.amount);
    if (
      action === 'save' &&
      (!parsed.ok ||
        parsed.cents <= 0 ||
        !draft.name.trim() ||
        !draft.date ||
        (draft.recurrence === 'months' && !draft.recurrenceMonths.length) ||
        (draft.recurrenceUntil && draft.recurrenceUntil < draft.date))
    ) {
      setError(
        'Bitte Name, Datum und positiven Betrag angeben. Wiederholungen brauchen passende Monate und ein Ende ab dem Beginn.',
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    const result = await write(
      async () => {
        try {
          if (action === 'remove' && event) return await deletePlannedEvent(event.id);
          if (!parsed.ok) throw new Error('Ungültiger Betrag');
          const input = {
            ...draft,
            amountCents: Number(draft.kind) * parsed.cents,
            categoryId: draft.categoryId || null,
            accountId: draft.accountId || null,
            recurrenceUntil: draft.recurrenceUntil || null,
            note: draft.note.trim() || null,
          };
          return event ? await patchPlannedEvent(event.id, input) : await createPlannedEvent(input);
        } catch (cause) {
          setError(errorText(cause));
          throw cause;
        }
      },
      () => (action === 'remove' ? 'Ereignis entfernt.' : 'Ereignis gespeichert.'),
    );
    saving.current = false;
    setBusy(false);
    if (result) close();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save('save');
  };
  return (
    <DetailPanel
      open
      title={event ? 'Ereignis bearbeiten' : 'Ereignis einplanen'}
      onClose={close}
      beforeClose={() => {
        if (saving.current || blocker.status === 'blocked') return false;
        if (!dirty.current) return true;
        setAsking(true);
        return false;
      }}
    >
      <p>
        Geplante Einnahmen und Ausgaben ändern die Vorschau. Speichern erzeugt keine Buchung und
        weist kein Geld zu.
      </p>
      <form className="kform event-form" onSubmit={submit}>
        <fieldset disabled={busy || asking || removing}>
          <Field
            label="Ereignis"
            hint="Zum Beispiel Urlaub, Versicherung jährlich, 13./14. Gehalt, Steuerausgleich oder große Anschaffung."
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Datum / Beginn"
            hint="Wiederholungen behalten diesen Tag. In kurzen Monaten gilt der letzte Tag."
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                type="date"
                required
                value={draft.date}
                onChange={(e) => update('date', e.target.value)}
              />
            )}
          </Field>
          <Field label="Art">
            {({ id }) => (
              <Select id={id} value={draft.kind} onChange={(e) => update('kind', e.target.value)}>
                <option value="-1">Ausgabe</option>
                <option value="1">Einnahme</option>
              </Select>
            )}
          </Field>
          <AmountInput
            label="Betrag je Termin"
            value={draft.amount}
            onChange={(v) => update('amount', v)}
            sign={draft.kind === '1' ? '+' : '−'}
          />
          <Field label="Kategorie">
            {({ id }) => (
              <Select
                id={id}
                value={draft.categoryId}
                onChange={(e) => update('categoryId', e.target.value)}
              >
                <option value="">Ohne Kategorie</option>
                {event?.categoryId && !categories.some((c) => c.id === event.categoryId) && (
                  <option value={event.categoryId}>Kategorie nicht mehr verfügbar</option>
                )}
                {categories
                  .filter((c) => !c.hiddenAt || c.id === draft.categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Budget-Konto">
            {({ id }) => (
              <Select
                id={id}
                value={draft.accountId}
                onChange={(e) => update('accountId', e.target.value)}
              >
                <option value="">Budget-Konten insgesamt</option>
                {event?.accountId && !accounts.some((a) => a.id === event.accountId) && (
                  <option value={event.accountId}>Konto nicht verfügbar · bitte neu wählen</option>
                )}
                <AccountOptions accounts={accounts} keepId={draft.accountId} />
              </Select>
            )}
          </Field>
          <Field label="Wiederholung">
            {({ id }) => (
              <Select
                id={id}
                value={draft.recurrence}
                onChange={(e) => update('recurrence', e.target.value as EventRecurrence)}
              >
                {EVENT_RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {draft.recurrence === 'months' && (
            <fieldset className="event-months">
              <legend>Monate der Wiederholung · jedes Jahr</legend>
              {EVENT_MONTH_LABELS.map((label, i) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={draft.recurrenceMonths.includes(i + 1)}
                    onChange={(e) =>
                      update(
                        'recurrenceMonths',
                        e.target.checked
                          ? [...draft.recurrenceMonths, i + 1].sort((a, b) => a - b)
                          : draft.recurrenceMonths.filter((m) => m !== i + 1),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          {draft.recurrence !== 'once' && (
            <Field label="Ende einschließlich" hint="Leer: Wiederholung ohne Enddatum.">
              {({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="date"
                  min={draft.date}
                  value={draft.recurrenceUntil}
                  onChange={(e) => update('recurrenceUntil', e.target.value)}
                />
              )}
            </Field>
          )}
          <label className="event-check">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
            />
            Ereignis eingeschaltet
          </label>
          <Field label="Notiz">
            {({ id }) => (
              <TextInput
                id={id}
                maxLength={500}
                value={draft.note}
                onChange={(e) => update('note', e.target.value)}
              />
            )}
          </Field>
          <div className="event-actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'Wird gespeichert …' : 'Ereignis speichern'}
            </Button>
            {event && (
              <Button variant="ghost" onClick={() => setRemoving(true)}>
                Ereignis entfernen
              </Button>
            )}
          </div>
        </fieldset>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {removing && (
        <section aria-label="Entfernen bestätigen">
          <p>Ereignis samt Wiederholungen entfernen?</p>
          <div className="event-actions">
            <Button disabled={busy} variant="ghost" onClick={() => setRemoving(false)}>
              Behalten
            </Button>
            <Button disabled={busy} onClick={() => void save('remove')}>
              Entfernen bestätigen
            </Button>
          </div>
        </section>
      )}
      {asking && (
        <section aria-label="Ungespeicherte Angaben">
          <p>Ungespeicherte Angaben verwerfen?</p>
          <div className="event-actions">
            <Button
              variant="ghost"
              onClick={() => {
                setAsking(false);
                if (blocker.status === 'blocked') blocker.reset();
              }}
            >
              Weiter bearbeiten
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                dirty.current = false;
                setAsking(false);
                if (blocker.status === 'blocked') blocker.proceed();
                else close();
              }}
            >
              Verwerfen
            </Button>
          </div>
        </section>
      )}
    </DetailPanel>
  );
}
