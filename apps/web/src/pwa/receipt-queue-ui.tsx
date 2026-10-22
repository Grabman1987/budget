import { Button, useToast } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authStatusQuery } from '../auth/status-query';
import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ReactNode,
} from 'react';
import { useLedgerWrites } from '../ledger/mutations';
import { receiptQueueReason, sendReceiptQueue } from './receipt-queue';
import {
  cancelUnsentReceiptUpload, enqueueReceiptUpload, listReceiptUploads,
  subscribeReceiptQueue, beginReceiptQueue, receiptQueueTokenCurrent, receiptQueuePrivacyGeneration, type QueuedReceiptUpload,
} from './receipt-queue-store';

interface ReceiptQueueState {
  items: QueuedReceiptUpload[];
  sending: boolean;
  error: string;
  send: () => void;
}
const ReceiptQueueContext = createContext<ReceiptQueueState>({
  items: [], sending: false, error: '', send: () => undefined,
});

/** Raw-file delivery has its own bounded wakeups and never changes a saved booking. */
export function ReceiptQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueuedReceiptUpload[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const qc = useQueryClient();
  const auth = useQuery(authStatusQuery);
  const { offerUndo } = useLedgerWrites();
  const offer = useRef(offerUndo);
  useEffect(() => { offer.current = offerUndo; }, [offerUndo]);
  const send = useCallback(() => {
    if (active.current) return;
    active.current = true;
    setSending(true);
    void sendReceiptQueue((result) => {
      offer.current('Beleg gesendet.', result.groupId);
      void qc.invalidateQueries();
    }).then((result) => setError(result.blocked ? receiptQueueReason(result.blocked) : ''))
      .catch(() => setError('Belegspeicher nicht verfügbar. Wartende Belege erneut prüfen.'))
      .finally(() => { active.current = false; setSending(false); });
  }, [qc]);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      // Hide cached filenames immediately on every cross-tab privacy fence.
      setItems([]);
      void beginReceiptQueue().then(async (token) => {
        const rows = await listReceiptUploads();
        if (mounted && receiptQueueTokenCurrent(token)) setItems(rows);
      }).catch(() => {
        if (mounted) setError('Belegspeicher nicht verfügbar. Es wurde nichts neu gespeichert.');
      });
    };
    refresh();
    const unsubscribe = subscribeReceiptQueue(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    window.addEventListener('online', send);
    window.addEventListener('focus', send);
    const initial = window.setTimeout(send, 0);
    return () => {
      clearTimeout(initial);
      window.removeEventListener('online', send);
      window.removeEventListener('focus', send);
    };
  }, [send, auth.data?.authenticated]);
  return <ReceiptQueueContext.Provider value={{ items, sending, error, send }}>
    {children}
  </ReceiptQueueContext.Provider>;
}

/** Keep the original File in memory when durable storage fails; no implied saved state. */
export function ReceiptQueuePicker({ bookingId }: { bookingId?: string }) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { send } = useContext(ReceiptQueueContext);
  useEffect(() => {
    let generation = receiptQueuePrivacyGeneration();
    return subscribeReceiptQueue(() => {
      const next = receiptQueuePrivacyGeneration();
      if (next !== generation) {
        generation = next;
        setSelected(undefined);
        if (picker.current) picker.current.value = '';
        if (camera.current) camera.current.value = '';
      }
    });
  }, []);
  const toast = useToast();
  const persist = async (file: File | undefined) => {
    if (!file || busy) return;
    setSelected(file);
    setBusy(true);
    setError('');
    try {
      await enqueueReceiptUpload(file, bookingId);
      setSelected(undefined);
      if (picker.current) picker.current.value = '';
      if (camera.current) camera.current.value = '';
      toast.show({ message: 'Beleg auf diesem Gerät gespeichert. Er wird separat gesendet.' });
      send();
    } catch {
      setError(file.size > 15 * 1024 * 1024
        ? 'Nicht gespeichert. Ein Beleg darf höchstens 15 MB groß sein.'
        : 'Nicht auf dem Gerät gespeichert. Die gewählte Datei bleibt hier zum erneuten Versuch.');
    } finally { setBusy(false); }
  };
  return <div className="receipt-queue-picker">
    <div className="receipt-actions">
      <input ref={picker} id={`${id}-file`} className="sr-only" tabIndex={-1}
        type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        aria-label="Belegdatei auswählen" disabled={busy || Boolean(selected)}
        onChange={(e) => void persist(e.target.files?.[0])} />
      <input ref={camera} id={`${id}-camera`} className="sr-only" tabIndex={-1}
        type="file" accept="image/*" capture="environment"
        aria-label="Beleg fotografieren" disabled={busy || Boolean(selected)}
        onChange={(e) => void persist(e.target.files?.[0])} />
      <Button variant="ghost" disabled={busy || Boolean(selected)} onClick={() => picker.current?.click()}>
        Datei anhängen
      </Button>
      <Button variant="ghost" disabled={busy || Boolean(selected)} onClick={() => camera.current?.click()}>
        Foto aufnehmen
      </Button>
      {selected && <>
        <Button disabled={busy} onClick={() => void persist(selected)}>Speichern erneut versuchen</Button>
        <Button variant="ghost" disabled={busy} onClick={() => {
          setSelected(undefined); setError('');
          if (picker.current) picker.current.value = '';
          if (camera.current) camera.current.value = '';
        }}>Auswahl verwerfen</Button>
      </>}
    </div>
    {busy && <p role="status">Wird auf diesem Gerät gespeichert …</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <p className="receipt-hint">JPEG, PNG, WebP, HEIC/HEIF oder PDF · höchstens 15 MB.
      Rohe Dateien können Metadaten enthalten und bleiben bis zum Senden im Browserspeicher
      dieser Website. Das ist keine Verschlüsselung oder Sicherung; der Browser kann Daten entfernen.
      Bei Sitzungsablauf bleiben Belege für die erneute Anmeldung erhalten. Abmelden löscht wartende Belegdateien.</p>
  </div>;
}

export function ReceiptQueueList({ bookingId }: { bookingId?: string }) {
  const { items, sending, error, send } = useContext(ReceiptQueueContext);
  const [cancelError, setCancelError] = useState('');
  const visible = bookingId === undefined ? items : items.filter((item) => item.bookingId === bookingId);
  if (!visible.length && !error) return null;
  return <section className="booking-queue" aria-label="Wartende Belegdateien">
    <div className="queue-head">
      <h2>Wartende Belegdateien ({visible.length})</h2>
      <Button onClick={send} disabled={sending}>{sending ? 'Wird gesendet …' : 'Belege erneut senden'}</Button>
    </div>
    <p>Separater Versand. Gespeicherte Buchungen bleiben auch bei einem Uploadfehler erhalten.</p>
    {(error || cancelError) && <p className="field-error" role="alert">{cancelError || error}</p>}
    <ol className="queue-items">{visible.map((item, index) => <li key={item.id}>
      <span className="tech">{index + 1}</span>
      <div className="queue-detail">
        <strong>{item.filename}</strong>
        <span>{Math.ceil(item.blob.size / 1024)} KB · {item.bookingId ? 'Für gespeicherte Buchung' : 'Ohne Buchung'}</span>
        <span>{item.failure ? receiptQueueReason(item.failure) : 'Auf diesem Gerät gespeichert.'}</span>
        {item.uncertain && <span>Serverempfang unklar. Vor dem Entfernen mit demselben Sendeschlüssel prüfen.</span>}
        {item.failure === 'login' && <a href="/login">Erneut anmelden</a>}
      </div>
      <div className="queue-actions"><Button variant="ghost" disabled={sending || item.uncertain}
        onClick={() => void cancelUnsentReceiptUpload(item.id).catch(() =>
          setCancelError('Beleg konnte nicht entfernt werden. Bitte zuerst den Serverempfang prüfen.'))}>
        Vom Gerät entfernen
      </Button></div>
    </li>)}</ol>
  </section>;
}
