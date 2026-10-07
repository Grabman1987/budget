import type { PlanningAccuracyReport } from '@budget/db';
import { lastDayOfMonth } from '@budget/domain';
import { ChartValue, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { request } from '../api/http';
import { eur } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { monthLabel } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';
import './planning-accuracy-report.css';

type Summary = PlanningAccuracyReport['summary'];
export function AccuracyHeadline({
  summary,
  reliableFrom,
}: {
  summary: Summary;
  reliableFrom: string;
}) {
  useAmountPrivacy();
  return summary.count < 2 ? (
    <p role="status">Erst ab {monthLabel(reliableFrom)} belastbar (2–3 Monate Daten)</p>
  ) : (
    <h2>
      Trefferquote 6 Monate: {summary.hits} von {summary.count} · mittlere Abweichung{' '}
      {bpText(summary.meanAbsoluteBp)}
    </h2>
  );
}

export function PaceAccuracyNote({ summary }: { summary?: Summary | undefined }) {
  return summary && summary.count >= 3 ? (
    <p>
      Deine Hochrechnung lag zuletzt im Schnitt {bpText(summary.meanAbsoluteBp, { digits: 0 })}{' '}
      daneben.
    </p>
  ) : null;
}

export function PlanningAccuracyReportPage({
  report,
  meta,
}: {
  report: ReportEntry;
  meta: PageMeta;
}) {
  const [month, shift] = useMonth();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'planning-accuracy', month],
    retry: false,
    queryFn: () =>
      request<PlanningAccuracyReport>('GET', `/api/reports/planning-accuracy?month=${month}`),
  });
  useAmountPrivacy();
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis="Pace am 15. · Bedarf und Wunsch"
      reportStand={{ label: 'Stichtag', value: 'Abgeschlossene Monate' }}
      extraFields={[
        {
          label: 'Monat',
          value: (
            <span className="sr-month-switch">
              <button
                type="button"
                className="icon-btn"
                aria-label="Vormonat"
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span>{monthLabel(month)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Nächster Monat"
                onClick={() => shift(1)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </span>
          ),
        },
      ]}
    >
      <div className="sr accuracy-report" data-testid="planning-accuracy">
        <ReportQuery query={query} what="Budgettreue">
          {(data) => (
            <>
              <section className="sr-card sr-wide" aria-label="Trefferquote">
                <AccuracyHeadline summary={data.summary} reliableFrom={data.reliableFrom} />
                <p>
                  Abweichung = Prognose − Ist; Prozent bezogen auf Ist. Treffer: höchstens ±5 %. Der
                  Schnitt verwendet absolute Abweichungen der letzten sechs abgeschlossenen
                  Kalendermonate. Ohne positives Ist gibt es keine Prozentwertung. Bedarf und Wunsch
                  entsprechen Pace.
                </p>
                <p>
                  {data.summary.count} auswertbare Monate im Sechsmonatsfenster. Fehlende Prognosen
                  werden nicht nachträglich geschätzt.
                </p>
              </section>
              <section className="sr-card sr-wide" aria-labelledby="accuracy-months">
                <h2 id="accuracy-months">Prognose am 15. vs. Ist am Monatsende</h2>
                {data.months.length ? (
                  <>
                    <AccuracyBars months={data.months} />
                    <ScrollRegion label="Monatliche Prognoseabweichung">
                      <table className="sr-table">
                        <thead>
                          <tr>
                            <th scope="col">Monat</th>
                            <th scope="col">Prognose am 15.</th>
                            <th scope="col">Ist</th>
                            <th scope="col">Abweichung €</th>
                            <th scope="col">Abweichung %</th>
                            <th scope="col">Treffer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.months.map((r) => (
                            <tr key={r.month}>
                              <th scope="row">
                                <AppLink to="/reports/planungstreue" search={{ monat: r.month }}>
                                  {monthLabel(r.month)}
                                </AppLink>
                              </th>
                              <td>{eur(r.projectedCents)}</td>
                              <td>{eur(r.actualCents)}</td>
                              <td>{eur(r.deviationCents)}</td>
                              <td>{bpText(r.deviationBp, { sign: true })}</td>
                              <td>
                                {r.hit === null
                                  ? 'Nicht wertbar'
                                  : r.hit
                                    ? 'Ja · ≤5 %'
                                    : 'Nein · >5 %'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollRegion>
                  </>
                ) : (
                  <p role="status">
                    Noch keine gespeicherte Prognose für einen abgeschlossenen Monat.
                  </p>
                )}
              </section>
              <section className="sr-card sr-wide" aria-labelledby="accuracy-categories">
                <h2 id="accuracy-categories">{monthLabel(month)} · größte Abweichungen zuerst</h2>
                {data.categories.length ? (
                  <ScrollRegion label="Abweichungen je Kategorie">
                    <table className="sr-table">
                      <thead>
                        <tr>
                          <th scope="col">Kategorie</th>
                          <th scope="col">Plan am 15.</th>
                          <th scope="col">Ausgegeben am 15.</th>
                          <th scope="col">Prognose am 15.</th>
                          <th scope="col">Ist</th>
                          <th scope="col">Abweichung €</th>
                          <th scope="col">Abweichung %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.categories.map((r) => (
                          <tr key={r.categoryId}>
                            <th scope="row">
                              <AppLink
                                to="/konten/buchungen"
                                search={{
                                  kategorie: r.categoryId,
                                  von: `${month}-01`,
                                  bis: lastDayOfMonth(month),
                                }}
                              >
                                {r.name}
                              </AppLink>
                            </th>
                            <td>{eur(r.plannedCents)}</td>
                            <td>{eur(r.spentCents)}</td>
                            <td>{eur(r.projectedCents)}</td>
                            <td>{eur(r.actualCents)}</td>
                            <td>{eur(r.deviationCents)}</td>
                            <td>{bpText(r.deviationBp, { sign: true })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                ) : (
                  <p role="status">Für diesen Monat liegt noch kein Vergleich vor.</p>
                )}
              </section>
            </>
          )}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function AccuracyBars({ months }: { months: PlanningAccuracyReport['months'] }) {
  const shown = months.slice(-12);
  const max = Math.max(500, ...shown.map((m) => Math.abs(m.deviationBp ?? 0)));
  return (
    <div className="accuracy-bars" role="group" aria-label="Monatliche Abweichung in Prozent">
      {shown.map((m) => (
        <ChartValue
          key={m.month}
          label="Abweichung"
          date={m.month}
          series={[
            {
              name: 'Prognose − Ist',
              value: bpText(m.deviationBp, { sign: true }),
              color: 'var(--line)',
            },
          ]}
        >
          <div className="accuracy-bar-column">
            <div className="accuracy-bar-track" aria-hidden="true">
              <i
                style={{
                  height: `${(Math.abs(m.deviationBp ?? 0) / max) * 50}%`,
                  top: m.deviationBp !== null && m.deviationBp < 0 ? '50%' : undefined,
                  bottom: m.deviationBp !== null && m.deviationBp >= 0 ? '50%' : undefined,
                }}
              />
            </div>
            <span>{monthShort(m.month)}</span>
            <strong>{bpText(m.deviationBp, { sign: true })}</strong>
          </div>
        </ChartValue>
      ))}
    </div>
  );
}
