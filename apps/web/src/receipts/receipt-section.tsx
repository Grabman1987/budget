import { Button, SectionHead } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { nativeCurrency } from '../ledger/format';
import { bookingsQuery, LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import './receipts.css';
import { ReceiptQueuePicker, ReceiptQueueList } from '../pwa/receipt-queue-ui';

interface Receipt {
  id: string;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
}
const path = (id: string) => `/api/receipts/${encodeURIComponent(id)}`;
const receiptQuery = (bookingId?: string) => ({
  queryKey: [...LEDGER_KEY, 'receipts', bookingId ?? null],
  queryFn: () =>
    request<{ receipts: Receipt[] }>(
      'GET',
      `/api/receipts${bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ''}`,
    ),
});

/** Attach to a saved booking, or capture first into the inbox. All writes use shared undo toasts. */
export function ReceiptSection({ bookingId }: { bookingId?: string }) {
  const heading = useId();
  const [busy, setBusy] = useState(false),
    [linking, setLinking] = useState<string | null>(null);
  const receipts = useQuery(receiptQuery(bookingId));
  const unlinked = useQuery({ ...receiptQuery(), enabled: Boolean(bookingId) });
  const write = useBudgetWrite();
  const change = async (run: () => Promise<{ groupId: string }>, message: string) => {
    if (busy) return;
    setBusy(true);
    await write(run, () => message);
    setBusy(false);
  };
  return (
    <section className="receipt-section" aria-labelledby={heading} aria-busy={busy}>
      <SectionHead id={heading} title={bookingId ? 'Beleg' : 'Beleg ohne Buchung'} />
      <ReceiptQueuePicker {...(bookingId ? { bookingId } : {})} />
      <ReceiptQueueList {...(bookingId ? { bookingId } : {})} />
      {receipts.isPending && <LoadingNote what="Belege" />}
      {receipts.isError && (
        <ErrorNote what="Belege" error={receipts.error} onRetry={() => void receipts.refetch()} />
      )}
      {!receipts.isError && receipts.data && (
        <>
          {receipts.data.receipts.length === 0 && (
            <EmptyNote>
              {bookingId ? 'Noch kein Beleg angehängt.' : 'Keine Belege ohne Buchung.'}
            </EmptyNote>
          )}
          <ul className="receipt-list">
            {receipts.data.receipts.map((r) => (
              <li key={r.id} data-testid="receipt-row">
                <div className="receipt-file">
                  {['image/jpeg', 'image/png', 'image/webp'].includes(r.mime) ? (
                    <img
                      src={`${path(r.id)}/preview`}
                      alt={`Vorschau: ${r.originalFilename}`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="receipt-format tech">
                      {r.mime === 'application/pdf' ? 'PDF' : 'HEIC/HEIF'}
                    </span>
                  )}
                  <span className="receipt-name">
                    {r.originalFilename}
                    <small>{Math.ceil(r.sizeBytes / 1024)} KB</small>
                  </span>
                </div>
                <div className="receipt-actions">
                  <a className="btn btn-ghost" href={`${path(r.id)}/download`}>
                    Herunterladen
                  </a>
                  {!bookingId && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setLinking(linking === r.id ? null : r.id)}
                    >
                      Buchung zuordnen
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void change(
                        () =>
                          request(
                            'DELETE',
                            bookingId
                              ? `${path(r.id)}/links/${encodeURIComponent(bookingId)}`
                              : path(r.id),
                          ),
                        bookingId ? 'Beleg gelöst und unter Prüfen abgelegt.' : 'Beleg entfernt.',
                      )
                    }
                  >
                    {bookingId ? 'Verknüpfung entfernen' : 'Beleg entfernen'}
                  </Button>
                </div>
                {linking === r.id && (
                  <BookingPicker
                    busy={busy}
                    onLink={(target) =>
                      void change(
                        () => request('POST', `${path(r.id)}/links`, { bookingId: target }),
                        'Beleg zugeordnet.',
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {bookingId && !unlinked.isError && Boolean(unlinked.data?.receipts.length) && (
        <label className="receipt-existing">
          Beleg aus Prüfen
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              if (id)
                void change(
                  () => request('POST', `${path(id)}/links`, { bookingId }),
                  'Beleg angehängt.',
                );
            }}
          >
            <option value="">Beleg auswählen …</option>
            {unlinked.data?.receipts.map((r) => (
              <option value={r.id} key={r.id}>
                {r.originalFilename}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function BookingPicker({ busy, onLink }: { busy: boolean; onLink: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const bookings = useQuery(bookingsQuery({ q: search }, undefined, 20));
  return (
    <div className="receipt-picker">
      <label>
        Buchung suchen
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {bookings.isPending && <LoadingNote what="Buchungen" />}
      {bookings.isError && (
        <ErrorNote
          what="Buchungen"
          error={bookings.error}
          onRetry={() => void bookings.refetch()}
        />
      )}
      {!bookings.isError && bookings.data && (
        <label>
          Buchung auswählen
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) onLink(e.target.value);
            }}
          >
            <option value="">Bitte auswählen …</option>
            {bookings.data.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.date} · {b.accountName} · {b.payeeName ?? b.memo ?? 'Buchung'} ·{' '}
                {nativeCurrency(b.amountCents, b.currency)}
              </option>
            ))}
          </select>
        </label>
      )}
      {bookings.data?.items.length === 0 && <EmptyNote>Keine passende Buchung gefunden.</EmptyNote>}
    </div>
  );
}
