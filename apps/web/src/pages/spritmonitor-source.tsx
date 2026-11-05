import {
  Button,
  Field,
  Select,
  SectionHead,
  useAmountPrivacy,
  useToast,
  maskMoneyText,
  privateAmount,
} from '@budget/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { Fuel } from 'lucide-react';
import { addDays, todayInVienna } from '@budget/domain';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { fetchBookings } from '../ledger/api';
import { BookingPanel } from '../ledger/booking-panel';
import { longDay, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { AppLink } from '../shell/app-link';
import { SettingsSourceCard, sourceDate } from './settings-source-card';
import {
  refreshFuel,
  resolveFuel,
  spritmonitorQuery,
  type FuelRow,
  type FuelSource,
  type FuelStatus,
} from './spritmonitor-api';
import './spritmonitor.css';

const statusLabels = {
  review: 'Zu prüfen',
  booked: 'Gebucht',
  linked: 'Verknüpft',
  ignored: 'Ignoriert',
};
const reasons: Record<string, string> = {
  bootstrap: 'Historische Tankung: zuerst mit vorhandenen Buchungen abgleichen.',
  possible_duplicate:
    'Eine ähnliche Kraftstoffbuchung ist bereits vorhanden. Auch abweichende Netto- und Bruttobeträge prüfen.',
  source_changed:
    'Die Angaben in Spritmonitor haben sich geändert. Die bestehende Buchung bleibt unverändert.',
  unsupported_currency: 'Die Quellwährung kann nicht automatisch gebucht werden.',
  unknown_currency: 'Die Quellwährung fehlt oder ist unbekannt.',
  missing_cost: 'In der Quelle fehlt der Gesamtbetrag.',
  unsupported_amount: 'Der Quellbetrag kann nicht automatisch gebucht werden.',
  identity_conflict: 'Die Quellenkennung ist mehreren Buchungen zugeordnet.',
};
function fuelAmount(source: FuelSource) {
  return source.status === 'importable'
    ? nativeCurrency(source.amountCents, 'EUR')
    : source.sourceAmount
      ? maskMoneyText(`${privateAmount(source.sourceAmount)} ${source.currency ?? ''}`)
      : 'Betrag fehlt';
}
function Snapshot({ label, source }: { label: string; source: FuelSource }) {
  return (
    <p>
      <strong>{label}:</strong> {longDay(source.date)} ·{' '}
      {maskMoneyText(source.stationName ?? 'Tankstelle ohne Namen')} · {fuelAmount(source)}
      {source.location && <> · {maskMoneyText(source.location)}</>}
      {source.note && <> · {maskMoneyText(source.note)}</>}
    </p>
  );
}

/** Same source actions in the connection page and the existing Prüfen detail. */
export function SpritmonitorReview({ rowKey }: { rowKey: string }) {
  useAmountPrivacy();
  const query = useQuery(spritmonitorQuery());
  const row = query.data?.rows.find((r) => r.key === rowKey);
  // The normal editor owns its draft independently of source refreshes and decision-token resets.
  const [editing, setEditing] = useState<ListedBooking | null>(null);
  const [opening, setOpening] = useState(false);
  const [editError, setEditError] = useState('');
  const trigger = useRef<HTMLElement | null>(null);
  async function edit(id: string) {
    if (opening) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpening(true);
    setEditError('');
    try {
      const result = await request<{ booking: ListedBooking }>(
        'GET',
        `/api/bookings/${encodeURIComponent(id)}`,
      );
      setEditing(result.booking);
    } catch (caught) {
      setEditError(errorText(caught));
    } finally {
      setOpening(false);
    }
  }
  const content = query.isPending ? (
    <LoadingNote what="Tankung" />
  ) : query.isError ? (
    <ErrorNote what="Tankung" error={query.error} onRetry={() => void query.refetch()} />
  ) : !row ? (
    <p role="status">Diese Tankung ist nicht mehr zur Prüfung verfügbar.</p>
  ) : (
    <FuelReviewForm
      key={row.reviewFingerprint + ':' + row.status}
      row={row}
      data={query.data!}
      opening={opening}
      onEdit={(id) => void edit(id)}
    />
  );
  return (
    <>
      {content}
      {editError && <p role="alert">{maskMoneyText(editError)}</p>}
      <BookingPanel
        state={editing ? { mode: 'edit', booking: editing } : null}
        onClose={() => {
          setEditing(null);
          requestAnimationFrame(() => trigger.current?.focus());
        }}
      />
    </>
  );
}
function FuelReviewForm({
  row,
  data,
  opening,
  onEdit,
}: {
  row: FuelRow;
  data: FuelStatus;
  opening: boolean;
  onEdit: (id: string) => void;
}) {
  const source = row.changed ?? row.source;
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const resolving = busy || data.running;
  const acknowledge = useBudgetWrite();
  const toast = useToast();
  const linked = useQuery({
    queryKey: [...LEDGER_KEY, 'spritmonitor-booking', row.bookingId],
    enabled: Boolean(row.bookingId),
    queryFn: () =>
      request<{ booking: ListedBooking }>(
        'GET',
        `/api/bookings/${encodeURIComponent(row.bookingId!)}`,
      ),
    retry: false,
  });
  const candidates = useInfiniteQuery({
    queryKey: [...LEDGER_KEY, 'spritmonitor-matches', source.date],
    enabled: row.canResolve,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchBookings(
        {
          from: addDays(source.date, -2),
          to: addDays(source.date, 2) < todayInVienna() ? addDays(source.date, 2) : todayInVienna(),
        },
        pageParam,
        100,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const choices =
    candidates.data?.pages
      .flatMap((p) => p.items)
      .filter((b) => b.amountCents < 0 && b.currency === 'EUR' && !b.transferId) ?? [];
  async function resolve(action: 'book' | 'link' | 'ignore') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await resolveFuel(row, action, action === 'link' ? selected : undefined);
      await acknowledge(
        async () => result,
        () =>
          action === 'book'
            ? 'Tankung vorgemerkt.'
            : action === 'link'
              ? 'Tankung mit bestehender Buchung verknüpft.'
              : 'Tankung ignoriert.',
      );
    } catch (caught) {
      setError(errorText(caught));
      toast.show({ message: errorText(caught) });
      await client.invalidateQueries({ queryKey: spritmonitorQuery().queryKey });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="spritmonitor-review">
      <Snapshot label="Aktuelle Quelle" source={source} />
      {row.changed && <Snapshot label="Ursprüngliche Quelle" source={row.originalSource} />}
      {row.reason && <p>{reasons[row.reason] ?? 'Tankung mit dem Hauptbuch abgleichen.'}</p>}
      {row.bookingId && (
        <>
          {linked.isPending && <LoadingNote what="verknüpfte Buchung" />}
          {linked.isError && (
            <p role="status">
              Die verknüpfte Buchung ist nicht verfügbar oder wurde gelöscht. Sie wird nicht erneut
              angelegt.
            </p>
          )}
          {linked.data && (
            <p>
              Erfasst: {longDay(linked.data.booking.date)} ·{' '}
              {maskMoneyText(linked.data.booking.accountName)} ·{' '}
              {nativeCurrency(linked.data.booking.amountCents, linked.data.booking.currency)}
            </p>
          )}
          <Button
            variant="ghost"
            disabled={busy || opening || !linked.data}
            onClick={() => onEdit(row.bookingId!)}
          >
            Buchung bearbeiten
          </Button>
          <p>Zahlung über ein anderes Konto? Das Konto kann in der Buchung geändert werden.</p>
        </>
      )}
      {row.status === 'review' && !row.canResolve && (
        <p>
          Die Einrichtung ist unvollständig oder diese Tankung gehört nicht zur aktiven
          Quellenauswahl. Bitte die Verbindung prüfen.
        </p>
      )}
      {row.canResolve && (
        <>
          {candidates.isPending && <LoadingNote what="vorhandene Buchungen" />}
          {candidates.isError && (
            <ErrorNote
              what="vorhandene Buchungen"
              error={candidates.error}
              onRetry={() => void candidates.refetch()}
            />
          )}
          <Field label="Vorhandene Buchung verknüpfen">
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={selected}
                disabled={resolving || candidates.isPending || candidates.isError}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Buchung auswählen</option>
                {choices.map((b) => (
                  <option value={b.id} key={b.id}>
                    {longDay(b.date)} · {maskMoneyText(b.accountName)} ·{' '}
                    {nativeCurrency(b.amountCents, b.currency)} ·{' '}
                    {maskMoneyText(b.payeeName ?? b.memo ?? 'Ohne Empfänger')}
                    {row.candidates.includes(b.id) ? ' · möglicher Treffer' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {candidates.hasNextPage && (
            <Button
              variant="ghost"
              disabled={resolving || candidates.isFetchingNextPage}
              onClick={() => void candidates.fetchNextPage()}
            >
              Weitere Buchungen laden
            </Button>
          )}
          <p>
            Verknüpfen bewahrt Betrag, Konto und Kategorien der vorhandenen Buchung. Auch einen
            abweichenden rabattierten Betrag abgleichen.
          </p>
          <div className="sources-actions">
            <Button
              disabled={resolving || !selected || candidates.isError}
              onClick={() => void resolve('link')}
            >
              Mit Buchung verknüpfen
            </Button>
            <Button variant="ghost" disabled={resolving} onClick={() => void resolve('ignore')}>
              Tankung ignorieren
            </Button>
          </div>
          {row.canBook && data.destination && (
            <div>
              <p>
                Neue Buchung: {fuelAmount(source)} · {maskMoneyText(data.destination.accountName)} ·{' '}
                {maskMoneyText(data.destination.categoryName)} · vorgemerkt.
              </p>
              <p>Nur neu buchen, wenn diese Tankung noch nicht im Hauptbuch erfasst ist.</p>
              <Button
                disabled={resolving || candidates.isPending || candidates.isError}
                onClick={() => void resolve('book')}
              >
                Als neue Tankung buchen
              </Button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{maskMoneyText(error)}</p>}
    </div>
  );
}

export function SpritmonitorSourceSection({ compact = false }: { compact?: boolean } = {}) {
  useAmountPrivacy();
  const query = useQuery(spritmonitorQuery());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [shown, setShown] = useState(20);
  const acknowledge = useBudgetWrite();
  const client = useQueryClient();
  const data = query.data;
  const open = data?.rows.filter((r) => r.status === 'review').length ?? 0;
  const rows = [...(data?.rows ?? [])].sort(
    (a, b) =>
      Number(b.status === 'review') - Number(a.status === 'review') ||
      b.source.date.localeCompare(a.source.date),
  );
  const lastSuccess = data?.lastResult?.lastSuccess ?? data?.state?.lastSuccess;
  const status = !data?.configured
    ? 'Einrichtung fehlt'
    : busy || data.running
      ? 'Abruf läuft'
      : data.lastResult?.failed
        ? 'Abruf fehlgeschlagen'
        : open
          ? `${open} ${open === 1 ? 'Tankung' : 'Tankungen'} zu prüfen`
          : lastSuccess
            ? todayInVienna(new Date(lastSuccess)) === todayInVienna()
              ? 'Aktuell'
              : 'Abruf ausständig'
            : 'Bereit für ersten Abruf';
  async function refresh() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await refreshFuel();
      const message = `${result.imported} vorgemerkt · ${result.review} zu prüfen · ${result.linked} verknüpft`;
      setMessage(message);
      if (result.groupId)
        await acknowledge(
          async () => ({ groupId: result.groupId! }),
          () => message,
        );
      else await client.invalidateQueries({ queryKey: LEDGER_KEY });
    } catch (caught) {
      setError(errorText(caught));
      await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  const action = (
    <Button
      variant="ghost"
      disabled={busy || !data?.configured || data.running || query.isError}
      onClick={() => void refresh()}
    >
      {busy || data?.running ? 'Ruft ab …' : 'Jetzt abrufen'}
    </Button>
  );
  const content: ReactNode = (
    <>
      <h3 id="spritmonitor-source-title">Tankungen aus Spritmonitor</h3>
      {!data?.configured && !query.isPending && !query.isError && (
        <p>
          Die Verbindung wird am Server eingerichtet: Fahrzeug, Tank, Zahlungskonto,
          Kraftstoffkategorie und Lesezugang müssen festgelegt sein.
        </p>
      )}
      {data?.configured && (
        <>
          <p>
            Neue eindeutige Tankungen werden auf{' '}
            {maskMoneyText(data.destination?.accountName ?? '')} unter{' '}
            {maskMoneyText(data.destination?.categoryName ?? '')} vorgemerkt. Historische und
            unklare Tankungen bleiben zur Prüfung offen.
          </p>
          <p>
            Letzter Versuch: {sourceDate(data.lastResult?.lastAttempt)} · {open} offen
          </p>
          {data.lastResult?.failed && (
            <p role="alert">
              Der letzte Abruf ist fehlgeschlagen. Verbindung und Lesezugang prüfen und erneut
              abrufen.
            </p>
          )}
        </>
      )}
      <AppLink
        className="btn btn-ghost"
        to="/konten/pruefen"
        search={{ teil: 'aufgaben', von: '/einstellungen/datenquellen' }}
      >
        Offene Tankungen in Prüfen
      </AppLink>
      {rows.slice(0, shown).map((row) => (
        <FuelDisclosure key={row.key} row={row} />
      ))}
      {rows.length > shown && (
        <Button variant="ghost" onClick={() => setShown((n) => n + 20)}>
          Weitere Tankungen anzeigen ({rows.length - shown})
        </Button>
      )}
      {data?.configured && !rows.length && <p>Noch keine Tankungen abgerufen.</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{maskMoneyText(error)}</p>}
    </>
  );
  return compact ? (
    <SettingsSourceCard
      title="Spritmonitor"
      icon={Fuel}
      status={status}
      attention={!data?.configured || !!open || !!data?.lastResult?.failed}
      detail={`Tankungen · ${open} offen`}
      date={data?.lastResult?.lastSuccess ?? data?.state?.lastSuccess}
      loading={query.isPending}
      error={query.isError}
      onRetry={() => void query.refetch()}
      initiallyOpen={window.location.hash === '#spritmonitor-source-title'}
      action={action}
    >
      {content}
    </SettingsSourceCard>
  ) : (
    <section aria-labelledby="spritmonitor-section-title" className="data-source-section">
      <SectionHead title="Spritmonitor" id="spritmonitor-section-title" />
      {query.isPending && <LoadingNote what="Spritmonitor" />}
      {query.isError && (
        <ErrorNote what="Spritmonitor" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {data && (
        <p>
          Status: {status} · Letzter Erfolg:{' '}
          {sourceDate(data.lastResult?.lastSuccess ?? data.state?.lastSuccess)}
        </p>
      )}
      {action}
      {content}
    </section>
  );
}
function FuelDisclosure({ row }: { row: FuelRow }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="spritmonitor-row" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {longDay((row.changed ?? row.source).date)} ·{' '}
        {maskMoneyText((row.changed ?? row.source).stationName ?? 'Tankstelle ohne Namen')} ·{' '}
        {fuelAmount(row.changed ?? row.source)} · {statusLabels[row.status]}
      </summary>
      {open && <SpritmonitorReview rowKey={row.key} />}
    </details>
  );
}
