import { Button, SectionHead, useToast } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Camera, Loader2, X } from 'lucide-react';
import { ApiError, notifyApiWrite, request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { nativeCurrency } from '../ledger/format';
import { bookingsQuery, LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import {
  cancelReceiptIntent,
  enqueueReceipt,
  retryReceiptIntent,
  sendReceiptQueue,
} from '../pwa/receipt-queue';
import type { ReceiptIntent } from '../pwa/receipt-store';
import { ReceiptIntentList, receiptQueueSupported, useReceiptIntents } from './receipt-intents';
import './receipts.css';

interface Receipt {
  id: string;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
}
export interface AttachedReceipt {
  id: string;
  name: string;
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

/** The one direct receipt upload call, shared with the central document upload. */
export async function postReceipt(file: File, bookingId?: string) {
  const data = new FormData();
  data.set('file', file);
  if (bookingId) data.set('bookingId', bookingId);
  let response: Response;
  try {
    response = await fetch('/api/receipts', {
      method: 'POST',
      credentials: 'same-origin',
      body: data,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const result = (await response.json().catch(() => ({}))) as {
    groupId: string;
    receipt?: { id: string; sizeBytes: number };
    error?: string;
    message?: string;
  };
  if (!response.ok) throw new ApiError(response.status, result.error ?? 'unknown', result.message);
  notifyApiWrite();
  return result;
}

/** Attach to a saved booking, or capture first into the inbox. All writes use shared undo toasts. */
export function ReceiptSection({
  bookingId,
  actionsHost,
  uploadOnly = false,
  onAttached,
  onBusyChange,
  scope = 0,
}: {
  bookingId?: string;
  actionsHost?: Element | null;
  uploadOnly?: boolean;
  /** Fires once per file the server acknowledged (upload-only capture shows it until the save). */
  onAttached?: (file: AttachedReceipt, scope: number) => void;
  /** Reports upload activity so the capture dialog can hold its save back. */
  onBusyChange?: (busy: boolean) => void;
  /** Identifies the draft an upload started in; echoed back with the result. */
  scope?: number;
}) {
  const heading = useId(),
    uploadId = useId(),
    cameraId = useId();
  const picker = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [linking, setLinking] = useState<string | null>(null),
    [unsaved, setUnsaved] = useState<File | null>(null);
  const intents = useReceiptIntents(bookingId);
  const names = useRef(new Map<string, string>());
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  const receipts = useQuery({ ...receiptQuery(bookingId), enabled: !uploadOnly });
  const unlinked = useQuery({ ...receiptQuery(), enabled: Boolean(bookingId) });
  const write = useBudgetWrite(),
    toast = useToast();
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  // Back online: deliver waiting files (each keeps its own key), then show the new states.
  useEffect(() => {
    const onOnline = () => {
      if (!receiptQueueSupported()) return;
      void sendReceiptQueue()
        .catch(() => undefined)
        .then(intents.refresh);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [intents.refresh]);
  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.show({ message: 'Ein Beleg darf höchstens 15 MB groß sein.' });
      return;
    }
    const startScope = scopeRef.current;
    setBusy(true);
    setUnsaved(null);
    if (!receiptQueueSupported()) {
      // No device storage/locks (old or private browser): previous direct upload, no queue.
      const sent = await write(
        () => postReceipt(file, bookingId),
        () => (bookingId ? 'Beleg angehängt.' : 'Beleg unter Prüfen gespeichert.'),
      );
      if (sent?.receipt && onAttached)
        onAttached(
          { id: sent.receipt.id, name: file.name, sizeBytes: sent.receipt.sizeBytes },
          startScope,
        );
      setBusy(false);
      return;
    }
    let intent: ReceiptIntent;
    try {
      // The durable intent (and its Idempotency-Key) exists before any network attempt.
      intent = await enqueueReceipt(file, bookingId);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.show({ message: 'Ungültige Datei: Sie ist leer oder das Ziel ist ungültig.' });
        setBusy(false);
        return;
      }
      // Storage full/unavailable: nothing was saved. The selection stays in memory for a retry.
      setUnsaved(file);
      toast.show({ message: 'Beleg nicht gespeichert: Gerätespeicher voll oder nicht verfügbar.' });
      setBusy(false);
      return;
    }
    names.current.set(intent.id, file.name);
    await send(intent.id, startScope);
    setBusy(false);
  };
  const send = async (id: string, startScope = scopeRef.current) => {
    let handled = false;
    const sent = await write(
      async () => {
        const reply = await retryReceiptIntent(id);
        // Row already sent or cancelled (e.g. in another tab): nothing left to deliver here.
        if (!reply) {
          handled = true;
          return { groupId: '' };
        }
        return reply;
      },
      () =>
        handled
          ? 'Dieser Beleg wurde bereits gesendet oder verworfen.'
          : bookingId
            ? 'Beleg angehängt.'
            : 'Beleg unter Prüfen gespeichert.',
    );
    const receipt = sent && 'receipt' in sent ? sent.receipt : undefined;
    if (receipt && onAttached)
      onAttached(
        {
          id: receipt.id,
          name:
            names.current.get(id) ?? intents.items.find((i) => i.id === id)?.filename ?? 'Beleg',
          sizeBytes: receipt.sizeBytes,
        },
        startScope,
      );
    await intents.refresh();
  };
  const retry = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await send(id);
    setBusy(false);
  };
  const cancel = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const removed = await cancelReceiptIntent(id).catch(() => false);
    await intents.refresh();
    toast.show({
      message: removed
        ? 'Beleg von diesem Gerät verworfen. Die Buchung bleibt unverändert.'
        : 'Dieser Beleg wurde bereits übertragen oder entfernt.',
    });
    setBusy(false);
  };
  const change = async (run: () => Promise<{ groupId: string }>, message: string) => {
    if (busy) return;
    setBusy(true);
    await write(run, () => message);
    setBusy(false);
  };
  const actions = (
    <div className="receipt-actions">
      {actionsHost && busy && (
        <span className="sr-only" role="status">
          Beleg wird gespeichert …
        </span>
      )}
      <input
        ref={picker}
        id={uploadId}
        className="sr-only"
        hidden={Boolean(actionsHost)}
        tabIndex={-1}
        type="file"
        accept="image/*,application/pdf"
        aria-label="Belegdatei auswählen"
        disabled={busy}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={camera}
        id={cameraId}
        className="sr-only"
        hidden={Boolean(actionsHost)}
        tabIndex={-1}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        aria-label="Beleg fotografieren"
        disabled={busy}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" disabled={busy} onClick={() => picker.current?.click()}>
        {actionsHost &&
          (busy ? (
            <Loader2 className="spin" size={16} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
          ))}
        <span>Datei anhängen</span>
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => camera.current?.click()}>
        {actionsHost && <Camera size={16} strokeWidth={1.75} aria-hidden="true" />}
        <span>Foto aufnehmen</span>
      </Button>
    </div>
  );
  const list = (
    <ReceiptIntentList
      items={intents.items}
      busy={busy}
      unsaved={unsaved}
      onRetry={(id) => void retry(id)}
      onCancel={(id) => void cancel(id)}
      onRetryUnsaved={() => void upload(unsaved ?? undefined)}
      onDiscardUnsaved={() => setUnsaved(null)}
    />
  );
  if (uploadOnly)
    return (
      <section
        className="receipt-upload-only"
        aria-label="Beleg unter Prüfen speichern"
        aria-busy={busy}
      >
        {actionsHost ? createPortal(actions, actionsHost) : actions}
        <p className="sr-only">
          Neue Belege werden zunächst unter Prüfen gespeichert und können einer gespeicherten
          Buchung zugeordnet werden.
        </p>
        {list}
      </section>
    );
  return (
    <section className="receipt-section" aria-labelledby={heading} aria-busy={busy}>
      <SectionHead id={heading} title={bookingId ? 'Beleg' : 'Beleg ohne Buchung'} />
      {actionsHost ? createPortal(actions, actionsHost) : actions}
      <p className="receipt-hint">
        JPEG, PNG, WebP, HEIC/HEIF oder PDF · höchstens 15 MB.{' '}
        {busy ? 'Wird gespeichert …' : 'HEIC/HEIF und PDF behalten ihre Metadaten.'}
      </p>
      {list}
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

/** Files attached in the capture dialog before the booking exists (already in Prüfen). */
export function AttachedReceipts({
  items,
  onRemove,
}: {
  items: AttachedReceipt[];
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="receipt-attached" aria-label="Angehängte Belege">
      {items.map((r) => (
        <li key={r.id} data-testid="attached-receipt">
          <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="receipt-name">
            {r.name}
            <small> · {Math.max(1, Math.ceil(r.sizeBytes / 1024))} KB</small>
          </span>
          <Button
            variant="ghost"
            aria-label={`Beleg ${r.name} entfernen`}
            onClick={() => onRemove(r.id)}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
