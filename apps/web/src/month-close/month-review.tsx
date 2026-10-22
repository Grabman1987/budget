import { useState } from 'react';
import { Button, privateAmount, useAmountPrivacy } from '@budget/ui';
import { todayInVienna, type CloseResultSnapshot } from '@budget/domain';
import { ChevronDown } from 'lucide-react';
import { eur, longDay, MINUS } from '../ledger/format';
import { ValuationHint } from '../ledger/valuation-hint';
import { monthLabel } from '../nav/month';
import { AllocationBar } from '../reports/allocation-bar';
import { OnePagerSheet } from '../reports/onepager-report';
import { AppLink } from '../shell/app-link';
import { useBudgetWrite } from '../budget/use-category-writes';
import { saveMonthClose, type MonthCloseView } from './api';

export function MonthReview({
  data,
  fresh,
  onReload,
}: {
  data: MonthCloseView;
  fresh: boolean;
  onReload: () => void;
}) {
  useAmountPrivacy();
  const result = data.result;
  const report = result
    ? { ...result.report, ...(data.incomplete && { incomplete: data.incomplete }) }
    : undefined;
  const write = useBudgetWrite();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const canClose =
    data.end <= todayInVienna() && data.steps.slice(0, 4).every((s) => s.status !== 'open');
  const close = async () => {
    if (busy || !fresh || !canClose || !result) return;
    setBusy(true);
    setFailed(false);
    const saved = await write(
      () => saveMonthClose(data.month, { close: true, sourceRevision: data.sourceRevision }),
      (response) =>
        response.changedCount === 0
          ? 'Dieser Abschlussstand ist bereits gespeichert.'
          : 'Monat abgeschlossen. Der geprüfte Stand ist gespeichert.',
    );
    setFailed(!saved);
    setBusy(false);
  };
  const check = report?.check;
  const openRules =
    check && !('unavailable' in check) ? check.rules.filter((r) => r.status !== 'ok') : [];
  return (
    <>
      <p>
        Prüfe die aktuellen Ergebnisse. Der Abschluss merkt diesen Stand und sperrt keine
        zusätzlichen Buchungen.
      </p>
      <AppLink to="/reports/onepager" search={{ monat: data.month }}>
        Monatsbericht und Zahlen im Report öffnen
      </AppLink>
      {data.state.closedOn && (
        <p role="status">
          {data.state.closedAt ? (
            <>
              Stand gespeichert am{' '}
              <time dateTime={data.state.closedAt}>
                {new Date(data.state.closedAt).toLocaleString('de-AT', {
                  timeZone: 'Europe/Vienna',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              .
            </>
          ) : (
            <>Abgeschlossen am {longDay(data.state.closedOn)}.</>
          )}{' '}
          Buchungen bleiben nach den bisherigen Regeln bearbeitbar.
        </p>
      )}
      {data.close.legacyMarker && (
        <p>
          Der frühere Abschluss enthält noch keinen gespeicherten Zahlenstand. Darunter stehen
          die zuletzt geladenen Zahlen.
        </p>
      )}
      {data.close.changedSinceClose && (
        <p role="status">
          Der Stand hat sich seit dem Abschluss geändert. Prüfe die offenen Schritte und speichere
          das Ergebnis anschließend erneut.
        </p>
      )}
      {result && report ? (
        <>
          <h3>
            {fresh ? 'Aktuelles Ergebnis' : 'Zuletzt geladenes Ergebnis'} · {monthLabel(data.month)}
          </h3>
          <p>Stand zum {longDay(data.asOf)}. Alle Zahlen stammen aus demselben Monatsstand.</p>
          <ValuationHint {...(data.incomplete && { incomplete: data.incomplete })} />
          <ResultMetrics
            figures={{
              checkedAccounts: result.checkedAccounts,
              totalAccounts: result.totalAccounts,
              deferredAccounts: result.deferredAccounts,
              assignedCents: result.assignedCents,
              overspentCount: result.overspentCount,
              overspentCents: result.overspentCents,
              carryInCents: result.carryInCents,
              destinationMonth: result.destinationMonth,
              savingsRateBp: report.result.savingsRateBp,
              allocationSavingsPercent: report.allocation.incomeCents > 0 ? report.allocation.shares.future : null,
              spentCents: report.pace.figures.spentCents,
              plannedCents: report.pace.figures.limitCents,
            }}
          />
          <h3>Verteilung 50/30/20</h3>
          <AllocationBar
            data={report.allocation}
            label="Verteilung des zugewiesenen Einkommens auf Monatsbasis"
          />
          <p>
            Bedarf {eur(report.allocation.needCents)} · Wunsch {eur(report.allocation.wantCents)} ·{' '}
            Zukunft {eur(report.allocation.futureCents)}. Zugewiesenes Geld auf Monatsbasis;
            periodische Kosten und Sonderzahlungen zählen als Zwölftel. Die Sparquote auf 50/30/20-Basis entspricht dem Zukunft-Anteil dieses Reports; die tatsächliche Sparquote steht getrennt darunter.
          </p>
          <details className="close-result-details">
            <summary>
              <ChevronDown aria-hidden="true" size={16} /> Monatsbericht, Abweichungen und offene Regeln
            </summary>
            <div className="mrep onepager-report">
              <OnePagerSheet data={report} linkVerdict />
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
          </details>
        </>
      ) : (
        <p>
          Für einen zukünftigen Monat gibt es noch kein Monatsergebnis. Du kannst die Schritte
          vorbereiten.
        </p>
      )}
      {data.state.snapshot && data.close.changedSinceClose && (
        <details className="close-result-details">
          <summary>
            <ChevronDown aria-hidden="true" size={16} /> Gespeicherte Abschlusszahlen ansehen
          </summary>
          <p>Historischer Stand; spätere Änderungen sind in den aktuellen Zahlen oben enthalten.</p>
          <ResultMetrics figures={data.state.snapshot} />
        </details>
      )}
      {failed && (
        <div role="alert">
          <p>
            Der Abschluss konnte nicht bestätigt werden. Lade den aktuellen Stand und prüfe ihn
            vor einem neuen Versuch.
          </p>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setFailed(false);
              onReload();
            }}
          >
            Stand aktualisieren
          </Button>
        </div>
      )}
      <div className="close-footer">
        <AppLink to="/plan/monat" search={{ monat: data.month }} className="btn btn-ghost">
          Verlassen
        </AppLink>
        {!canClose && (
          <p>
            Bearbeite zuerst die offenen Schritte. „Zu verteilen“ muss 0,00 € erreichen, und
            der Monatsletzte muss erreicht sein.
          </p>
        )}
        {(!data.state.closedOn || data.close.changedSinceClose || data.close.legacyMarker) && (
          <Button disabled={busy || !fresh || !canClose || !result} onClick={() => void close()}>
            {data.state.closedOn ? 'Geprüften Stand erneut speichern' : 'Monat abschließen'}
          </Button>
        )}
      </div>
    </>
  );
}
type ResultFigures = Pick<
  CloseResultSnapshot,
  | 'checkedAccounts'
  | 'totalAccounts'
  | 'deferredAccounts'
  | 'assignedCents'
  | 'overspentCount'
  | 'overspentCents'
  | 'carryInCents'
  | 'destinationMonth'
  | 'savingsRateBp'
  | 'allocationSavingsPercent'
  | 'spentCents'
  | 'plannedCents'
>;

function ResultMetrics({ figures: f }: { figures: ResultFigures }) {
  useAmountPrivacy();
  const rate = f.savingsRateBp;
  return (
    <dl className="close-result-metrics">
      <div>
        <dt>Geprüfte Konten</dt>
        <dd>
          {f.checkedAccounts} von {f.totalAccounts}
          {f.deferredAccounts > 0 && (
            <small>{f.deferredAccounts} mit Grund aufgeschoben, nicht abgeglichen.</small>
          )}
        </dd>
      </div>
      <div>
        <dt>Verteiltes Einkommen</dt>
        <dd>
          {eur(f.assignedCents)}
          <small>Zuweisungen im Monat, einschließlich zugewiesenem Guthaben.</small>
        </dd>
      </div>
      <div>
        <dt>Offene Überziehungen</dt>
        <dd>{f.overspentCount} · {eur(f.overspentCents)} fehlen</dd>
      </div>
      <div>
        <dt>Unverteiltes Geld in {monthLabel(f.destinationMonth)}</dt>
        <dd>
          {eur(f.carryInCents)}
          <small>Übertrag des unverteilten Geldes; Kategorie-Guthaben sind davon getrennt.</small>
        </dd>
      </div>
      {f.allocationSavingsPercent !== undefined && <div>
        <dt>Sparquote · 50/30/20</dt>
        <dd>{f.allocationSavingsPercent === null ? 'Ohne Einkommen nicht berechenbar'
          : privateAmount(`${f.allocationSavingsPercent < 0 ? MINUS : ''}${Math.abs(f.allocationSavingsPercent)} %`)}
          <small>Zukunft-Anteil des zugewiesenen Einkommens wie in der 50/30/20-Verteilung im Monatsreport.</small>
        </dd>
      </div>}
      <div>
        <dt>Tatsächliche Sparquote</dt>
        <dd>
          {rate === null
            ? 'Ohne Einkommen nicht berechenbar'
            : privateAmount(`${rate < 0 ? MINUS : ''}${Math.abs(Math.round(rate / 100))} %`)}
          <small>
            Wie im Monatsreport: tatsächlich Gespartes im Verhältnis zum Haushaltseinkommen.
          </small>
        </dd>
      </div>
      <div>
        <dt>Ausgaben vs. Plan</dt>
        <dd>
          {eur(f.spentCents)} · Plan {eur(f.plannedCents)}
          <small>Ausgaben im Monatsverlauf wie im Monatsreport; Plan für den ganzen Monat.</small>
        </dd>
      </div>
    </dl>
  );
}
