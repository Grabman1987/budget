import { DetailPanel, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { AppLink } from '../shell/app-link';
import { longDay, nativeCurrency } from './format';
import { LEDGER_KEY } from './queries';
import { ErrorNote, LoadingNote } from './states';
import type { ListedBooking } from './types';
import './booking-inspector.css';

export interface BookingInspectorData {
  usualCategory: { id: string; name: string } | null;
  history: Pick<ListedBooking, 'id' | 'date' | 'amountCents' | 'currency' | 'accountName'>[];
  rules: { id: string; name: string; enabled: boolean; matches: boolean }[];
  repetition: { id: string; name: string; dueDate: string } | null;
}

export function BookingInspector({
  booking,
  onClose,
}: {
  booking: ListedBooking | null;
  onClose: () => void;
}) {
  return (
    <DetailPanel open={!!booking} onClose={onClose} title="Buchungsdetails" focusableBody>
      {booking && <InspectorBody key={booking.id} booking={booking} onClose={onClose} />}
    </DetailPanel>
  );
}

function InspectorBody({ booking, onClose }: { booking: ListedBooking; onClose: () => void }) {
  useAmountPrivacy();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'inspector', booking.id],
    queryFn: () =>
      request<BookingInspectorData>(
        'GET',
        `/api/bookings/${encodeURIComponent(booking.id)}/inspector`,
      ),
  });
  const data = query.data;
  return (
    <div className="booking-inspector">
      <header>
        <h3>{booking.payeeName ?? 'Ohne Empfänger'}</h3>
        <p>
          {longDay(booking.date)} · {booking.accountName}
        </p>
        <strong>{nativeCurrency(booking.amountCents, booking.currency, true)}</strong>
      </header>
      {query.isPending && <LoadingNote what="Buchungsdetails" />}
      {query.isError && (
        <ErrorNote
          what="Buchungsdetails"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {!query.isError && data && (
        <>
          <section aria-label="Übliche Kategorie">
            <h3>Übliche Kategorie</h3>
            <p>{data.usualCategory?.name ?? 'Keine übliche Kategorie gespeichert.'}</p>
            {data.usualCategory && (
              <p className="kmeta">Gespeicherter Vorschlag für diesen Empfänger.</p>
            )}
          </section>
          <section aria-label="Empfänger-Historie">
            <h3>Letzte Beträge</h3>
            <p className="kmeta">
              Bis zu fünf weitere Buchungen dieses Empfängers bis heute, über alle Konten.
            </p>
            {data.history.length ? (
              <ul>
                {data.history.map((row) => (
                  <li key={row.id}>
                    <span>
                      {longDay(row.date)}
                      <small>{row.accountName}</small>
                    </span>
                    <strong>{nativeCurrency(row.amountCents, row.currency, true)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {booking.payeeId
                  ? 'Keine weiteren Buchungen vorhanden.'
                  : 'Kein Empfänger zugeordnet.'}
              </p>
            )}
          </section>
          <section aria-label="Zuordnungsregeln">
            <h3>Zuordnungsregeln</h3>
            {data.rules.length ? (
              <ul>
                {data.rules.map((rule) => (
                  <li key={rule.id}>
                    <AppLink
                      to="/einstellungen/zuordnung"
                      hash={`regel-${rule.id}`}
                      onClick={onClose}
                    >
                      {rule.name}
                      <small>
                        {!rule.enabled ? 'Deaktiviert · ' : ''}
                        {rule.matches
                          ? 'Bedingungen passen zur Buchung'
                          : 'Empfängerbezug; Bedingungen passen nicht'}
                      </small>
                    </AppLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Keine passenden Regeln oder Regeln mit Empfängerbezug.</p>
            )}
          </section>
          <section aria-label="Wiederholung">
            <h3>Wiederholung</h3>
            {data.repetition ? (
              <AppLink
                to={`/plan/erwartet/${encodeURIComponent(data.repetition.id)}`}
                onClick={onClose}
              >
                {data.repetition.name}
                <small>Zugeordneter Termin: {longDay(data.repetition.dueDate)}</small>
              </AppLink>
            ) : (
              <p>Keine Wiederholung mit dieser Buchung verknüpft.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
