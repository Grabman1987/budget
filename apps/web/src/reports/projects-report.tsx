import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import type { ReactNode } from 'react';
import { ChartValues, ChartValue, useAmountPrivacy, maskMoneyText } from '@budget/ui';
import './month-report.css';
import { cents } from '@budget/domain';
import { DimensionChain, Segmented } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { eur, eurParts } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { ReportFrame as PageFrame } from './report-frame';
import { AppLink } from '../shell/app-link';
import { shortMonth } from './month-frame';
import { ReportBodyDisclosure } from './report-body-disclosure';
import { PayrollProjectChart } from './payroll-project-chart';
import { projectsReportQuery } from './payroll-projects-api';
import { PERIOD_OPTIONS, ScrollRegion, useReportPeriod } from './spending-shared';
import './payroll-projects.css';
export function ProjectsReport({
  report,
  meta,
  viewControl,
}: {
  report: ReportEntry;
  meta: PageMeta;
  viewControl?: ReactNode;
}) {
  useAmountPrivacy();
  const [period, setPeriod] = useReportPeriod();
  const query = useQuery(projectsReportQuery(period));
  const data = query.isSuccess && !query.isFetching ? query.data : undefined;
  const supported = data && data.unsupportedBookingIds.length === 0;
  const maximum = Math.max(1, ...(data?.projects ?? []).map((p) => Math.abs(p.resultCents)));
  const parts = supported ? eurParts(data.total.resultCents) : undefined;
  return (
    <PageFrame
      sourceDate={data?.asOf}
      calculation={
        supported && data.months.length
          ? {
              label: 'Berechnung Projektergebnis',
              signed: true,
              terms: [
                { label: 'Projekteinnahmen', value: cents(data.total.incomeCents) },
                { op: '-', label: 'Projektkosten', value: cents(data.total.costCents) },
              ],
              result: {
                label: 'Projektergebnis · geschlossene Monate',
                value: data.total.resultCents,
                unit: 'money',
              },
            }
          : undefined
      }
      verdict={
        data && !query.isError
          ? {
              reportId: report.id,
              period: `${data.months[0]}..${data.months.at(-1)}`,
              unavailable: !supported || (REDESIGN_ENABLED && data.months.length === 0),
              metric: {
                label: 'Projektergebnis',
                value: data.total.resultCents,
                unit: 'money',
                better: 'higher',
              },
            }
          : undefined
      }
      meta={meta}
      reportControls={viewControl}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        data?.months.length
          ? `${shortMonth(data.months[0]!)} bis ${shortMonth(data.months.at(-1)!)}`
          : 'Geschlossene Monate · EUR'
      }
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <Segmented
              label="Zeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
            />
          ),
        },
      ]}
    >
      <div className="mrep pp-report" data-testid="projects-report">
        {query.isFetching && <LoadingNote what="Projekte" />}
        {query.isError && (
          <ErrorNote what="Projekte" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data && !supported && (
          <EmptyNote>
            Fremdwährungsbuchungen in Projekten oder Nebeneinkünften: Auswertung nicht verfügbar.
            Buchungswährungen prüfen.
          </EmptyNote>
        )}
        {supported && (
          <>
            <section className="mr-card mr-wide">
              <div className="tbd-head">
                <h2>Nebenprojekte</h2>
                <AppLink to="/einstellungen/projekte">Projekte verwalten</AppLink>
              </div>
              {data.months.length === 0 ? (
                <EmptyNote>Keine geschlossenen Monate im gewählten Zeitraum.</EmptyNote>
              ) : (
                <>
                  <div className="tbd-fig">
                    {parts?.whole}
                    <small>,{parts?.fraction} €</small>
                  </div>
                  <DimensionChain
                    precision="cent"
                    label="Projektergebnis"
                    terms={[
                      { label: 'Einnahmen', value: cents(data.total.incomeCents) },
                      { op: '-', label: 'Kosten', value: cents(data.total.costCents) },
                      {
                        op: '=',
                        label: 'Ergebnis',
                        value: cents(data.total.resultCents),
                        result: true,
                      },
                    ]}
                  />
                </>
              )}
              {REDESIGN_ENABLED && data.months.length > 0 && (
                <ul className="r8-project-bars" aria-label="Ergebnis je Projekt">
                  {data.projects.map((p) => (
                    <li key={p.id}>
                      <span>
                        {maskMoneyText(p.name)}
                        {p.archivedAt ? ' · archiviert' : ''}
                      </span>
                      <ChartValue
                        label={maskMoneyText(p.name)}
                        date={`${data.months[0]} · ${data.months.at(-1)}`}
                        series={[{ name: 'Projektergebnis', value: eur(p.resultCents) }]}
                      >
                        <span className="r8-project-track">
                          <i
                            style={{
                              width: `${(Math.abs(p.resultCents) / maximum) * 50}%`,
                              left: p.resultCents < 0 ? undefined : '50%',
                              right: p.resultCents < 0 ? '50%' : undefined,
                            }}
                          />
                        </span>
                      </ChartValue>
                      <strong>{eur(p.resultCents, { sign: true })}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <p className="vnote">
                Zuordnung über die Buchung. Erstattungen mindern Kosten; Umbuchungen,
                Kontaktausgleiche und Kapitalerträge zählen nicht zum Projektergebnis.
              </p>
            </section>
            <ReportBodyDisclosure id="projects-side" label="Nebeneinkünfte im Haushalt">
              <section className="mr-card mr-wide">
                <h2>Nebeneinkünfte im Haushalt</h2>
                <p>
                  {eur(data.sideIncome.incomeCents)} als eigene Einnahmenart, davon ohne
                  Projektzuordnung {eur(data.unassignedSideIncome.incomeCents)}.
                </p>
                <p className="vnote">
                  Diese Einnahmen sind bereits in den Haushaltseinnahmen enthalten. Das
                  Projektergebnis wird nicht nochmals als Einkommen addiert.
                </p>
                <AppLink to="/reports/einnahmen">Einnahmen nach Art öffnen</AppLink>
              </section>
            </ReportBodyDisclosure>
            <ReportBodyDisclosure
              id="projects-history"
              label="Projektverläufe und zugeordnete Buchungen"
            >
              <section className="mr-card mr-wide">
                <div className="pp-project-grid">
                  {data.projects.map((p, i) => (
                    <article key={p.id} className="pp-project">
                      <h2>
                        <span className="tech">{i + 1} · </span>
                        {REDESIGN_ENABLED ? maskMoneyText(p.name) : p.name}
                        {p.archivedAt ? ' · archiviert' : ''}
                      </h2>
                      <strong>{eur(p.resultCents, { sign: true })}</strong>
                      <PayrollProjectChart months={data.months} values={p.perMonth} />
                      <dl>
                        <div>
                          <dt>Einnahmen</dt>
                          <dd>{eur(p.incomeCents)}</dd>
                        </div>
                        <div>
                          <dt>Kosten</dt>
                          <dd>{eur(p.costCents)}</dd>
                        </div>
                        <div>
                          <dt>Zur Vorperiode</dt>
                          <dd>
                            {p.previous === null
                              ? 'nicht vergleichbar'
                              : eur(p.resultCents - p.previous, { sign: true })}
                          </dd>
                        </div>
                      </dl>
                      <details>
                        <summary>Buchungen ({p.bookingIds.length})</summary>
                        <ul>
                          {p.bookingIds.map((id, n) => (
                            <li key={id}>
                              <AppLink to="/konten/buchungen" search={{ buchung: id }}>
                                Buchung {n + 1} öffnen
                              </AppLink>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </article>
                  ))}
                </div>
                {data.projects.length === 0 && (
                  <EmptyNote>
                    Noch keine Projekte angelegt. Unter Einstellungen ein Projekt anlegen und
                    Buchungen zuordnen.
                  </EmptyNote>
                )}
              </section>
            </ReportBodyDisclosure>
            <ReportBodyDisclosure
              id="projects-months"
              label="Monatliche Projektergebnisse als Tabelle"
            >
              <section className="mr-card mr-wide">
                <h2>Je Monat</h2>
                <ChartValues
                  label="Monatliche Projektergebnisse"
                  points={data.months.map((m, i) => ({
                    x: 50,
                    date: m,
                    series: data.projects.map((p) => ({
                      name: p.name,
                      value: eur(p.perMonth[i] ?? 0),
                      color: (p.perMonth[i] ?? 0) < 0 ? 'var(--ink-2)' : 'var(--line)',
                    })),
                  }))}
                >
                  <ScrollRegion className="pp-scroll" label="Monatliche Projektergebnisse">
                    <table className="rtable">
                      <thead>
                        <tr>
                          <th>Projekt</th>
                          {data.months.map((m) => (
                            <th key={m} className="n">
                              {shortMonth(m)}
                            </th>
                          ))}
                          <th className="n">Summe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.projects.map((p) => (
                          <tr key={p.id}>
                            <th>{REDESIGN_ENABLED ? maskMoneyText(p.name) : p.name}</th>
                            {p.perMonth.map((v, i) => (
                              <td
                                key={i}
                                data-chart-point={i}
                                className={`n ${v > 0 ? 'pp-profit' : v < 0 ? 'pp-loss' : ''}`}
                              >
                                {eur(v, { sign: true })}
                              </td>
                            ))}
                            <td className="n">{eur(p.resultCents, { sign: true })}</td>
                          </tr>
                        ))}
                        <tr className="is-total">
                          <th>Zusammen</th>
                          {data.total.perMonth.map((v, i) => (
                            <td key={i} className="n">
                              {eur(v, { sign: true })}
                            </td>
                          ))}
                          <td className="n">{eur(data.total.resultCents, { sign: true })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </ScrollRegion>
                </ChartValues>
              </section>
            </ReportBodyDisclosure>
          </>
        )}
      </div>
    </PageFrame>
  );
}
