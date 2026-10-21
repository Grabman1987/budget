import { Button, FormDialog, useAmountPrivacy, maskMoneyText } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { authStatusQuery } from '../auth/status-query';
import { useLedgerWrites } from '../ledger/mutations';
import { receiptQueueReason, sendReceiptQueue } from './receipt-queue';
import {
  beginReceiptQueue,
  cancelUnsentReceiptUpload,
  enqueueReceiptUpload,
  holdReceiptQueueForSignOut,
  listReceiptUploads,
  prepareReceiptQueueRecovery,
  recoverReceiptQueueAfterConfirmedAction,
  subscribeReceiptQueue,
  subscribeReceiptQueuePrivacy,
  type QueuedReceiptUpload,
  type ReceiptQueueRecoveryTicket,
} from './receipt-queue-store';
import '../receipts/receipts.css';

const UNAVAILABLE =
  'Der Belegspeicher ist nicht verfügbar oder gesperrt. Erneut anmelden, damit der Gerätespeicher geprüft werden kann. Eine nicht bestätigte Auswahl wurde nicht gesendet.';
const NOT_SAVED =
  'Nicht auf dem Gerät gespeichert. Die ausgewählte Datei bleibt hier geöffnet. Erneut speichern oder bewusst verwerfen.';
let privacyWarning = '';
const warningListeners = new Set<() => void>();
const privacyListeners = new Set<() => void>();
function warning(message: string) {
  privacyWarning = message;
  for (const listener of warningListeners) {
    try {
      listener();
    } catch {
      /* Presentation cannot prevent the authentication action. */
    }
  }
}
const subscribeWarning = (listener: () => void) => {
  warningListeners.add(listener);
  return () => {
    warningListeners.delete(listener);
  };
};

/** Optional device cleanup must never prevent a real authentication ceremony. */
export async function prepareReceiptLogin() {
  try {
    return await prepareReceiptQueueRecovery();
  } catch {
    warning(UNAVAILABLE);
    return undefined;
  }
}
export async function finishReceiptLogin(
  action: 'new-login' | 'new-recovery',
  ticket: ReceiptQueueRecoveryTicket | undefined,
) {
  if (!ticket) return;
  try {
    await recoverReceiptQueueAfterConfirmedAction(action, ticket);
    warning('');
  } catch {
    warning(UNAVAILABLE);
  }
}

/** Start both the fence and erase NOW, independently of an unresolved logout request. */
export function startReceiptSignOut() {
  for (const listener of privacyListeners) {
    try {
      listener();
    } catch {
      /* Native fencing and erasure must still start. */
    }
  }
  let hold: ReturnType<typeof holdReceiptQueueForSignOut>;
  try {
    hold = holdReceiptQueueForSignOut();
  } catch {
    warning(
      'Löschen der wartenden Belegdateien nicht bestätigt. Dateien können auf diesem Gerät verbleiben. Bitte den Speicher vor einer Weitergabe des Browsers erneut prüfen.',
    );
    return async () => undefined;
  }
  const clearing = hold.clear().then(
    () => true,
    () => false,
  );
  // Caller invokes this only once its HTTP action has settled, including a failed response.
  return async () => {
    if (!(await clearing)) {
      warning(
        'Löschen der wartenden Belegdateien nicht bestätigt. Dateien können auf diesem Gerät verbleiben. Bitte den Speicher vor einer Weitergabe des Browsers erneut prüfen.',
      );
      return;
    }
    try {
      await hold.release();
      warning('');
    } catch {
      warning('Der Belegspeicher bleibt gesperrt. Bitte nach einer erneuten Anmeldung prüfen.');
    }
  };
}

interface Draft {
  file: File;
  bookingId?: string;
  reset: () => void;
}
interface QueueState {
  items: QueuedReceiptUpload[];
  sending: boolean;
  storing: boolean;
  hasDraft: boolean;
  error: string;
  refresh: () => void;
  send: () => void;
  capture: (file: File, bookingId: string | undefined, reset: () => void) => void;
  cancel: (id: string) => void;
}
const QueueContext = createContext<QueueState | null>(null);
function useReceiptQueue() {
  const value = useContext(QueueContext);
  if (!value) throw new Error('ReceiptQueueProvider is required.');
  return value;
}

/** Device-only presentation above routing. No cached authentication or file previews. */
export function ReceiptQueueProvider({
  children,
  renderReauthentication,
}: {
  children: ReactNode;
  renderReauthentication?: (done: () => void) => ReactNode;
}) {
  useAmountPrivacy();
  const [reauthenticate, setReauthenticate] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [items, setItems] = useState<QueuedReceiptUpload[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [storing, setStoring] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [draftFailed, setDraftFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const currentDraft = useRef<Draft | undefined>(undefined);
  const draftGeneration = useRef(0);
  const refreshGeneration = useRef(0);
  const active = useRef(false);
  const inFlight = useRef(false);
  const storageInFlight = useRef(false);
  const qc = useQueryClient();
  const auth = useQuery(authStatusQuery);
  const { offerUndo } = useLedgerWrites();
  const offer = useRef(offerUndo);
  offer.current = offerUndo;
  const globalWarning = useSyncExternalStore(
    subscribeWarning,
    () => privacyWarning,
    () => '',
  );

  const forgetDraft = useCallback(() => {
    draftGeneration.current++;
    currentDraft.current?.reset();
    currentDraft.current = undefined;
    setDraft(undefined);
    setDraftFailed(false);
    setAsking(false);
  }, []);
  const refresh = useCallback(() => {
    active.current = true;
    const generation = ++refreshGeneration.current;
    void listReceiptUploads().then(
      (rows) => {
        if (generation !== refreshGeneration.current) return;
        setItems(rows);
        setError('');
      },
      () => {
        if (generation !== refreshGeneration.current) return;
        setItems([]);
        setError(UNAVAILABLE);
      },
    );
  }, []);
  const send = useCallback(() => {
    if (inFlight.current || navigator.onLine === false) return;
    inFlight.current = true;
    setSending(true);
    void sendReceiptQueue((result) => {
      offer.current('Beleg gesendet.', result.groupId);
      void qc.invalidateQueries();
    })
      .then(
        (result) => {
          setError(result.blocked ? receiptQueueReason(result.blocked) : '');
        },
        () => setError(UNAVAILABLE),
      )
      .finally(() => {
        inFlight.current = false;
        setSending(false);
        refresh();
      });
  }, [qc, refresh]);
  useEffect(() => {
    const onPrivacy = () => {
      refreshGeneration.current++;
      setItems([]);
      forgetDraft();
    };
    privacyListeners.add(onPrivacy);
    const unsubscribePrivacy = subscribeReceiptQueuePrivacy(onPrivacy);
    const unsubscribe = subscribeReceiptQueue(() => {
      // Hide old rows synchronously; no late read may put them back after a newer event.
      refreshGeneration.current++;
      setItems([]);
      if (active.current) refresh();
    });
    return () => {
      refreshGeneration.current++;
      privacyListeners.delete(onPrivacy);
      unsubscribePrivacy();
      unsubscribe();
    };
  }, [forgetDraft, refresh]);
  useEffect(() => {
    const wake = () => {
      setOnline(navigator.onLine);
      send();
    };
    const disconnected = () => setOnline(false);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('offline', disconnected);
    if (auth.data?.authenticated) send();
    return () => {
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('offline', disconnected);
    };
  }, [send, auth.data?.authenticated]);

  const persist = async (selection: Draft) => {
    if (storageInFlight.current) return;
    storageInFlight.current = true;
    setStoring(true);
    setDraftFailed(false);
    const generation = draftGeneration.current;
    try {
      await beginReceiptQueue();
      if (generation !== draftGeneration.current) return;
      await enqueueReceiptUpload(selection.file, selection.bookingId);
      if (generation !== draftGeneration.current) return;
      forgetDraft();
      refresh();
      send();
    } catch {
      if (generation === draftGeneration.current) setDraftFailed(true);
    } finally {
      storageInFlight.current = false;
      setStoring(false);
    }
  };
  return (
    <QueueContext.Provider
      value={{
        items,
        sending,
        storing,
        hasDraft: Boolean(draft),
        error,
        refresh,
        send,
        capture: (file, bookingId, reset) => {
          if (currentDraft.current || storageInFlight.current) return;
          const selection: Draft = { file, reset, ...(bookingId ? { bookingId } : {}) };
          currentDraft.current = selection;
          setDraft(selection);
          void persist(selection);
        },
        cancel: (id) => {
          void cancelUnsentReceiptUpload(id).then(refresh, () => {
            setError(
              'Serverempfang unklar oder Speicher gesperrt. Derselbe Eintrag bleibt erhalten.',
            );
            refresh();
          });
        },
      }}
    >
      {globalWarning && (
        <div className="receipt-device-warning" role="alert">
          <p>{globalWarning}</p>
          {renderReauthentication && (
            <Button variant="ghost" disabled={!online} onClick={() => setReauthenticate(true)}>
              Belegspeicher erneut prüfen
            </Button>
          )}
          {!online && <p>Für die erneute Anmeldung ist eine Verbindung erforderlich.</p>}
        </div>
      )}
      {reauthenticate && renderReauthentication && (
        <FormDialog
          open
          title="Belegspeicher erneut prüfen"
          onClose={() => setReauthenticate(false)}
        >
          <p>
            Erst eine neue bestätigte Anmeldung prüft die Freigabe dieses Gerätespeichers. Bei
            verlorenem Speicherstand werden nicht mehr verlässlich zuordenbare Gerätedateien
            geleert. Eine gewöhnlich abgelaufene Sitzung behält ihre wartenden Dateien.
          </p>
          {renderReauthentication(() => {
            setReauthenticate(false);
            refresh();
            void qc.invalidateQueries({ queryKey: authStatusQuery.queryKey });
            send();
          })}
        </FormDialog>
      )}
      {storing && (
        <p className="receipt-device-warning" role="status">
          Beleg wird auf diesem Gerät gespeichert …
        </p>
      )}
      {children}
      {draft && draftFailed && (
        <FormDialog
          open
          title="Beleg nicht gespeichert"
          onClose={() => setAsking(true)}
          beforeClose={() => {
            setAsking(true);
            return false;
          }}
        >
          <p className="field-error" role="alert">
            {NOT_SAVED}
          </p>
          <p className="receipt-name">{maskMoneyText(draft.file.name)}</p>
          <p>
            {!draft.file.size
              ? 'Bitte eine nicht leere Datei auswählen.'
              : draft.file.size > 15 * 1024 * 1024
                ? 'Ein Beleg darf höchstens 15 MB groß sein.'
                : 'Die Datei wurde noch nicht gesendet.'}
          </p>
          <div className="receipt-actions">
            <Button disabled={storing} onClick={() => void persist(draft)}>
              Erneut auf Gerät speichern
            </Button>
            <Button variant="ghost" onClick={() => setAsking(true)}>
              Datei verwerfen
            </Button>
          </div>
          {asking && (
            <div>
              <p>Diese nicht gespeicherte Auswahl wirklich verwerfen?</p>
              <div className="receipt-actions">
                <Button variant="ghost" onClick={() => setAsking(false)}>
                  Auswahl behalten
                </Button>
                <Button onClick={forgetDraft}>Auswahl verwerfen</Button>
              </div>
            </div>
          )}
        </FormDialog>
      )}
    </QueueContext.Provider>
  );
}

export function ReceiptSelection({
  bookingId,
  disabled = false,
}: {
  bookingId?: string;
  disabled?: boolean;
}) {
  const { capture, storing, hasDraft } = useReceiptQueue();
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const pickerId = useId(),
    cameraId = useId();
  const selected = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (file)
      capture(file, bookingId, () => {
        input.value = '';
      });
  };
  return (
    <>
      <div className="receipt-actions">
        <input
          ref={picker}
          id={pickerId}
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept="image/*,application/pdf"
          aria-label="Belegdatei auswählen"
          disabled={disabled || storing || hasDraft}
          onChange={(e) => selected(e.currentTarget)}
        />
        <input
          ref={camera}
          id={cameraId}
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          aria-label="Beleg fotografieren"
          disabled={disabled || storing || hasDraft}
          onChange={(e) => selected(e.currentTarget)}
        />
        <Button
          variant="ghost"
          disabled={disabled || storing || hasDraft}
          onClick={() => picker.current?.click()}
        >
          Datei anhängen
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || storing || hasDraft}
          onClick={() => camera.current?.click()}
        >
          Foto aufnehmen
        </Button>
      </div>
      <p className="receipt-hint">
        JPEG, PNG, WebP, HEIC/HEIF oder PDF · höchstens 15 MB. HEIC/HEIF und PDF behalten ihre
        Metadaten.
      </p>
    </>
  );
}

export function ReceiptPendingList({
  bookingId,
  all = false,
}: {
  bookingId?: string;
  all?: boolean;
}) {
  useAmountPrivacy();
  const { items, sending, error, refresh, send, cancel } = useReceiptQueue();
  useEffect(refresh, [refresh]);
  const rows = items.filter((item) => all || item.bookingId === bookingId);
  return (
    <section className="receipt-pending" aria-label="Wartende Belegdateien">
      <div className="receipt-actions">
        <h3>Wartende Belegdateien ({rows.length})</h3>
        <Button disabled={sending} onClick={send}>
          {sending ? 'Wird gesendet …' : 'Belege erneut senden'}
        </Button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {!rows.length && !error && <p>Keine wartenden Belegdateien.</p>}
      <ol className="receipt-list">
        {rows.map((item) => (
          <li key={item.id}>
            <strong className="receipt-name">{maskMoneyText(item.filename)}</strong>
            <p>
              {item.bookingId
                ? 'Für eine bereits gespeicherte Buchung.'
                : 'Ohne Buchung · nach dem Senden unter Prüfen.'}
            </p>
            <p>
              {item.failure
                ? receiptQueueReason(item.failure)
                : item.uncertain
                  ? 'Serverempfang unklar. Denselben Eintrag erneut senden. Vor Änderungen den Serverstand unter Prüfen kontrollieren.'
                  : 'Auf diesem Gerät gespeichert · wartet auf Verbindung.'}
            </p>
            <div className="receipt-actions">
              <Button
                variant="ghost"
                disabled={sending || item.uncertain}
                onClick={() => cancel(item.id)}
              >
                Wartende Datei löschen
              </Button>
              {item.failure === 'login' && (
                <a className="btn btn-ghost" href="/login">
                  Erneut anmelden
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ReceiptDeviceDisclosure() {
  return (
    <p className="receipt-hint">
      Wartende Dateien bleiben unverschlüsselt im Speicher dieses Browsers auf diesem Gerät; andere
      Zugriffe auf denselben Browserursprung können sie lesen. Das ist kein Backup. Der Browser kann
      sie entfernen. Abmelden löscht wartende Belegdateien; eine abgelaufene Sitzung behält sie zur
      erneuten Anmeldung. Datei-Metadaten können enthalten bleiben, bei HEIC/HEIF und PDF auch nach
      dem Senden.
    </p>
  );
}

export function ReceiptQueueAccess() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Beleg erfassen / wartende Dateien
      </Button>
      {open && (
        <FormDialog open title="Beleg auf diesem Gerät" onClose={() => setOpen(false)}>
          <p>
            Ohne Buchung erfassen. Für aktuelle Finanzdaten und das Senden ist eine Verbindung
            erforderlich.
          </p>
          <ReceiptSelection />
          <ReceiptDeviceDisclosure />
          <ReceiptPendingList all />
        </FormDialog>
      )}
    </>
  );
}
