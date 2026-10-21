import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { readBookingDeletePreview, type BookingDeletePreview, type BulkSelectionItem } from './api';
import { longDay, nativeCurrency } from './format';
import { errorText, SKIP_REASON_LABEL } from './labels';
import { ErrorNote, LoadingNote } from './states';

/** Mounted inside the existing dialog; a preview never follows background cache invalidation. */
export function BookingDeletePreviewPanel({ ids, mode = 'bulk', initialPreview, pending, onConfirm, onCancel }: {
  ids: string[];
  mode?: 'bulk' | 'single';
  initialPreview?: BookingDeletePreview;
  pending: boolean;
  onConfirm: (preview: BookingDeletePreview, unlock: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  useAmountPrivacy();
  const instance = useId(), heading = useRef<HTMLHeadingElement>(null);
  const [fixedIds] = useState(() => [...new Set(ids)].sort());
  const [busy, setBusy] = useState(false), [stale, setStale] = useState(false), [failure, setFailure] = useState('');
  const [unlock, setUnlock] = useState(false);
  const accepting = useRef(false);
  const query = useQuery({
    queryKey: ['booking-delete-preview', mode, instance],
    queryFn: () => readBookingDeletePreview(fixedIds, mode),
    ...(initialPreview ? { initialData: initialPreview } : {}),
    enabled: false, staleTime: Infinity, gcTime: 0, retry: false,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const { refetch } = query;
  useEffect(() => { if (!initialPreview) void refetch(); }, [initialPreview, refetch]);
  useEffect(() => { heading.current?.focus(); }, []);
  const preview = query.data;
  const matches = !!preview && preview.mode === mode && /^[a-f0-9]{64}$/.test(preview.revision) &&
    preview.ids.length === fixedIds.length && preview.ids.every((id, index) => id === fixedIds[index]);
  const waiting = pending || busy || query.isFetching;
  const canDelete = !!preview && matches && !query.isError && !waiting && !stale && !preview.blocked && preview.eligibleIds.length > 0 &&
    (!preview.requiresUnlock || unlock);
  const reload = async () => {
    if (accepting.current || pending) return;
    setFailure(''); setUnlock(false);
    const result = await query.refetch();
    if (result.isSuccess) setStale(false);
  };
  const confirm = async () => {
    if (!canDelete || !preview || accepting.current) return;
    accepting.current = true; setBusy(true); setFailure('');
    try { await onConfirm(preview, unlock); }
    catch (error) {
      if (error instanceof ApiError && error.code === 'stale_delete_preview') setStale(true);
      setFailure(errorText(error));
    } finally { accepting.current = false; setBusy(false); }
  };
  const row = (item: BulkSelectionItem) => <>
    {item.description} · {longDay(item.date)} · {item.amountCents === null ? 'Betrag nicht verfügbar' : nativeCurrency(item.amountCents, item.currency, true)} · {item.accountName} · {item.id}
  </>;
  const totals = (values: BookingDeletePreview['eligibleTotals']) => values.length
    ? values.map((total) => total.cents === null ? `${total.currency}: nicht darstellbar` : nativeCurrency(total.cents, total.currency, true)).join(' · ')
    : 'keine Buchungen';
  return <form onSubmit={(event) => event.preventDefault()} className="bkform kdelete-preview" aria-labelledby={`${instance}-title`} aria-busy={waiting}>
    <div className="bk-head"><h2 ref={heading} id={`${instance}-title`} tabIndex={-1}>Löschen bestätigen</h2></div>
    <div className="bk-body">
      {query.isPending && <LoadingNote what="Löschvorschau" />}
      {query.isError && <ErrorNote what="Löschvorschau" error={query.error} onRetry={() => void reload()} />}
      {matches && preview && <>
        <p>{mode === 'bulk' ? `${fixedIds.length} ausgewählt` : 'Eine Buchung ausgewählt'} · {preview.eligibleIds.length} werden gelöscht · {mode === 'bulk' ? preview.skipped.length : preview.blocked ? preview.selection.items.length : 0} bleiben erhalten.</p>
        <p>Summe der Auswahl{mode === 'single' && preview.affectedIds.length > 1 ? ' einschließlich verknüpfter Seiten' : ''}: {preview.selection.missingIds.length ? 'nicht vollständig verfügbar' : totals(preview.selection.totals)}</p>
        <p>Summe der zu löschenden Buchungen: {totals(preview.eligibleTotals)}</p>
        {mode === 'bulk' && <p>Gesperrte und verknüpfte Buchungen bleiben erhalten. Falls eine weitere Buchung beim Löschen abgelehnt wird, erscheint sie mit Grund im Ergebnis. Rückgängig stellt die tatsächlich gelöschten Buchungen gemeinsam wieder her.</p>}
        {mode === 'single' && <>
          {preview.affectedIds.length > 1 && <p>Die verknüpften Seiten der Umbuchung werden gemeinsam gelöscht und mit einer Aktion wiederhergestellt.</p>}
          {preview.expectedLinkCount > 0 && <p>{preview.expectedLinkCount} Zuordnungen zu erwarteten Zahlungen werden gelöst und beim Rückgängig wiederhergestellt.</p>}
          <ul>{preview.selection.items.map((item) => <li key={item.id}>{row(item)}{item.reason && <> · {SKIP_REASON_LABEL[item.reason]}</>}</li>)}</ul>
          {preview.requiresUnlock && !preview.blocked && <label className="kcheck"><input type="checkbox" checked={unlock} disabled={waiting} onChange={(event) => setUnlock(event.target.checked)} />Geprüfte Buchungen ausdrücklich zum Löschen freigeben</label>}
          {preview.blocked === 'protected_link' && <p role="alert">Die Buchung gehört zu einer geschützten Aktion. Nimm zuerst die zugehörige Aktion vollständig zurück. Diese Vorschau kann die Sperre nicht aufheben.</p>}
          {preview.blocked === 'not_found' && <p role="alert">Die Buchung ist nicht mehr verfügbar.</p>}
          {preview.blocked === 'invalid' && <p role="alert">Der Betrag ist nicht sicher darstellbar. Die Buchung wird nicht gelöscht.</p>}
        </>}
        {mode === 'bulk' && preview.skipped.length > 0 && <section aria-label="Übersprungene Buchungen"><h3>Bleiben erhalten</h3><ul>{preview.skipped.map((skip) => <li key={skip.id}>
          {skip.booking ? row(skip.booking) : <>Buchung nicht mehr verfügbar · {skip.id}</>} · {SKIP_REASON_LABEL[skip.reason]}
        </li>)}</ul></section>}
      </>}
      {preview && !matches && <p role="alert">Die Vorschau stimmt nicht mit der Auswahl überein. Bitte neu laden.</p>}
      {failure && <p role="alert">{failure}</p>}
      {stale && <p role="status">Die Auswahl wurde geändert. Lade die Vorschau neu und bestätige den neuen Stand ausdrücklich.</p>}
    </div>
    <div className="bk-foot">
      <Button variant="ghost" disabled={waiting} onClick={onCancel}>Abbrechen</Button>
      {(stale || query.isError || (!!preview && !matches)) && <Button variant="ghost" disabled={waiting} onClick={() => void reload()}>Vorschau neu laden</Button>}
      <Button disabled={!canDelete} onClick={() => void confirm()}>Jetzt löschen</Button>
    </div>
  </form>;
}
