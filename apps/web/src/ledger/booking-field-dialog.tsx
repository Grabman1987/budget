import { Button, FormDialog, Select, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { fetchPayees, readDatePreview, readPayeePreview, type BookingFieldPreview } from './api';
import { longDay, nativeCurrency } from './format';
import { errorText, SKIP_REASON_LABEL } from './labels';
import { LEDGER_KEY } from './queries';
import './booking-note-dialog.css';

export type BookingFieldKind = 'date' | 'payee';
/** Value of the confirmed change; `payee` null removes the payee. */
export type BookingFieldValue = { date: string } | { payeeId: string | null };

const TEXT = {
  date: {
    title: 'Datum gesammelt ändern',
    hint: 'Setzt das Buchungsdatum aller ausgewählten, ungeschützten Buchungen. Beträge bleiben unverändert; Umbuchungen, geprüfte und verknüpfte Buchungen werden übersprungen.',
    undo: 'Ein Rückgängig stellt alle geänderten Daten gemeinsam wieder her.',
  },
  payee: {
    title: 'Empfänger gesammelt ändern',
    hint: 'Setzt den Empfänger aller ausgewählten, ungeschützten Buchungen. Kategorien und Beträge bleiben unverändert, auch wenn der Empfänger eine Standardkategorie hat.',
    undo: 'Ein Rückgängig stellt alle geänderten Empfänger gemeinsam wieder her.',
  },
} as const;

export function BookingFieldDialog({
  kind,
  ids,
  onClose,
  onConfirm,
}: {
  kind: BookingFieldKind;
  ids: string[];
  onClose: () => void;
  onConfirm: (value: BookingFieldValue, preview: BookingFieldPreview) => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const fieldId = useId();
  const payees = useQuery({
    queryKey: [...LEDGER_KEY, 'payees'],
    queryFn: fetchPayees,
    enabled: kind === 'payee',
  });
  const [preview, setPreview] = useState<BookingFieldPreview>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const accepting = useRef(false);
  const value: BookingFieldValue =
    kind === 'date' ? { date } : { payeeId: payeeId === '' || payeeId === 'none' ? null : payeeId };
  const ready = kind === 'date' ? date !== '' : payeeId !== '';
  const payeeName = (id: string | null) =>
    id === null
      ? 'Empfänger entfernen'
      : (payees.data?.payees.find((p) => p.id === id)?.name ?? id);
  const run = async (confirm: boolean) => {
    if (accepting.current || !ready) return;
    accepting.current = true;
    setBusy(true);
    setFailure('');
    try {
      if (confirm && preview && preview.changed.length) {
        await onConfirm(value, preview);
        onClose();
      } else
        setPreview(
          'date' in value
            ? await readDatePreview(ids, value.date)
            : await readPayeePreview(ids, value.payeeId),
        );
    } catch (error) {
      setPreview(undefined);
      setFailure(errorText(error));
    } finally {
      accepting.current = false;
      setBusy(false);
    }
  };
  const invalidate = () => {
    setPreview(undefined);
    setFailure('');
  };
  const text = TEXT[kind];
  return (
    <FormDialog open title={text.title} onClose={onClose} beforeClose={() => !accepting.current}>
      <form
        className="bkform kdelete-preview knote-preview"
        aria-busy={busy}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="bk-head">
          <h2>{text.title}</h2>
        </div>
        <div className="bk-body">
          <label htmlFor={fieldId}>
            {kind === 'date' ? 'Neues Datum' : 'Neuer Empfänger'}
            {kind === 'date' ? (
              <TextInput
                id={fieldId}
                type="date"
                value={date}
                disabled={busy}
                onChange={(event) => {
                  setDate(event.target.value);
                  invalidate();
                }}
              />
            ) : (
              <Select
                id={fieldId}
                value={payeeId}
                disabled={busy || payees.isPending}
                onChange={(event) => {
                  setPayeeId(event.target.value);
                  invalidate();
                }}
              >
                <option value="">Empfänger wählen</option>
                <option value="none">Empfänger entfernen</option>
                {(payees.data?.payees ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </label>
          <p>{text.hint}</p>
          {preview && (
            <section aria-label="Vorschau der Änderung">
              <p role="status">
                {preview.ids.length} ausgewählt · {preview.changed.length} werden geändert ·{' '}
                {preview.skipped.length} geschützt · {preview.unchanged.length} bereits unverändert.
              </p>
              <p>
                {'date' in value
                  ? `Neues Datum: ${longDay(value.date)}`
                  : `Neuer Empfänger: ${payeeName(value.payeeId)}`}
              </p>
              {preview.monthShifts.length > 0 && (
                <ul aria-label="Verschiebung zwischen Monaten">
                  {preview.monthShifts.map((s) => (
                    <li key={`${s.currency}${s.month}`}>
                      {s.month.slice(5)}/{s.month.slice(0, 4)}:{' '}
                      {nativeCurrency(s.deltaCents, s.currency, true)}
                    </li>
                  ))}
                </ul>
              )}
              {preview.skipped.length > 0 && (
                <ul>
                  {preview.skipped.map((item) => (
                    <li key={item.id}>
                      {item.booking?.description ?? 'Buchung nicht mehr verfügbar'} ·{' '}
                      {item.booking?.accountName} · {SKIP_REASON_LABEL[item.reason]}
                    </li>
                  ))}
                </ul>
              )}
              <p>Geschützte Buchungen werden übersprungen. {text.undo}</p>
            </section>
          )}
          {failure && <p role="alert">{failure}</p>}
        </div>
        <div className="bk-foot">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button disabled={busy || !ready} onClick={() => void run(false)}>
            Änderungen prüfen
          </Button>
          {preview && preview.changed.length > 0 && (
            <Button disabled={busy} onClick={() => void run(true)}>
              Änderungen übernehmen
            </Button>
          )}
        </div>
      </form>
    </FormDialog>
  );
}
