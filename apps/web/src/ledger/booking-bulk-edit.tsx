import { Button, Field, Select, TextInput, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import {
  readBookingBulkEditPreview, type BookingBulkEditPreview, type BulkSelection,
  type ProtectedBulkSet,
} from './api';
import { longDay, nativeCurrency } from './format';
import { errorText, SKIP_REASON_LABEL } from './labels';
import { payeesQuery } from './queries';

/** Fixed explicit selection; field changes always withdraw the previous confirmation. */
export function BookingBulkEditPanel({ ids, pending, onBusy, onConfirm, onCancel }: {
  ids: string[];
  pending: boolean;
  onBusy: (busy: boolean) => void;
  onConfirm: (preview: BookingBulkEditPreview) => Promise<void>;
  onCancel: () => void;
}) {
  useAmountPrivacy();
  const instance = useId();
  const [fixedIds] = useState(() => [...ids].sort());
  const [field, setField] = useState<'date' | 'memo' | 'payeeId'>('memo');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<BookingBulkEditPreview | null>(null);
  const [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [failure, setFailure] = useState('');
  const accepting = useRef(false);
  const payees = useQuery(payeesQuery());
  const set: ProtectedBulkSet = field === 'date' ? { date: value } : field === 'memo' ? { memo: value || null } : { payeeId: value || null };
  const matching = !!preview && /^[a-f0-9]{64}$/.test(preview.revision) &&
    preview.ids.length === fixedIds.length && preview.ids.every((id, index) => id === fixedIds[index]) &&
    JSON.stringify(preview.set) === JSON.stringify(set);
  const locked = busy || pending;
  const change = (next: string) => { setValue(next); setPreview(null); setStale(false); setFailure(''); };
  const inspect = async () => {
    if (locked || accepting.current || fixedIds.length > 100) return;
    accepting.current = true; setBusy(true); onBusy(true); setFailure(''); setPreview(null);
    try {
      setPreview(await readBookingBulkEditPreview(fixedIds, set));
      setStale(false);
    } catch (error) { setFailure(errorText(error)); }
    finally { accepting.current = false; setBusy(false); onBusy(false); }
  };
  const confirm = async () => {
    if (locked || accepting.current || !matching || !preview || stale || !preview.eligibleIds.length) return;
    accepting.current = true; setBusy(true); setFailure('');
    try { await onConfirm(preview); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'stale_bulk_preview') setStale(true);
      setFailure(errorText(error));
    } finally { accepting.current = false; setBusy(false); }
  };
  const totals = (facts: BulkSelection) => facts.missingIds.length ? 'nicht vollständig verfügbar' :
    facts.totals.map((t) => t.cents === null ? `${t.currency}: nicht darstellbar` : nativeCurrency(t.cents, t.currency, true)).join(' · ');
  const displayValue = (v: string | null) => v === null ? 'leer' : field === 'date' ? longDay(v) :
    field === 'payeeId' ? payees.data?.payees.find((p) => p.id === v)?.name ?? 'gespeicherter Empfänger' : v;
  return <form className="bkform kprotected-edit" onSubmit={(event) => event.preventDefault()} aria-labelledby={`${instance}-title`} aria-busy={locked}>
    <div className="bk-head"><h2 id={`${instance}-title`}>Mehrere bearbeiten</h2></div>
    <div className="bk-body">
      <p>{fixedIds.length} ausgewählt. Nur das gewählte Feld wird geändert. Geschützte oder verknüpfte Buchungen bleiben erhalten.</p>
      {fixedIds.length > 100 && <p role="alert">Höchstens 100 Buchungen gemeinsam bearbeiten.</p>}
      <fieldset className="kbulk-readonly-surface" disabled={locked}>
        <legend className="sr-only">Gemeinsame Änderung</legend>
        <Field label="Feld">{({ id }) => <Select id={id} value={field} onChange={(event) => {
          setField(event.target.value as typeof field); change('');
        }}><option value="memo">Notiz</option><option value="date">Buchungsdatum</option><option value="payeeId">Empfänger</option></Select>}</Field>
        {field === 'payeeId' ? <Field label="Empfänger">{({ id }) => <Select id={id} value={value} disabled={!payees.data || payees.isError} onChange={(event) => change(event.target.value)}>
          <option value="">Empfänger entfernen</option>
          {(payees.data?.payees ?? []).filter((p) => !p.systemKind).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>}</Field> : <Field label={field === 'date' ? 'Buchungsdatum' : 'Notiz'}>{({ id }) => <TextInput
          id={id} type={field === 'date' ? 'date' : 'text'} value={value}
          {...(field === 'memo' ? { maxLength: 500 } : { required: true })}
          onChange={(event) => change(event.target.value)}
        />}</Field>}
      </fieldset>
      {payees.isError && field === 'payeeId' && <p role="alert">Empfänger konnten nicht geladen werden. <Button variant="ghost" disabled={locked} onClick={() => void payees.refetch()}>Erneut laden</Button></p>}
      {matching && preview && <section aria-label="Änderungsvorschau">
        <p>{preview.eligibleIds.length} werden geändert · {preview.rows.filter((r) => r.reason).length} gesperrt · {preview.rows.filter((r) => !r.reason && r.unchanged).length} bereits im gewünschten Stand.</p>
        <p>Summe der Auswahl: {totals(preview.selection)}</p>
        <p>Alle angezeigten Änderungen erfolgen gemeinsam. Hat sich eine Buchung inzwischen geändert, wird die ganze Änderung abgelehnt und muss erneut geprüft werden.</p>
        <ul>{preview.rows.map((row) => {
          const item = preview.selection.items.find((r) => r.id === row.id);
          return <li key={row.id}>
            {item ? <>{item.description} · {longDay(item.date)} · {item.amountCents === null ? 'Betrag nicht verfügbar' : nativeCurrency(item.amountCents, item.currency, true)} · {item.accountName}</> : 'Nicht mehr verfügbar'} · {row.id}
            {row.reason ? <> · {SKIP_REASON_LABEL[row.reason]}</> : <div>{displayValue(row.before)} → {displayValue(row.after)}{row.unchanged && ' · unverändert'}</div>}
          </li>;
        })}</ul>
      </section>}
      {failure && <p role="alert">{failure}</p>}
      {stale && <p role="status">Die Auswahl wurde geändert. Prüfe die Änderung erneut und bestätige den neuen Stand ausdrücklich.</p>}
    </div>
    <div className="bk-foot">
      <Button variant="ghost" disabled={locked} onClick={onCancel}>Abbrechen</Button>
      <Button variant="ghost" disabled={locked || fixedIds.length > 100 || (field === 'date' && !value) || (field === 'payeeId' && (!payees.data || payees.isError))} onClick={() => void inspect()}>Änderungen prüfen</Button>
      <Button disabled={locked || !matching || stale || !preview?.eligibleIds.length} onClick={() => void confirm()}>Änderungen übernehmen</Button>
    </div>
  </form>;
}
