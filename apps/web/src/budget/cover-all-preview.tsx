import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Select } from '@budget/ui';
import { SettingsFormDialog } from '../pages/settings-form-dialog';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur } from '../ledger/format';
import { coverAll, previewCoverAll, type BudgetMonthView } from './budget-api';
import { coverSourceLabel, freeCoverCents, isCard, planRows } from './plan-model';
import { useBudgetWrite } from './use-category-writes';

/** Shared explicit preview/apply flow for Plan and month close. */
export function useCoverAllPreview(month: string, data: BudgetMonthView | undefined) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('suggested');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [failed, setFailed] = useState(false);
  const write = useBudgetWrite();
  const fromId = source === 'suggested' ? undefined : source === '' ? null : source;
  const preview = useQuery({
    queryKey: ['cover-preview', month, source, data?.previewBasis],
    queryFn: () => previewCoverAll(month, fromId),
    enabled: open,
    retry: false,
    staleTime: 0,
  });
  const close = () => {
    if (!submitting.current) setOpen(false);
  };
  const apply = async () => {
    if (submitting.current || !preview.data || preview.isFetching || failed) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await write(
        () => coverAll(month, fromId, preview.data.expectedBasis),
        (res) =>
          `${res.coveredCount} gedeckt, ${res.openCount} offen · ${eur(res.missingCents)} fehlen${res.openCount > 0 ? ' · auf freies Geld begrenzt' : ''}`,
      );
      if (result) setOpen(false);
      else setFailed(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    show: (initialSource = 'suggested') => {
      setSource(initialSource);
      setFailed(false);
      setOpen(true);
    },
    dialog: (
      <SettingsFormDialog
        open={open}
        title="Überzogene decken · Vorschau"
        onClose={close}
        beforeClose={() => !submitting.current}
      >
        <p>
          Prüfe Quellen und Beträge. Erst „Deckung anwenden“ verschiebt Geld; die Kontostände
          bleiben gleich.
        </p>
        <label htmlFor="cover-preview-source">Quelle für alle Überziehungen</label>
        <Select
          id="cover-preview-source"
          value={source}
          disabled={busy}
          onChange={(event) => {
            setSource(event.target.value);
            setFailed(false);
          }}
        >
          <option value="suggested">Vorschläge · größtes Guthaben zuerst</option>
          {(data?.summary.toBeAssignedCents ?? 0) > 0 && (
            <option value="">Zu verteilen · {eur(data!.summary.toBeAssignedCents)}</option>
          )}
          {data &&
            planRows(data)
              .filter((row) => !isCard(row) && freeCoverCents(row) > 0)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {coverSourceLabel(row)}
                </option>
              ))}
        </Select>
        {preview.isFetching && <LoadingNote what="Deckungsvorschau" />}
        {preview.isError && (
          <ErrorNote
            what="Deckungsvorschau"
            error={preview.error}
            onRetry={() => void preview.refetch()}
          />
        )}
        {preview.data && !preview.isFetching && !preview.isError && (
          <>
            <ul>
              {preview.data.moves.map((move, index) => (
                <li key={index}>
                  {move.fromName} → {move.toName}: <strong>{eur(move.amountCents)}</strong>
                </li>
              ))}
            </ul>
            <p>
              {preview.data.coveredCount} gedeckt · {preview.data.openCount} offen ·{' '}
              {eur(preview.data.missingCents)} bleiben offen
            </p>
          </>
        )}
        {failed && (
          <p role="alert">Deckung nicht angewendet. Vorschau aktualisieren und erneut prüfen.</p>
        )}
        <div className="panel-actions">
          <Button
            variant="ghost"
            disabled={busy || preview.isFetching}
            onClick={() => {
              setFailed(false);
              void preview.refetch();
            }}
          >
            Vorschau aktualisieren
          </Button>
          <Button
            disabled={
              busy || preview.isFetching || preview.isError || !preview.data?.moves.length || failed
            }
            onClick={() => void apply()}
          >
            Deckung anwenden
          </Button>
        </div>
      </SettingsFormDialog>
    ),
  };
}
