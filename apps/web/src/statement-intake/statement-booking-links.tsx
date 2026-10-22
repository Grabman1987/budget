import type {
  StatementReceiptBooking,
  StatementReceiptLinksPage,
  StatementReceiptLinksReply,
} from '@budget/domain';
import { Button, Field, TextInput, useAmountPrivacy } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { notifyApiWrite, queryString, request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { longDay, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';

const KEY = [...LEDGER_KEY, 'statement-intake'] as const;
type Choice = { action: 'attach' | 'detach'; row: StatementReceiptBooking };
const href = (row: StatementReceiptBooking) =>
  `/konten/buchungen?konto=${encodeURIComponent(row.accountId)}&buchung=${encodeURIComponent(row.bookingId)}`;

/** Explicit existing-record attachments only; this component never creates or changes money. */
export function StatementBookingLinks({
  intakeId,
  accountId,
  disabled,
  onBusy,
  onDirty,
}: {
  intakeId: string;
  accountId: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  useAmountPrivacy();
  const qc = useQueryClient(),
    write = useBudgetWrite();
  const [search, setSearch] = useState(''),
    [q, setQ] = useState('');
  const [offset, setOffset] = useState(0),
    [attachedOffset, setAttachedOffset] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [base, setBase] = useState<StatementReceiptLinksPage | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [note, setNote] = useState('');
  const path = `/api/statement-intake/${encodeURIComponent(intakeId)}/booking-links`;
  const query = useQuery({
    queryKey: [...KEY, intakeId, 'booking-links', q, offset, attachedOffset],
    queryFn: async () => {
      const page = await request<StatementReceiptLinksPage>(
        'GET',
        `${path}${queryString({ q: q || undefined, offset, attachedOffset, limit: 25 })}`,
      );
      if (page.source.intakeId !== intakeId || page.source.accountId !== accountId)
        throw new Error('Die Dokumentverknüpfungen passen nicht zum ausgewählten Konto.');
      return page;
    },
  });
  const page = query.data,
    selected = Object.values(choices),
    locked = disabled || busy;
  const clear = () => {
    setChoices({});
    setBase(null);
    onDirty(false);
    setError('');
  };
  const choose = (row: StatementReceiptBooking, action: Choice['action']) => {
    if (locked || query.isFetching || !page) return;
    if (base && base.linksRevision !== page.linksRevision) {
      setError('Der Stand hat sich geändert. Bitte die Auswahl ausdrücklich neu laden.');
      return;
    }
    if (selected.length >= 100 && !choices[row.bookingId]) {
      setError('Höchstens 100 Buchungen pro Aktion auswählen.');
      return;
    }
    const next = { ...choices };
    if (next[row.bookingId]) delete next[row.bookingId];
    else next[row.bookingId] = { row, action };
    setChoices(next);
    setBase(Object.keys(next).length ? (base ?? page) : null);
    onDirty(Object.keys(next).length > 0);
    setError('');
    setNote('');
  };
  const save = async () => {
    if (locked || !base || !selected.length) return;
    setBusy(true);
    onBusy(true);
    setError('');
    setNote('');
    try {
      const target = (choice: Choice) => ({
        bookingId: choice.row.bookingId,
        bookingRevision: choice.row.bookingRevision,
      });
      const result = await request<StatementReceiptLinksReply>('POST', path, {
        sourceCas: {
          revision: base.source.revision,
          sha256: base.source.sha256,
          accountId: base.source.accountId,
        },
        linksRevision: base.linksRevision,
        attach: selected.filter((c) => c.action === 'attach').map(target),
        detach: selected.filter((c) => c.action === 'detach').map(target),
      });
      if (result.groupId) {
        const groupId = result.groupId;
        await write(
          async () => ({ ...result, groupId }),
          () => 'Belegverknüpfungen gespeichert.',
        );
      }
      clear();
      setNote(
        result.changedCount
          ? 'Verknüpfungen gespeichert. Beträge und Buchungsdaten bleiben unverändert.'
          : 'Die ausgewählten Verknüpfungen waren bereits im gewünschten Stand.',
      );
      notifyApiWrite();
      await qc.invalidateQueries({ queryKey: [...KEY, intakeId, 'booking-links'] });
    } catch (cause) {
      setError(
        `${errorText(cause)} Ihre Auswahl bleibt erhalten. Bitte den aktuellen Stand ausdrücklich laden.`,
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const reload = async () => {
    if (
      locked ||
      (selected.length && !window.confirm('Auswahl verwerfen und aktuelle Verknüpfungen laden?'))
    )
      return;
    setBusy(true);
    onBusy(true);
    try {
      const latest = await query.refetch();
      if (!latest.isError && latest.data) clear();
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const renderRow = (row: StatementReceiptBooking, action: Choice['action']) => {
    const mismatch = row.accountId !== accountId || row.currency !== page?.source.currency;
    const unavailable = mismatch || (action === 'detach' && row.managed);
    return (
      <li key={row.bookingId}>
        {action === 'attach' && row.attached ? (
          <p>Bereits angehängt</p>
        ) : (
          <label className="statement-choice-727">
            <input
              type="checkbox"
              checked={!!choices[row.bookingId]}
              disabled={locked || query.isFetching || unavailable}
              onChange={() => choose(row, action)}
            />
            <span>
              {action === 'attach' ? 'Anhängen' : 'Verknüpfung lösen'}: {longDay(row.date)} ·{' '}
              {row.description} · {nativeCurrency(row.amountCents, row.currency, true)} ·{' '}
              {row.accountName}
            </span>
          </label>
        )}
        {action === 'attach' && row.attached && (
          <p>
            {longDay(row.date)} · {row.description} ·{' '}
            {nativeCurrency(row.amountCents, row.currency, true)} · {row.accountName}
          </p>
        )}
        <small>Buchungs-ID: {row.bookingId}</small>{' '}
        <a href={href(row)} className="btn btn-ghost">
          Buchung öffnen
        </a>
        {row.managed && (
          <p>
            Automatisch verwaltet. Zum Lösen zuerst die vollständige Importaktion rückgängig machen.
          </p>
        )}
        {mismatch && <p>Abweichendes Konto oder unklare Währung: hier nicht änderbar.</p>}
      </li>
    );
  };
  return (
    <details className="statement-settlement-727 statement-candidates-727">
      <summary>Vorhandene Buchungen mit diesem PDF verknüpfen</summary>
      <p>
        Dasselbe Original kann mehrere Buchungen belegen. Wählen Sie die tatsächlichen Buchungen
        ausdrücklich aus; ein gleicher Betrag allein belegt keine Zuordnung. Es werden keine
        Buchungen oder Zahlungen angelegt.
      </p>
      {query.isPending && <LoadingNote what="Dokumentverknüpfungen" />}
      {query.isError && (
        <ErrorNote what="Dokumentverknüpfungen" error={query.error} onRetry={() => void reload()} />
      )}
      {page && (
        <>
          <a
            className="btn btn-ghost"
            href={`/api/receipts/${encodeURIComponent(page.source.receiptId)}/download`}
          >
            Gespeichertes Original herunterladen
          </a>
          <h3>Bereits angehängte Buchungen</h3>
          {page.attached.length === 0 && <p>In diesem Ausschnitt keine aktuellen Verknüpfungen.</p>}
          <ul>{page.attached.map((row) => renderRow(row, 'detach'))}</ul>
          <div className="statement-actions-726">
            <Button
              variant="ghost"
              disabled={locked || query.isFetching || attachedOffset === 0}
              onClick={() => setAttachedOffset(Math.max(0, attachedOffset - 25))}
            >
              Vorherige Verknüpfungen
            </Button>
            <Button
              variant="ghost"
              disabled={locked || query.isFetching || page.nextAttachedOffset === null}
              onClick={() => setAttachedOffset(page.nextAttachedOffset!)}
            >
              Weitere Verknüpfungen
            </Button>
          </div>
          {page.unavailableReason && (
            <p role="status">
              Bitte zuerst die Währung der Abrechnung prüfen. Ohne eindeutige Währung können keine
              Verknüpfungen geändert werden.
            </p>
          )}
          <Field label="Vorhandene Buchung suchen">
            {({ id }) => (
              <TextInput
                id={id}
                type="search"
                value={search}
                maxLength={200}
                disabled={locked}
                onChange={(event) => setSearch(event.target.value)}
              />
            )}
          </Field>
          <Button
            variant="ghost"
            disabled={locked || query.isFetching}
            onClick={() => {
              setQ(search.trim());
              setOffset(0);
            }}
          >
            Suchen
          </Button>
          {page.items.length === 0 && (
            <p>In diesem Ausschnitt keine passenden Buchungen auf diesem Konto.</p>
          )}
          <ul>{page.items.map((row) => renderRow(row, 'attach'))}</ul>
          <div className="statement-actions-726">
            <Button
              variant="ghost"
              disabled={locked || query.isFetching || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Vorherige Buchungen
            </Button>
            <Button
              variant="ghost"
              disabled={locked || query.isFetching || page.nextOffset === null}
              onClick={() => setOffset(page.nextOffset!)}
            >
              Weitere Buchungen
            </Button>
          </div>
        </>
      )}
      {selected.length > 0 && (
        <section aria-label="Auswahl vor dem Speichern">
          <h3>Ausgewählte Änderungen ({selected.length})</h3>
          <ul>
            {selected.map(({ row, action }) => (
              <li key={row.bookingId}>
                {action === 'attach' ? 'Anhängen' : 'Lösen'}: {longDay(row.date)} ·{' '}
                {row.description} · {nativeCurrency(row.amountCents, row.currency, true)} ·{' '}
                {row.accountName} · {row.bookingId}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {note && <p role="status">{note}</p>}
      <div className="statement-actions-726">
        <Button disabled={locked || !selected.length} onClick={() => void save()}>
          Verknüpfungen speichern
        </Button>
        <Button variant="ghost" disabled={locked || !selected.length} onClick={clear}>
          Auswahl verwerfen
        </Button>
        <Button variant="ghost" disabled={locked} onClick={() => void reload()}>
          Stand neu laden
        </Button>
      </div>
    </details>
  );
}
