import { Button, WideDialog, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck, ListChecks } from 'lucide-react';
import { KontenMenu } from '../ledger/konten-menu';
import { useKontenSlot } from '../ledger/konten-frame';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import type { InboxEntry } from './api';
import type { PreparedBankSuggestion } from './bank-candidate';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { longDay, nativeCurrency } from '../ledger/format';

export function isBankInboxRow(item: InboxEntry) {
  return item.type === 'stored'
    ? item.refType === 'bank-sync-candidate' && !!item.refId
    : item.type === 'booking' && item.source === 'bank' && item.status !== 'reconciled';
}

type BulkRow = {
  type: 'candidate' | 'booking';
  id: string;
  suggestion?: Omit<PreparedBankSuggestion, 'label' | 'bulkSafe'>;
};
type Preview = {
  action: 'dismiss' | 'confirm';
  rows: BulkRow[];
  /** Rows the server will change; it refuses the batch when its own count differs. */
  changed: number;
  skipped: number;
  /** Booked rows that "nicht übernehmen" never removes. */
  keptBookings: number;
  /** Rows whose prepared merge target was already taken by an earlier selected row. */
  sharedTargets: number;
  selectedCount: number;
  safeOnly?: boolean;
};
const withoutLabel = (suggestion: PreparedBankSuggestion) => {
  const payload: Partial<PreparedBankSuggestion> = { ...suggestion };
  delete payload.label;
  delete payload.bulkSafe;
  return payload as Omit<PreparedBankSuggestion, 'label' | 'bulkSafe'>;
};

/** A narrower shortcut; explicit selected-row actions and server eligibility stay unchanged. */
export function safeBankRows(
  rows: InboxEntry[],
  prepared: (id: string) => PreparedBankSuggestion | undefined,
) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const suggestion = prepared(row.id);
    const safe =
      row.type === 'stored' &&
      row.refType === 'bank-sync-candidate' &&
      Boolean(row.refId && !seen.has(row.refId)) &&
      Number.isSafeInteger(row.bankCandidate?.amountCents) &&
      suggestion?.action === 'rule' &&
      Boolean(suggestion.candidateRevision) &&
      suggestion.bulkSafe === true;
    if (safe && row.type === 'stored' && row.refId) seen.add(row.refId);
    return safe;
  });
}

/** Pure preview: what a bulk action sends and how many selected rows it leaves alone. */
export function planBulk(
  action: 'dismiss' | 'confirm',
  chosen: InboxEntry[],
  prepared: (id: string) => PreparedBankSuggestion | undefined,
): Preview {
  const rows: BulkRow[] = [];
  const targets = new Set<string>();
  let keptBookings = 0,
    sharedTargets = 0;
  for (const row of chosen) {
    const type = row.type === 'booking' ? 'booking' : 'candidate';
    const id = row.type === 'booking' ? row.bookingId : row.type === 'stored' ? row.refId! : row.id;
    // "Nicht übernehmen" resolves bank candidates only; booked rows stay in the ledger.
    if (action === 'dismiss') {
      if (type === 'booking') keptBookings++;
      else rows.push({ type, id });
      continue;
    }
    const found = prepared(row.id);
    // Two rows cannot merge into the same own booking: the first keeps it, the others are skipped.
    if (found?.action === 'merge') {
      if (targets.has(found.bookingId)) {
        sharedTargets++;
        rows.push({ type, id });
        continue;
      }
      targets.add(found.bookingId);
    }
    rows.push({ type, id, ...(found ? { suggestion: withoutLabel(found) } : {}) });
  }
  const changed = action === 'dismiss' ? rows.length : rows.filter((row) => row.suggestion).length;
  return {
    action,
    rows,
    changed,
    skipped: chosen.length - changed,
    keptBookings,
    sharedTargets,
    selectedCount: chosen.length,
  };
}

export function BankBulkActions({
  rows,
  selected,
  onSelect,
  prepared,
  sourceId,
}: {
  rows: InboxEntry[];
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  prepared: (id: string) => PreparedBankSuggestion | undefined;
  sourceId: string;
}) {
  useAmountPrivacy();
  const safeSlot = useKontenSlot('inbox-safe');
  const selectionSlot = useKontenSlot('inbox-selection');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const chosen = rows.filter((row) => selected.has(row.id));
  const safe = safeBankRows(rows, prepared).slice(0, 100);
  const prepare = (action: 'dismiss' | 'confirm') => setPreview(planBulk(action, chosen, prepared));
  const safeAction = (
    <Button
      className="inbox-safe-action"
      disabled={busy || !safe.length}
      onClick={() => setPreview({ ...planBulk('confirm', safe, prepared), safeOnly: true })}
    >
      <CheckCheck size={16} aria-hidden="true" />
      Alle sicheren bestätigen ({safe.length})
    </Button>
  );
  const selectionControls = (
    <>
      {' '}
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
    </>
  );
  const selectionAction = (
    <KontenMenu
      className="bank-selection-menu"
      iconOnly
      label={`Auswahl (${chosen.length})`}
      icon={<ListChecks size={16} aria-hidden="true" />}
    >
      <div className="bank-selection-controls">{selectionControls}</div>
      <p>
        Als sicher zählen nur bereits vorbereitete Quellumsätze. Öffne eine Zeile, um Regel und
        mögliche Treffer zu prüfen.
      </p>
    </KontenMenu>
  );
  if (!rows.length) return null;
  return (
    <div className="bank-bulk-actions">
      {REDESIGN_ENABLED && (safeSlot ? createPortal(safeAction, safeSlot) : safeAction)}
      {REDESIGN_ENABLED
        ? selectionSlot
          ? createPortal(selectionAction, selectionSlot)
          : selectionAction
        : selectionControls}
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
            {preview?.selectedCount} ausgewählt · {preview?.changed}{' '}
            {preview?.action === 'dismiss' ? 'nicht übernehmen' : 'bestätigen'} · {preview?.skipped}{' '}
            übersprungen.
          </p>
          {preview?.action === 'confirm' && (
            <p>
              Nur bereits vorbereitete Vorschläge werden übernommen. Öffne weitere Zeilen, um ihre
              Vorschläge zu prüfen.
            </p>
          )}
          {preview?.safeOnly && (
            <>
              <p>
                Sicher für diese Sammelaktion sind offene Quellumsätze mit einer bereits
                vorbereiteten, eindeutig automatisch anwendbaren Regel und abgeschlossener
                Trefferprüfung. Umbuchungen, mögliche Duplikate, Zusammenführungen und mehrdeutige
                Treffer bleiben einzeln zu prüfen. Der aktuelle Quellen- und Regelstand wird beim
                Ausführen erneut geprüft.
              </p>
              <ul aria-label="Auswirkung der sicheren Vorschläge">
                {preview.rows.map((row) => {
                  const entry = rows.find(
                    (entry) => entry.type === 'stored' && entry.refId === row.id,
                  );
                  const candidate = entry?.type === 'stored' ? entry.bankCandidate : undefined;
                  return (
                    <li key={row.id}>
                      {candidate ? (
                        <>
                          {maskMoneyText(candidate.payeeName ?? candidate.memo)} ·{' '}
                          {maskMoneyText(candidate.accountName)} · {longDay(candidate.date)} ·{' '}
                          {nativeCurrency(candidate.amountCents, candidate.currency)}
                        </>
                      ) : (
                        'Quellendaten nicht mehr verfügbar – bitte neu prüfen.'
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {!!preview?.keptBookings && (
            <p>
              {preview.keptBookings} bereits gebuchte Zeilen bleiben unverändert: „Nicht übernehmen“
              löscht nie Buchungen.
            </p>
          )}
          {!!preview?.sharedTargets && (
            <p>
              {preview.sharedTargets} Zeilen haben dieselbe Zielbuchung wie eine frühere Zeile; nur
              die erste wird zusammengeführt.
            </p>
          )}
          <p>Alle Änderungen lassen sich gemeinsam rückgängig machen.</p>
          <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
            Abbrechen
          </Button>
          <Button
            disabled={busy || !preview?.changed}
            onClick={() => {
              if (!preview) return;
              setBusy(true);
              void write(
                () =>
                  request<{ groupId: string; changedCount: number; skippedCount: number }>(
                    'POST',
                    '/api/bank-sync/inbox/bulk',
                    {
                      action: preview.action,
                      sourceId,
                      expectedChanged: preview.changed,
                      rows: preview.rows,
                    },
                  ),
                (result) =>
                  `${result.changedCount} Bankzeilen ${preview.action === 'dismiss' ? 'nicht übernommen' : 'bestätigt'} · ${preview.skipped} übersprungen.`,
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
