import { Button, Count, FormDialog, useAmountPrivacy } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authStatusQuery } from '../auth/status-query';
import { CaptureForm } from '../ledger/capture-form';
import { eur } from '../ledger/format';
import { useLedgerWrites } from '../ledger/mutations';
import { queueReason, sendQueue } from './queue';
import { listQueue, removeQueued, subscribeQueue, type QueuedBooking } from './queue-store';

interface QueueState {
  items: QueuedBooking[];
  sending: boolean;
  error: string;
  send: () => void;
  edit: (item: QueuedBooking) => void;
}
const QueueContext = createContext<QueueState>({
  items: [],
  sending: false,
  error: '',
  send: () => undefined,
  edit: () => undefined,
});
export const useBookingQueue = () => useContext(QueueContext);

export function QueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueuedBooking[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<QueuedBooking>();
  const held = useRef<string | undefined>(undefined);
  const qc = useQueryClient();
  const auth = useQuery(authStatusQuery);
  const { offerUndo } = useLedgerWrites();
  const offer = useRef(offerUndo);
  useEffect(() => {
    offer.current = offerUndo;
  }, [offerUndo]);
  const send = useCallback(() => {
    setSending(true);
    void sendQueue(
      (result) => {
        offer.current('Buchung gesendet.', result.groupId);
        void qc.invalidateQueries();
      },
      () => held.current,
    )
      .catch((e: unknown) => setError(queueReason(e)))
      .finally(() => setSending(false));
  }, [qc]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void listQueue()
        .then((rows) => {
          if (active) {
            setItems(rows);
            setError('');
          }
        })
        .catch((e: unknown) => {
          if (active) setError(queueReason(e));
        });
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    window.addEventListener('online', send);
    window.addEventListener('focus', send);
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'SEND_BOOKINGS') send();
    };
    navigator.serviceWorker?.addEventListener('message', message);
    const initial = auth.data?.authenticated ? window.setTimeout(send, 0) : undefined;
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('online', send);
      window.removeEventListener('focus', send);
      navigator.serviceWorker?.removeEventListener('message', message);
    };
  }, [send, auth.data?.authenticated]);
  return (
    <QueueContext.Provider
      value={{
        items,
        sending,
        error,
        send,
        edit: (item) => {
          held.current = item.id;
          setEditing(item);
        },
      }}
    >
      {children}
      {editing && (
        <QueueCapture
          item={editing}
          onClose={() => {
            held.current = undefined;
            setEditing(undefined);
            send();
          }}
        />
      )}
    </QueueContext.Provider>
  );
}

export function QueueBadge() {
  const { items } = useBookingQueue();
  return items.length ? (
    <span
      title={`${items.length} · Wartet auf Verbindung`}
      aria-label={`${items.length} · Wartet auf Verbindung`}
    >
      <Count>{items.length}</Count>
    </span>
  ) : null;
}

/** Shared capture dialog: the static offline workspace never mounts financial routes. */
export function QueueCapture({ item, onClose }: { item?: QueuedBooking; onClose: () => void }) {
  const dirty = useRef(false);
  const [asking, setAsking] = useState(false);
  const beforeClose = () => {
    if (!dirty.current) return true;
    setAsking(true);
    return false;
  };
  return (
    <FormDialog
      open
      title={item ? 'Wartende Buchung bearbeiten' : 'Buchung erfassen'}
      onClose={onClose}
      beforeClose={beforeClose}
    >
      <CaptureForm
        state={{ mode: 'create' }}
        {...(item ? { queued: item } : {})}
        onDone={onClose}
        dirtyRef={dirty}
        requestClose={() => beforeClose() && onClose()}
        discard={{ asking, keep: () => setAsking(false), discard: onClose }}
      />
    </FormDialog>
  );
}

export function QueueList() {
  useAmountPrivacy();
  const { items, sending, error, send, edit } = useBookingQueue();
  const [localError, setLocalError] = useState('');
  if (!items.length && !error) return null;
  return (
    <section className="booking-queue" aria-label="Wartet auf Verbindung" id="booking-queue">
      <div className="queue-head">
        <h2>
          Wartet auf Verbindung <span>({items.length})</span>
        </h2>
        <Button onClick={send} disabled={sending}>
          {sending ? 'Wird gesendet…' : 'Jetzt senden'}
        </Button>
      </div>
      <p>Auf diesem Gerät gespeichert. Erst nach dem Senden im Budget enthalten.</p>
      {(error || localError) && (
        <p className="field-error" role="alert">
          {error || localError}
        </p>
      )}
      <ol className="queue-items">
        {items.map((item, i) => (
          <li key={item.id}>
            <span className="tech">{String(i + 1).padStart(2, '0')}</span>
            <div className="queue-detail">
              <strong>
                {item.draft.payee || (item.input.type === 'transfer' ? 'Umbuchung' : 'Buchung')}
              </strong>
              <span>
                {item.input.date.split('-').reverse().join('.')} ·{' '}
                {eur(
                  item.input.type === 'transfer' ? -item.input.amountCents : item.input.amountCents,
                  { sign: true },
                )}
              </span>
              {item.draft.memo && <span>{item.draft.memo}</span>}
              {item.reason && <span className="field-error">{item.reason}</span>}
              {item.reason?.includes('erneut anmelden') && <a href="/login">Erneut anmelden</a>}
              {item.uncertain && (
                <span>
                  Serverempfang unklar. Mit „Jetzt senden“ prüfen, bevor du änderst oder löschst.
                </span>
              )}
            </div>
            <div className="queue-actions">
              <Button
                variant="ghost"
                disabled={sending || item.uncertain}
                onClick={() => edit(item)}
              >
                Bearbeiten
              </Button>
              <Button
                variant="ghost"
                disabled={sending || item.uncertain}
                onClick={() =>
                  void removeQueued(item.id).catch((e: unknown) => setLocalError(queueReason(e)))
                }
              >
                Löschen
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
