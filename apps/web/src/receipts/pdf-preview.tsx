import { Button, Field, TextInput, useAmountPrivacy } from '@budget/ui';
import { useEffect, useRef, useState } from 'react';
import './pdf-preview.css';

const BYTE_LIMIT = 8 * 1024 * 1024;
const messages: Record<string, string> = {
  pdf_preview_password: 'Bitte das PDF-Passwort eingeben oder korrigieren und erneut versuchen.',
  pdf_preview_page: 'Diese Seite ist nicht vorhanden. Bitte eine andere Seite wählen.',
  pdf_preview_limit: 'Für dieses PDF wurde ein Verarbeitungslimit erreicht. Das Original bleibt verfügbar.',
  pdf_preview_busy: 'Eine Vorschau wird gerade erstellt. Bitte gleich erneut versuchen.',
  pdf_preview_source_changed: 'Der Beleg ist nicht mehr unverändert verfügbar. Bitte die Prüfung neu öffnen.',
};
const unavailable = 'Die Vorschau ist nicht verfügbar. Du kannst das Original herunterladen und die Angaben weiter prüfen.';
type Selection = { page: number; preset: 'fit' | 'detail'; password: string; attempt: number };
type PageView = { status: 'loading' } | { status: 'error'; message: string }
  | { status: 'ready'; image: string; width: number; height: number };

async function pngBlob(response: Response, signal: AbortSignal) {
  if (response.headers.get('content-type')?.split(';')[0] !== 'image/png' || !response.body)
    throw new Error('preview');
  const announced = response.headers.get('content-length');
  if (announced !== null && (!/^\d+$/.test(announced) || Number(announced) > BYTE_LIMIT))
    throw new Error('preview');
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let length = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BYTE_LIMIT) throw new Error('preview');
      chunks.push(Uint8Array.from(value).buffer);
    }
    if (!length) throw new Error('preview');
    return new Blob(chunks, { type: 'image/png' });
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function imageUrl(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((done, fail) => {
    const reader = new FileReader();
    const cancel = () => reader.abort();
    const finish = () => signal.removeEventListener('abort', cancel);
    reader.onload = () => {
      finish();
      if (typeof reader.result === 'string') done(reader.result);
      else fail(new Error('preview'));
    };
    reader.onerror = reader.onabort = () => { finish(); fail(new Error('preview')); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { finish(); fail(new Error('aborted')); return; }
    reader.readAsDataURL(blob);
  });
}

/** All pixels/passwords live only in this mounted session, outside persistent query caches. */
function PdfPage({ receiptId, onClose }: { receiptId: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [selection, setSelection] = useState<Selection>({ page: 1, preset: 'fit', password: '', attempt: 0 });
  const [view, setView] = useState<PageView>({ status: 'loading' });
  const [pages, setPages] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      if (current) setView({ status: 'error', message: unavailable });
      controller.abort();
    }, 25_000);
    void (async () => {
      try {
        const response = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}/pdf-preview`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ page: selection.page, preset: selection.preset,
            ...(selection.password ? { password: selection.password } : {}) }),
        });
        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => undefined);
          const code = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error) : '';
          if (current) setView({ status: 'error', message: messages[code] ?? unavailable });
          return;
        }
        const page = Number(response.headers.get('X-PDF-Page'));
        const count = Number(response.headers.get('X-PDF-Pages'));
        const width = Number(response.headers.get('X-PDF-Width'));
        const height = Number(response.headers.get('X-PDF-Height'));
        if (page !== selection.page || !Number.isInteger(count) || count < page || count > 30 ||
          !Number.isInteger(width) || !Number.isInteger(height) ||
          width <= 0 || height <= 0 || width > 2048 || height > 2048) throw new Error('preview');
        const image = await imageUrl(await pngBlob(response, controller.signal), controller.signal);
        if (current) {
          setPages(count);
          setView({ status: 'ready', image, width, height });
        }
      } catch {
        if (current && !controller.signal.aborted) setView({ status: 'error', message: unavailable });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [receiptId, selection]);
  const busy = view.status === 'loading';
  function load(page: number, preset = selection.preset) {
    setView({ status: 'loading' }); // Remove old pixels before requesting the next page/generation.
    setSelection({ page, preset, password, attempt: selection.attempt + 1 });
  }
  return (
    <>
      <div className="receipt-pdf-controls">
        <Button variant="ghost" disabled={busy || selection.page === 1}
          onClick={() => load(selection.page - 1)}>Vorherige Seite</Button>
        <span role="status" aria-live="polite">Seite {selection.page}{pages ? ` von ${pages}` : ''}</span>
        <Button variant="ghost" disabled={busy || pages === null || selection.page >= pages}
          onClick={() => load(selection.page + 1)}>Nächste Seite</Button>
        <Button variant="ghost" disabled={busy} aria-pressed={selection.preset === 'detail'}
          onClick={() => load(selection.page, selection.preset === 'fit' ? 'detail' : 'fit')}>
          {selection.preset === 'fit' ? 'Vergrößern' : 'An Breite anpassen'}
        </Button>
        <Button variant="ghost" onClick={onClose}>Vorschau schließen</Button>
      </div>
      <div className="receipt-pdf-frame" tabIndex={view.status === 'ready' ? 0 : undefined}
        role="region" aria-label="PDF-Seitenansicht" aria-busy={busy}>
        {busy && <p role="status">PDF-Seite wird erstellt …</p>}
        {view.status === 'error' && <p role="alert">{view.message}</p>}
        {view.status === 'ready' && <img src={view.image} alt={`Originalbeleg, Seite ${selection.page}`}
          width={view.width} height={view.height}
          onError={() => setView({ status: 'error', message: unavailable })}
          className={selection.preset === 'detail' ? 'receipt-pdf-detail' : 'receipt-pdf-fit'} />}
      </div>
      <Field label="PDF-Passwort für diese Vorschau"
        hint="Nur während der geöffneten Vorschau. Es wird nicht gespeichert.">
        {({ id, describedBy }) => <TextInput id={id} aria-describedby={describedBy} type="password"
          autoComplete="off" maxLength={1024} disabled={busy} value={password}
          onChange={(event) => setPassword(event.target.value)} />}
      </Field>
      <Button variant="ghost" disabled={busy} onClick={() => load(selection.page)}>
        Vorschau erneut laden
      </Button>
    </>
  );
}

function PreviewSession({ receiptId }: { receiptId: string }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      opener.current?.focus({ preventScroll: true });
    }
  }, [open]);
  return open ? <PdfPage receiptId={receiptId} onClose={() => {
    restoreFocus.current = true;
    setOpen(false);
  }} /> : (
    <>
      <p>Die Vorschau zeigt eine Seite des Originals als Bild. Deine Prüfangaben bleiben erhalten.</p>
      <button ref={opener} type="button" className="btn btn-ghost"
        onClick={() => setOpen(true)}>PDF-Vorschau öffnen</button>
    </>
  );
}

/** Privacy/source/visibility changes unmount the entire session, including pixels and passwords. */
export function ReceiptPdfPreview({ receiptId, visible }: { receiptId: string; visible: boolean }) {
  const hidden = useAmountPrivacy();
  if (!visible) return null;
  return (
    <section className="receipt-pdf-preview" aria-label="Original-PDF">
      <h3>Original-PDF</h3>
      {hidden ? <p>Die PDF-Vorschau ist im Datenschutzmodus ausgeblendet.</p>
        : <PreviewSession key={receiptId} receiptId={receiptId} />}
    </section>
  );
}
