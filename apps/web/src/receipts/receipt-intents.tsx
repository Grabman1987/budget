import { Button } from '@budget/ui';
import { useCallback, useEffect, useState } from 'react';
import { listReceiptIntents, type ReceiptIntent } from '../pwa/receipt-store';

/** Plain-language delivery state of a queued receipt file; never exposes technical diagnostics. */
export function receiptIntentState(item: Pick<ReceiptIntent, 'uncertain' | 'reason'>): {
  tone: 'pending' | 'uncertain' | 'failed';
  label: string;
  detail: string;
} {
  switch (item.reason) {
    case 'login_required':
      return {
        tone: 'failed',
        label: 'Anmeldung nötig',
        detail: 'Die Datei bleibt auf diesem Gerät, bis du dich angemeldet hast.',
      };
    case 'rejected':
      return {
        tone: 'failed',
        label: 'Abgelehnt',
        detail: 'Der Server hat die Datei nicht angenommen. Verwirf sie oder versuche es erneut.',
      };
    case 'conflict':
      return {
        tone: 'failed',
        label: 'Konflikt',
        detail: 'Diese Datei wurde mit anderem Inhalt schon einmal gesendet. Verwirf sie.',
      };
    case 'server_unavailable':
      return {
        tone: 'uncertain',
        label: 'Server nicht erreichbar',
        detail: 'Unsicher, ob die Datei angekommen ist. Erneut senden ist gefahrlos.',
      };
    case 'network':
      return {
        tone: 'uncertain',
        label: 'Verbindung unterbrochen',
        detail:
          'Unsicher, ob die Datei angekommen ist. Erneut senden legt keinen zweiten Beleg an.',
      };
    default:
      return item.uncertain
        ? {
            tone: 'uncertain',
            label: 'Unsicher',
            detail: 'Unsicher, ob die Datei angekommen ist. Erneut senden ist gefahrlos.',
          }
        : {
            tone: 'pending',
            label: 'Wartet auf Senden',
            detail: 'Die Datei ist auf diesem Gerät gespeichert und noch nicht gesendet.',
          };
  }
}

/** Device-local receipt files for this target; call refresh() after every action. */
export function useReceiptIntents(bookingId?: string) {
  const [items, setItems] = useState<ReceiptIntent[]>([]);
  const read = useCallback(
    () =>
      listReceiptIntents().then(
        (rows) => rows.filter((row) => (row.bookingId ?? null) === (bookingId ?? null)),
        () => [],
      ),
    [bookingId],
  );
  const refresh = useCallback(async () => setItems(await read()), [read]);
  useEffect(() => {
    let live = true;
    void read().then((rows) => live && setItems(rows));
    return () => {
      live = false;
    };
  }, [read]);
  return { items, refresh };
}

export function ReceiptIntentList({
  items,
  busy,
  unsaved,
  onRetry,
  onCancel,
  onRetryUnsaved,
  onDiscardUnsaved,
}: {
  items: ReceiptIntent[];
  busy: boolean;
  unsaved: File | null;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRetryUnsaved: () => void;
  onDiscardUnsaved: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!items.length && !unsaved) return null;
  return (
    <div className="receipt-intents" role="region" aria-label="Belegdateien auf diesem Gerät">
      {unsaved && (
        <div
          className="receipt-intent"
          data-tone="failed"
          data-testid="receipt-unsaved"
          role="alert"
        >
          <p className="receipt-intent-state">
            <strong>Nicht gespeichert</strong> · {unsaved.name}
          </p>
          <p className="receipt-hint">
            Der Gerätespeicher ist voll oder nicht verfügbar. Die Datei ist noch ausgewählt, aber
            nicht gesichert. Schaffe Platz und versuche es erneut.
          </p>
          <div className="receipt-actions">
            <Button variant="ghost" disabled={busy} onClick={onRetryUnsaved}>
              Erneut speichern
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onDiscardUnsaved}>
              Verwerfen
            </Button>
          </div>
        </div>
      )}
      {items.map((item) => {
        const state = receiptIntentState(item);
        return (
          <div
            className="receipt-intent"
            data-tone={state.tone}
            data-testid="receipt-intent"
            key={item.id}
          >
            <p className="receipt-intent-state" role="status">
              <strong>{state.label}</strong> · {item.filename}
              <small> · {Math.max(1, Math.ceil(item.file.size / 1024))} KB</small>
            </p>
            <p className="receipt-hint">{state.detail}</p>
            <div className="receipt-actions">
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={`Beleg ${item.filename} erneut senden`}
                onClick={() => onRetry(item.id)}
              >
                Erneut senden
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={`Beleg ${item.filename} von diesem Gerät verwerfen`}
                onClick={() =>
                  state.tone === 'uncertain' ? setConfirming(item.id) : onCancel(item.id)
                }
              >
                Verwerfen
              </Button>
            </div>
            {confirming === item.id && (
              <div role="alert" data-testid="receipt-cancel-confirm">
                <p className="receipt-hint">
                  Die Datei ist möglicherweise schon beim Server angekommen und liegt dann unter
                  „Prüfen“. Wirklich nur die Kopie auf diesem Gerät verwerfen?
                </p>
                <div className="receipt-actions">
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null);
                      onCancel(item.id);
                    }}
                  >
                    Trotzdem verwerfen
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="receipt-hint">
        Nicht gesendete Belegdateien liegen unverschlüsselt im Speicher dieser App auf diesem Gerät
        und können vom Browser bei Platzmangel entfernt werden. Beim Abmelden werden sie gelöscht.
        Verwerfen entfernt nur die Datei vom Gerät, die gespeicherte Buchung bleibt unverändert.
      </p>
    </div>
  );
}
