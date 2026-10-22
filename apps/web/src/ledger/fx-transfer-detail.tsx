import { Button, Field, TextInput, useAmountPrivacy } from '@budget/ui';
import { todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { deleteBooking } from './api';
import { accountsQuery, lookupsQuery, LEDGER_KEY } from './queries';
import { ErrorNote, LoadingNote } from './states';
import { fetchFxTransfer } from './fx-transfer-api';
import { FxReportingEffect, FxTransferReadout } from './fx-transfer-readout';
import './fx-transfer-preparation.css';

export function FxTransferDetailPage() {
  useAmountPrivacy();
  const { bookingId } = useParams({ strict: false }) as { bookingId: string };
  const [asOf, setAsOf] = useState(todayInVienna);
  const [askDelete, setAskDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const write = useBudgetWrite();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(asOf) && Number.isFinite(Date.parse(`${asOf}T00:00:00Z`)) &&
    new Date(`${asOf}T00:00:00Z`).toISOString().startsWith(asOf) && asOf <= todayInVienna();
  const detail = useQuery({ queryKey: [...LEDGER_KEY, 'manual-fx', bookingId, asOf],
    enabled: validDate, queryFn: () => fetchFxTransfer(bookingId, asOf) });
  const data = validDate ? detail.data : undefined;
  const names = Object.fromEntries((accounts.data?.accounts ?? []).map((row) => [row.id, row.name]));
  const categoryNames = Object.fromEntries((lookups.data?.categories ?? []).map((row) => [row.id, row.name]));
  const remove = async () => {
    if (saving.current || !data || data.deleted || detail.isFetching || detail.isError) return;
    saving.current = true; setBusy(true);
    await write(() => deleteBooking(data.fromBookingId), () => 'FX-Hauptbeträge und tatsächliche Gebühr gemeinsam gelöscht.');
    // Resolve a lost delete response by reading the retained identities, never by recreating money.
    void detail.refetch();
    saving.current = false; setBusy(false); setAskDelete(false);
  };
  return <PageFrame meta={KONTEN_BUCHUNGEN_META} title="Gespeicherter Fremdwährungsübertrag" subtitle="Originalbeträge, Kursnachweis und EUR-Bewertung" detail>
    <div className="kview fx-preparation">
      <AppLink className="btn btn-ghost" to="/konten/buchungen">Zurück zu Buchungen</AppLink>
      <Field label="Bewertungstag">{({ id }) => <TextInput id={id} type="date" min={data?.input.date}
        max={todayInVienna()} value={asOf} disabled={busy} onChange={(event) => { setAsOf(event.target.value); setAskDelete(false); }} />}</Field>
      {!validDate && <p role="alert">Bitte einen gültigen Bewertungstag bis heute wählen.</p>}
      {validDate && detail.isPending && <LoadingNote what="FX-Angaben" />}
      {detail.isError && <ErrorNote what="FX-Angaben" error={detail.error} onRetry={() => void detail.refetch()} />}
      {data && <>
        {data.deleted && <p role="status">Dieser Übertrag ist gelöscht oder rückgängig gemacht. Die folgenden Angaben sind der erhaltene Originalnachweis und keine aktiven Buchungen.</p>}
        <FxTransferReadout input={data.input} preview={{ valuation: data.recorded,
          quoteMatchesNative: data.quoteMatchesNative, theoreticalDestination: data.theoreticalDestination,
          quoteDifferenceDestination: data.quoteDifferenceDestination }} accountNames={names} categoryNames={categoryNames} />
        <FxReportingEffect asOf={data.reporting.asOf} from={data.reporting.from} to={data.reporting.to}
          effect={data.reporting.executionEffectEurCents} />
        <p>Finanzielle FX-Angaben bleiben an den Nachweis gebunden. Für eine Korrektur die gesamte Aktion rückgängig machen oder gemeinsam löschen und anschließend mit den tatsächlichen Angaben neu erfassen. Geprüfte Seiten müssen zuerst im bestehenden Kontoprüfungsablauf freigegeben werden.</p>
        <AppLink className="btn btn-ghost" to="/konten/fx-vorbereitung">Neuen Fremdwährungsübertrag erfassen</AppLink>
        {!data.deleted && (!askDelete ? <Button variant="ghost" disabled={busy || detail.isFetching || detail.isError} onClick={() => setAskDelete(true)}>Gesamten FX-Übertrag löschen …</Button> :
          <div role="group" aria-label="FX-Löschen bestätigen"><p>Beide Hauptbeträge und die getrennte tatsächliche Gebühr gemeinsam löschen?</p>
            <Button disabled={busy || detail.isFetching || detail.isError} onClick={() => void remove()}>Gemeinsam löschen</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAskDelete(false)}>Behalten</Button>
          </div>)}
      </>}
    </div>
  </PageFrame>;
}
