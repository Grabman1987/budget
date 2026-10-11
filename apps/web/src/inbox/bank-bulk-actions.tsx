import { Button, WideDialog } from '@budget/ui';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import type { InboxEntry } from './api';
import type { PreparedBankSuggestion } from './bank-candidate';

export function isBankInboxRow(item: InboxEntry) {
  return item.type === 'stored'
    ? item.refType === 'bank-sync-candidate' && !!item.refId
    : item.type === 'booking' && item.source === 'bank' && item.status !== 'reconciled';
}

export function BankBulkActions({
  rows,
  selected,
  onSelect,
  prepared,
}: {
  rows: InboxEntry[];
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  prepared: (id: string) => PreparedBankSuggestion | undefined;
}) {
  const [preview, setPreview] = useState<{
    action: 'dismiss' | 'confirm';
    rows: {
      type: 'candidate' | 'booking';
      id: string;
      suggestion?: Omit<PreparedBankSuggestion, 'label'>;
    }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const chosen = rows.filter((row) => selected.has(row.id));
  const prepare = (action: 'dismiss' | 'confirm') =>
    setPreview({
      action,
      rows: chosen.map((row) => {
        const suggestion = prepared(row.id);
        const payload = suggestion ? { ...suggestion } : undefined;
        if (payload) Reflect.deleteProperty(payload, 'label');
        return {
          type: row.type === 'booking' ? 'booking' : 'candidate',
          id: row.type === 'booking' ? row.bookingId : row.type === 'stored' ? row.refId! : row.id,
          ...(payload ? { suggestion: payload } : {}),
        };
      }),
    });
  const skipped =
    preview?.action === 'confirm' ? preview.rows.filter((row) => !row.suggestion).length : 0;
  const changed = (preview?.rows.length ?? 0) - skipped;
  if (!rows.length) return null;
  return (
    <div className="bank-bulk-actions">
      <label className="bank-select">
        <input
          type="checkbox"
          disabled={busy}
          checked={rows.every((row) => selected.has(row.id))}
          onChange={(event) =>
            onSelect(
              event.target.checked ? new Set(rows.slice(0, 100).map((row) => row.id)) : new Set(),
            )
          }
        />
        Alle auswählen
      </label>
      <span>{chosen.length} ausgewählt · bis zu 100 geladene Bankzeilen</span>
      <Button variant="ghost" disabled={busy || !chosen.length} onClick={() => prepare('dismiss')}>
        Auswahl nicht übernehmen
      </Button>
      <Button disabled={busy || !chosen.length} onClick={() => prepare('confirm')}>
        Auswahl mit vorbereitetem Vorschlag bestätigen
      </Button>
      <WideDialog
        open={!!preview}
        title="Bankauswahl prüfen"
        onClose={() => {
          if (!busy) setPreview(null);
        }}
        beforeClose={() => !busy}
      >
        <div className="bank-bulk-preview">
          <p>
            {preview?.rows.length} ausgewählt · {changed}{' '}
            {preview?.action === 'dismiss' ? 'nicht übernehmen' : 'bestätigen'} · {skipped}{' '}
            übersprungen.
          </p>
          {preview?.action === 'confirm' && (
            <p>
              Nur bereits vorbereitete Vorschläge werden übernommen. Öffne weitere Zeilen, um ihre
              Vorschläge zu prüfen.
            </p>
          )}
          <p>Alle Änderungen lassen sich gemeinsam rückgängig machen.</p>
          <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
            Abbrechen
          </Button>
          <Button
            disabled={busy || !changed}
            onClick={() => {
              if (!preview) return;
              setBusy(true);
              void write(
                () =>
                  request<{ groupId: string; changedCount: number; skippedCount: number }>(
                    'POST',
                    '/api/bank-sync/inbox/bulk',
                    preview,
                  ),
                (result) =>
                  `${result.changedCount} Bankzeilen ${preview.action === 'dismiss' ? 'nicht übernommen' : 'bestätigt'} · ${result.skippedCount} übersprungen.`,
              )
                .then((result) => {
                  if (result) {
                    onSelect(new Set());
                    setPreview(null);
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Wird verarbeitet …' : 'Auswahl jetzt ausführen'}
          </Button>
        </div>
      </WideDialog>
    </div>
  );
}
