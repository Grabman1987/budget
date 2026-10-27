import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { readDeletePreview, type BookingDeletePreview } from './api';
import { longDay, nativeCurrency, pluralBookings } from './format';
import { errorText, SKIP_REASON_LABEL } from './labels';
import { LEDGER_KEY } from './queries';
import { ErrorNote, LoadingNote } from './states';

/** The mounted confirmation owns one exact selection; every new selection mounts a fresh read. */
export function BookingDeleteConfirmation({
  ids,
  onCancel,
  onConfirm,
}: {
  ids: string[];
  onCancel: () => void;
  onConfirm: (preview: BookingDeletePreview) => Promise<void>;
}) {
  useAmountPrivacy();
  const [fixedIds] = useState(() => [...ids].sort());
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [stale, setStale] = useState(false);
  const accepting = useRef(false);
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'delete-preview', fixedIds.join('|')],
    queryFn: () => readDeletePreview(fixedIds),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const preview = query.data;
  const matches =
    preview?.ids.length === fixedIds.length &&
    preview.ids.every((id, index) => id === fixedIds[index]);
  const waiting = busy || query.isFetching;
  const totals = (values: BookingDeletePreview['eligibleTotals']) =>
    values.length
      ? values
          .map((value) =>
            value.cents === null
              ? `${value.currency}: nicht darstellbar`
              : nativeCurrency(value.cents, value.currency, true),
          )
          .join(' · ')
      : 'keine Buchungen';
  const reload = async () => {
    setFailure('');
    const result = await query.refetch();
    if (result.isSuccess) setStale(false);
  };
  const confirm = async () => {
    if (
      !preview ||
      !matches ||
      waiting ||
      stale ||
      !preview.eligibleIds.length ||
      accepting.current
    )
      return;
    accepting.current = true;
    setBusy(true);
    setFailure('');
    try {
      await onConfirm(preview);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'stale_delete_preview') setStale(true);
      setFailure(errorText(error));
    } finally {
      accepting.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className="bkform kdelete-preview"
      aria-busy={waiting}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="bk-head">
        <h2>Löschen bestätigen</h2>
      </div>
      <div className="bk-body">
        {query.isPending && <LoadingNote what="Löschvorschau" />}
        {query.isError && (
          <ErrorNote what="Löschvorschau" error={query.error} onRetry={() => void reload()} />
        )}
        {preview && matches && (
          <>
            <p>{pluralBookings(preview.eligibleIds.length)} löschen?</p>
            <p>
              {preview.ids.length} ausgewählt · {preview.eligibleIds.length} werden gelöscht ·{' '}
              {preview.skipped.length} bleiben erhalten.
            </p>
            <p>
              Summe der Auswahl:{' '}
              {preview.selection.missingIds.length
                ? 'nicht vollständig verfügbar'
                : totals(preview.selection.totals)}
            </p>
            <p>Summe der zu löschenden Buchungen: {totals(preview.eligibleTotals)}</p>
            {preview.affectedIds.length > preview.ids.length && (
              <p>Die Vorschau enthält auch die nicht ausgewählten Gegenseiten der Umbuchungen.</p>
            )}
            <p>
              Umbuchungspaare werden gemeinsam gelöscht. Gesperrte und geschützte Buchungen bleiben
              erhalten. Ein Rückgängig stellt die tatsächlich gelöschten Buchungen gemeinsam wieder
              her.
            </p>
            {preview.skipped.length > 0 && (
              <section aria-label="Übersprungene Buchungen">
                <h3>Bleiben erhalten</h3>
                <ul>
                  {preview.skipped.map(({ id, reason, booking }) => (
                    <li key={id}>
                      {booking ? (
                        <>
                          {booking.description} · {longDay(booking.date)} ·{' '}
                          {booking.amountCents === null
                            ? 'Betrag nicht verfügbar'
                            : nativeCurrency(booking.amountCents, booking.currency, true)}{' '}
                          · {booking.accountName} ·{' '}
                        </>
                      ) : (
                        'Buchung nicht mehr verfügbar · '
                      )}
                      {id} · {SKIP_REASON_LABEL[reason]}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {preview && !matches && (
          <p role="alert">Die Vorschau passt nicht zur Auswahl. Bitte neu laden.</p>
        )}
        {failure && <p role="alert">{failure}</p>}
        {stale && (
          <p role="status">
            Lade die geänderte Vorschau neu und bestätige den neuen Stand ausdrücklich.
          </p>
        )}
      </div>
      <div className="bk-foot">
        <Button variant="ghost" disabled={waiting} onClick={onCancel}>
          Abbrechen
        </Button>
        {(stale || query.isError || (preview && !matches)) && (
          <Button variant="ghost" disabled={waiting} onClick={() => void reload()}>
            Vorschau neu laden
          </Button>
        )}
        <Button
          disabled={
            !preview || !matches || waiting || query.isError || stale || !preview.eligibleIds.length
          }
          onClick={() => void confirm()}
        >
          Ja, löschen
        </Button>
      </div>
    </form>
  );
}
