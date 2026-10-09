import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@budget/ui';
import { todayInVienna } from '@budget/domain';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { onePagerQuery } from '../reports/month-api';
import { OnePagerSheet } from '../reports/onepager-report';
import { AppLink } from '../shell/app-link';
import { useBudgetWrite } from '../budget/use-category-writes';
import { saveMonthClose, type MonthCloseView } from './api';

export function MonthReview({ data }: { data: MonthCloseView }) {
  const report = useQuery(onePagerQuery(data.month));
  const write = useBudgetWrite();
  const [busy, setBusy] = useState(false);
  const canClose =
    data.end <= todayInVienna() && data.steps.slice(0, 4).every((s) => s.status !== 'open');
  const close = async () => {
    setBusy(true);
    await write(
      () => saveMonthClose(data.month, { close: true }),
      () => 'Monat abgeschlossen. Der Plan für den nächsten Monat steht.',
    );
    setBusy(false);
  };
  const check = report.data?.check;
  const openRules =
    check && !('unavailable' in check) ? check.rules.filter((r) => r.status !== 'ok') : [];
  return (
    <>
      <p>
        Prüfe den Monatsbericht und die größten Abweichungen. Der Abschluss setzt einen Marker; du
        kannst später weiter bearbeiten.
      </p>
      <AppLink to="/reports/onepager" search={{ monat: data.month }}>
        Monatsbericht und Zahlen im Report öffnen
      </AppLink>
      {data.state.closedOn && (
        <p role="status">
          Abgeschlossen am {longDay(data.state.closedOn)}. Buchungen bleiben bearbeitbar.
        </p>
      )}
      {report.isPending && <LoadingNote what="Monatsbericht" />}
      {report.isError && (
        <ErrorNote
          what="Monatsbericht"
          error={report.error}
          onRetry={() => void report.refetch()}
        />
      )}
      {report.data && (
        <>
          <div className="mrep onepager-report">
            <OnePagerSheet data={report.data} linkVerdict />
          </div>
          <h3>Die drei größten Abweichungen</h3>
          <p>
            Ist minus Plan, nach Betrag gereiht. Plan enthält Übertrag und Zuweisung; ein Minus
            bedeutet weniger als geplant.
          </p>
          <ul className="close-deviations">
            {data.deviations.map((r) => (
              <li key={r.categoryId}>
                <AppLink
                  to="/reports/kategorien"
                  search={{ monat: data.month, kategorie: r.categoryId }}
                >
                  {r.name}: {eur(r.deltaCents, { sign: true })} · Plan {eur(r.planCents)} · Ist{' '}
                  {eur(r.actualCents)}
                </AppLink>
              </li>
            ))}
            {!data.deviations.length && <li>Keine Abweichung zwischen Plan und Ist.</li>}
          </ul>
          <h3>Diese Regelbefunde bleiben offen</h3>
          <p>
            Stand zum {longDay(data.asOf)}. Ein Monatsabschluss erledigt keine Regel automatisch.
          </p>
          {check && 'unavailable' in check ? (
            <p>{check.unavailable.message}</p>
          ) : (
            <ul className="close-open-rules">
              {openRules.map((r) => (
                <li key={r.code}>
                  <AppLink to="/reports/finanzcheck" search={{ monat: data.month }}>
                    {r.code} · {r.name} ·{' '}
                    {r.status === 'warn'
                      ? 'Warnung'
                      : r.status === 'bad'
                        ? 'verletzt'
                        : 'nicht bewertbar'}
                  </AppLink>
                </li>
              ))}
              {!openRules.length && <li>Keine offenen Regelbefunde.</li>}
            </ul>
          )}
        </>
      )}
      <div className="close-footer">
        <AppLink to="/plan/monat" search={{ monat: data.month }} className="btn btn-ghost">
          Verlassen
        </AppLink>
        {!canClose && !data.state.closedOn && (
          <p>
            Bearbeite zuerst die offenen Schritte. „Noch zu verteilen“ muss 0,00 € erreichen, und
            der Monatsletzte muss erreicht sein.
          </p>
        )}
        {!data.state.closedOn && (
          <Button disabled={busy || !canClose || !report.data} onClick={() => void close()}>
            Monat abschließen
          </Button>
        )}
      </div>
    </>
  );
}
