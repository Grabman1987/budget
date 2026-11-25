import { Button, FormDialog, useAmountPrivacy } from '@budget/ui';
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
import { CaptureForm } from '../ledger/capture-form-lazy';
import { eur } from '../ledger/format';
import { useLedgerWrites } from '../ledger/mutations';
import { queueReason, sendQueue } from './queue';
import {
  pruneAcknowledgements,
  readQueueState,
  queuedStatus,
  removeQueued,
  subscribeQueue,
  type QueuedBooking,
} from './queue-store';

interface QueueState {
  items: QueuedBooking[];
  sending: boolean;
  error: string;
  send: (manual?: boolean) => void;
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
  const sendingRef = useRef(false);
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
  const send = useCallback(
    (manual?: boolean) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      void sendQueue(
        (result) => {
          offer.current('Buchung gesendet.', result.groupId);
          void qc.invalidateQueries();
        },
        () => held.current,
        manual === true,
      )
        .then((settled) => {
          if (settled) void qc.invalidateQueries();
        })
        .catch((e: unknown) => setError(queueReason(e)))
        .finally(() => {
          sendingRef.current = false;
          setSending(false);
        });
    },
    [qc],
  );
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void readQueueState()
        .then(({ items: rows }) => {
          if (active && current === generation) {
            setItems(rows);
            setError('');
          }
        })
        .catch((e: unknown) => {
          if (active && current === generation) setError(queueReason(e));
        });
    };
    void pruneAcknowledgements().catch(() => undefined);
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const auto = () => send();
    window.addEventListener('online', auto);
    window.addEventListener('focus', auto);
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'SEND_BOOKINGS') send();
    };
    navigator.serviceWorker?.addEventListener('message', message);
    const initial = auth.data?.authenticated ? window.setTimeout(send, 0) : undefined;
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('online', auto);
      window.removeEventListener('focus', auto);
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
    <>
      {(items.length > 0 || error) && (
        <section className="booking-queue" aria-label="Wartet auf Verbindung" id="booking-queue">
          <div className="queue-head">
            <h2>
              Wartet auf Verbindung <span>({items.length})</span>
            </h2>
            <Button onClick={() => send(true)} disabled={sending}>
              {sending ? 'Wird gesendet…' : 'Jetzt senden'}
            </Button>
          </div>
          <p>Erst nach der Serverbestätigung im Budget enthalten.</p>
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
                  {item.input.type === 'change' ? (
                    <span>Buchungs-ID: {item.input.bookingId}</span>
                  ) : (
                    <span>
                      {item.input.date.split('-').reverse().join('.')} ·{' '}
                      {eur(
                        item.input.type === 'transfer'
                          ? -item.input.amountCents
                          : item.input.amountCents,
                        { sign: true },
                      )}
                    </span>
                  )}
                  <span role="status">{queuedStatus(item)}</span>
                  {item.draft.memo && <span>{item.draft.memo}</span>}
                  {item.reason && <span className="field-error">{item.reason}</span>}
                  {item.errorId && <span className="tech">Fehler-ID: {item.errorId}</span>}
                  {item.reason?.includes('erneut anmelden') && <a href="/login">Erneut anmelden</a>}
                  {item.uncertain && (
                    <span>
                      Serverempfang unklar. Mit „Jetzt senden“ prüfen, bevor du änderst oder
                      löschst.
                    </span>
                  )}
                </div>
                <div className="queue-actions">
                  <Button
                    variant="ghost"
                    disabled={sending || item.uncertain || Boolean(item.change)}
                    onClick={() => edit(item)}
                  >
                    Bearbeiten
                  </Button>
                  {item.rejected && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void navigator.clipboard
                          ?.writeText(
                            [item.reason, item.errorId && `Fehler-ID: ${item.errorId}`]
                              .filter(Boolean)
                              .join(' · '),
                          )
                          .catch(() => setLocalError('Kopieren nicht möglich.'))
                      }
                    >
                      Details kopieren
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={sending || item.uncertain}
                    onClick={() =>
                      void removeQueued(item.id).catch((e: unknown) =>
                        setLocalError(queueReason(e)),
                      )
                    }
                  >
                    Löschen
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
