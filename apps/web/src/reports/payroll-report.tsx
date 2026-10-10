import { ScrollRegion } from './spending-shared';
import { cents } from '@budget/domain';
import { Button, DimensionChain } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { eur, eurParts } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { AppLink } from '../shell/app-link';
import { MonthReportFrame, shortMonth, useReportMonth } from './month-frame';
import { payrollQuery, type PayrollData } from './payroll-projects-api';
import { PayrollProjectChart } from './payroll-project-chart';
import { PayslipPanel, PayslipUploadDialog } from './payslip-panel';
import { ReportDetailNav } from './report-detail-nav';
import './payroll-projects.css';

const pct = (ratio: number | null) =>
  ratio === null
    ? '–'
    : `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(ratio * 100).replace('-', '−')} %`;
const kindName = (p: { kind: string; specialType: string | null }) =>
  p.kind === 'regular'
    ? 'Laufendes Gehalt'
    : p.specialType === 'salary13'
      ? '13. Gehalt'
      : p.specialType === 'salary14'
        ? '14. Gehalt'
        : 'Sonderzahlung';
export function PayrollReport({
  report,
  meta,
  history = false,
}: {
  report: ReportEntry;
  meta: PageMeta;
  history?: boolean;
}) {
  const { month, shift, current } = useReportMonth();
  const query = useQuery(payrollQuery(month));
  const data = query.isSuccess && !query.isFetching ? query.data : undefined;
  const { gehaltszettel, zettel } = useSearch({ strict: false }) as {
    gehaltszettel?: string;
    zettel?: string;
  };
  const router = useRouter();
  const state = useLocation({ select: (location) => location.state });
  const navigate = useNavigate();
  const formOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!gehaltszettel && formOpener.current) {
      formOpener.current.focus({ preventScroll: true });
      formOpener.current = null;
    }
  }, [gehaltszettel]);
  const open = (id?: string, trigger?: HTMLElement) => {
    if (id && trigger) formOpener.current = trigger;
    if (!id && !gehaltszettel) return;
    if (!id && state.panelOpenedInApp) {
      router.history.back();
      return;
    }
    void navigate({
      to: '.',
      search: ((s: Record<string, unknown>) => ({ ...s, gehaltszettel: id })) as never,
      state: {
        reportDetailOpenedInApp: state.reportDetailOpenedInApp === true,
        panelOpenedInApp: !!id,
      },
      replace: !id,
    });
  };
  const panelData = query.isError ? undefined : query.data;
  const selected = panelData?.captured.find((p) => p.id === gehaltszettel);
  const parts = data ? eurParts(data.month.netCents) : undefined;
  const detailSlips = data
    ? zettel
      ? data.captured.filter((p) => p.id === zettel)
      : data.slips
    : [];
  const details = data && (
    <section className="mr-card">
      <div className="tbd-head">
        <h2>Gehaltszettel {shortMonth(detailSlips[0]?.month ?? month)}</h2>
      </div>
      {detailSlips.map((p) => (
        <div key={p.id} className="pp-slip">
          <h3>
            {shortMonth(p.month)} · {kindName(p)}
          </h3>
          <table className="rtable">
            <tbody>
              <tr>
                <th>Brutto ohne zusätzliche Bezüge</th>
                <td className="n">{eur(p.grossCents)}</td>
              </tr>
              {p.lines
                .filter((l) => l.section === 'earning')
                .map((l, i) => (
                  <tr key={i}>
                    <th>{l.label}</th>
                    <td className="n">{eur(l.amountCents)}</td>
                  </tr>
                ))}
              <tr>
                <th>{p.svCents < 0 ? 'SV-Erstattung (Aufrollung)' : 'SV-DN'}</th>
                <td className="n">{eur(-p.svCents, { sign: true })}</td>
              </tr>
              <tr>
                <th>{p.taxCents < 0 ? 'Lohnsteuer-Erstattung (Aufrollung)' : 'Lohnsteuer'}</th>
                <td className="n">{eur(-p.taxCents, { sign: true })}</td>
              </tr>
              {p.lines
                .filter((l) => ['deduction', 'tax_adjustment', 'sv_adjustment'].includes(l.section))
                .map((l, i) => (
                  <tr key={i}>
                    <th>{l.label}</th>
                    <td className="n">{eur(-l.amountCents)}</td>
                  </tr>
                ))}
              {p.lines
                .filter((l) => l.section === 'reimbursement')
                .map((l, i) => (
                  <tr key={`reimbursement-${i}`}>
                    <th>Steuerfreie Erstattung · {l.label}</th>
                    <td className="n">{eur(l.amountCents, { sign: true })}</td>
                  </tr>
                ))}
              <tr className="is-total">
                <th>Auszahlung</th>
                <td className="n">{eur(p.netCents)}</td>
              </tr>
            </tbody>
          </table>
          <LinkStatus data={data} id={p.id} />
          <Button variant="ghost" size="sm" onClick={(event) => open(p.id, event.currentTarget)}>
            Bearbeiten
          </Button>
        </div>
      ))}
    </section>
  );
  return (
    <MonthReportFrame
      verdict={
        data && !query.isError
          ? {
              reportId: report.id,
              period: month,
              metric: { label: 'Erfasstes Nettogehalt', value: data.month.netCents, unit: 'money' },
            }
          : undefined
      }
      report={report}
      meta={meta}
      month={month}
      shift={shift}
      current={current}
      asOf={data?.asOf}
      basis={query.isError ? 'nicht verfügbar' : 'Erfasste Gehaltszettel · EUR'}
    >
      <div className="mrep pp-report" data-testid="payroll-report">
        {history && (
          <ReportDetailNav
            to="/reports/gehalt"
            search={{ monat: month }}
            report="Gehaltsreport"
            title="Gehaltszettel-Historie"
          />
        )}
        {!history && (
          <div className="rtools">
            <AppLink
              className="pp-history-link"
              to="/reports/gehalt/historie"
              search={{ monat: month }}
              state={{ reportDetailOpenedInApp: true }}
            >
              Gehaltszettel-Historie
            </AppLink>
            <Button variant="ghost" onClick={(event) => open('upload', event.currentTarget)}>
              Gehaltszettel hochladen
            </Button>
          </div>
        )}
        {query.isFetching && <LoadingNote what="Gehaltsreport" />}
        {query.isError && (
          <ErrorNote
            what="Gehaltsreport"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data &&
          (history ? (
            <>
              <section className="mr-card mr-wide">
                <div className="tbd-head">
                  <h2>Gehaltszettel-Historie</h2>
                  <Button onClick={(event) => open('neu', event.currentTarget)}>
                    Gehaltszettel hinzufügen
                  </Button>
                </div>
                {data.captured.length === 0 && (
                  <EmptyNote>Noch keine Gehaltszettel erfasst.</EmptyNote>
                )}
                <ul className="pp-history">
                  {data.captured.map((p) => (
                    <li key={p.id}>
                      <AppLink
                        className="pp-history-link"
                        to="/reports/gehalt/historie"
                        search={{ monat: month, zettel: p.id }}
                      >
                        {shortMonth(p.month)} · {kindName(p)} · {eur(p.netCents)}
                      </AppLink>
                    </li>
                  ))}
                </ul>
                {zettel && detailSlips.length === 0 && (
                  <EmptyNote>Dieser Gehaltszettel ist nicht verfügbar.</EmptyNote>
                )}
              </section>
              {details}
            </>
          ) : (
            <>
              <section className="mr-card">
                <div className="tbd-head">
                  <h2>Auszahlung {shortMonth(month)}</h2>
                  <Button size="sm" onClick={(event) => open('neu', event.currentTarget)}>
                    Gehaltszettel hinzufügen
                  </Button>
                </div>
                {data.slips.length === 0 ? (
                  <EmptyNote>Für diesen Monat ist noch kein Gehaltszettel erfasst.</EmptyNote>
                ) : (
                  <>
                    <div className="tbd-fig">
                      {parts?.whole}
                      <small>,{parts?.fraction} €</small>
                    </div>
                    <DimensionChain
                      precision="cent"
                      label="Brutto zu Netto"
                      terms={[
                        { label: 'Brutto inkl. Zusätze', value: cents(data.month.grossCents) },
                        {
                          op: data.month.svCents < 0 ? '+' : '-',
                          label: data.month.svCents < 0 ? 'SV-Erstattung (Aufrollung)' : 'SV-DN',
                          value: cents(Math.abs(data.month.svCents)),
                        },
                        { op: '-', label: 'Lohnsteuer', value: cents(data.month.taxChargeCents) },
                        ...(data.month.taxRefundCents > 0
                          ? [
                              {
                                op: '+' as const,
                                label: 'Lohnsteuer-Erstattung (Aufrollung)',
                                value: cents(data.month.taxRefundCents),
                              },
                            ]
                          : []),
                        { op: '-', label: 'Sonstige Abzüge', value: cents(data.month.otherCents) },
                        {
                          op: '+',
                          label: 'Steuerfreie Erstattungen',
                          value: cents(data.month.reimbursementsCents),
                        },
                        {
                          op: '=',
                          label: 'Auszahlung',
                          value: cents(data.month.netCents),
                          result: true,
                        },
                      ]}
                    />
                    {data.month.grossCents > 0 &&
                      data.month.svCents >= 0 &&
                      data.month.taxRefundCents === 0 &&
                      data.month.salaryNetCents >= 0 && (
                        <div
                          className="pp-ratio"
                          role="img"
                          aria-label={`Abzugsquote ${pct(data.month.deductionRatio)}`}
                        >
                          {[
                            data.month.salaryNetCents,
                            data.month.svCents,
                            data.month.taxCents,
                            data.month.otherCents,
                          ].map((v, i) => (
                            <span key={i} className={`pp-ink-${i}`} style={{ flex: v || 0.001 }} />
                          ))}
                        </div>
                      )}
                    <p className="vnote">
                      Abzugsquote {pct(data.month.deductionRatio)} · SV {pct(data.month.svRatio)} ·
                      Lohnsteuer {pct(data.month.taxRatio)} · sonstige Abzüge{' '}
                      {pct(data.month.otherRatio)}
                    </p>
                    <p className="vnote">
                      Quoten auf Brutto ohne steuerfreie Erstattungen. Aufrollungen zählen mit
                      Vorzeichen; bei Brutto null ist die Quote nicht verfügbar. Das Anteilsband
                      entfällt bei negativen Abzügen oder einer Lohnsteuer-Erstattung.
                    </p>
                  </>
                )}
              </section>
              <section className="mr-card mr-wide">
                <div className="tbd-head">
                  <h2>Verlauf · laufendes Gehalt</h2>
                </div>
                <PayrollProjectChart
                  months={data.timeline.map((r) => r.month)}
                  values={data.timeline.map((r) => (r.recorded ? r.salaryNetCents : null))}
                  gross={data.timeline.map((r) => (r.recorded ? r.grossCents : null))}
                />
                <p className="vnote">
                  Tusche: Nettogehalt ohne steuerfreie Erstattungen · blasse Tusche: Brutto inkl.
                  Zusätze. Fehlende Zettel bleiben Lücken.
                </p>
              </section>
              <section className="mr-card mr-wide">
                <h2>Auszahlung je Monat und Jahr</h2>
                <ScrollRegion className="pp-scroll" label="Auszahlungen nach Kalenderjahr">
                  <table className="rtable">
                    <thead>
                      <tr>
                        <th>Monat</th>
                        {data.years.map((y) => (
                          <th key={y.year} className="n">
                            {y.year}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthlyPayouts.map((r) => (
                        <tr key={r.month}>
                          <th>{shortMonth(`2000-${r.month}`).split(' ')[0]}</th>
                          {r.years.map((y) => (
                            <td key={y.year} className="n">
                              {y.netCents === null ? '–' : eur(y.netCents)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="is-total">
                        <th>Summe erfasst</th>
                        {data.years.map((y) => (
                          <td key={y.year} className="n">
                            {eur(y.netCents)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </ScrollRegion>
              </section>
              <section className="mr-card mr-wide">
                <h2>Jahresgehälter</h2>
                <ScrollRegion className="pp-scroll" label="Jahresgehälter und Vorjahresvergleich">
                  <table className="rtable">
                    <thead>
                      <tr>
                        <th>Jahr / erfasste Monate</th>
                        <th className="n">Brutto</th>
                        <th className="n">Sonderzahlungen</th>
                        <th className="n">SV-DN</th>
                        <th className="n">Lohnsteuer</th>
                        <th className="n">Sonstige Abzüge</th>
                        <th className="n">Steuerfreie Erstattungen</th>
                        <th className="n">Auszahlung</th>
                        <th className="n">Abzugsquote</th>
                        <th className="n">Zuwachs / gleiche Monate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.years.map((y) => (
                        <tr key={y.year}>
                          <th>
                            {y.year} · {y.months}/12
                          </th>
                          {[
                            y.grossCents,
                            y.specialGrossCents,
                            y.svCents,
                            y.taxCents,
                            y.otherCents,
                            y.reimbursementsCents,
                            y.netCents,
                          ].map((v, i) => (
                            <td className="n" key={i}>
                              {eur(v)}
                            </td>
                          ))}
                          <td className="n">{pct(y.deductionRatio)}</td>
                          <td className="n">
                            {y.changeCents === null
                              ? 'nicht vergleichbar'
                              : `${eur(y.changeCents, { sign: true })} · ${pct(y.changeRatio)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollRegion>
                <p className="vnote">
                  Keine Hochrechnung. Bruttovergleich ohne steuerfreie Erstattungen und nur bei
                  erfassten gleichen Monaten und Zahlungsarten im Vorjahr.
                </p>
              </section>
              <section className="mr-card mr-wide">
                <h2>14 Gehälter · {month.slice(0, 4)}</h2>
                <ScrollRegion className="pp-scroll" label="Vierzehn Gehälter">
                  <table className="rtable">
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th className="n">Nettogehalt</th>
                        <th className="n">Steuerfreie Erstattungen</th>
                        <th className="n">Auszahlung</th>
                        <th>Zettel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salaries.map((s) => (
                        <tr key={s.position}>
                          <th>
                            {s.position <= 12
                              ? shortMonth(
                                  `${month.slice(0, 4)}-${String(s.position).padStart(2, '0')}`,
                                )
                              : `${s.position}. Gehalt`}
                          </th>
                          {[s.salaryNetCents, s.reimbursementsCents, s.netCents].map((value, i) => (
                            <td className="n" key={i}>
                              {value === null ? 'nicht erfasst' : eur(value)}
                            </td>
                          ))}
                          <td>
                            {s.ids.map((id) => (
                              <AppLink
                                className="pp-history-link"
                                key={id}
                                to="/reports/gehalt/historie"
                                search={{ monat: month, zettel: id }}
                                state={{ reportDetailOpenedInApp: true }}
                              >
                                Zettel öffnen
                              </AppLink>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollRegion>
                <p className="vnote">
                  Sonstige Sonderzahlungen separat: {eur(data.otherSpecialCents)}. Steuerwerte laut
                  Zettel; keine Steuerberechnung.
                </p>
              </section>
            </>
          ))}
      </div>
      {gehaltszettel === 'upload' && <PayslipUploadDialog onClose={() => open()} />}
      {panelData && (gehaltszettel === 'neu' || selected) && (
        <PayslipPanel
          key={gehaltszettel}
          {...(selected ? { initial: selected } : {})}
          month={month}
          candidates={panelData.candidates}
          onClose={() => open()}
        />
      )}
      {data &&
        gehaltszettel &&
        gehaltszettel !== 'neu' &&
        gehaltszettel !== 'upload' &&
        !selected && <EmptyNote>Dieser Gehaltszettel ist nicht verfügbar.</EmptyNote>}
    </MonthReportFrame>
  );
}
function LinkStatus({ data, id }: { data: PayrollData; id: string }) {
  const link = data.links.find((l) => l.id === id);
  return (
    <div>
      {link?.status === 'unlinked' ? (
        <p className="vnote">Noch keine Gehaltsbuchung verknüpft.</p>
      ) : (
        <>
          {link?.bookingId && (
            <AppLink to="/konten/buchungen" search={{ buchung: link.bookingId }}>
              Gehaltsbuchung öffnen
            </AppLink>
          )}
          {link?.status === 'missing' && (
            <p className="pp-warning">
              Verknüpfte EUR-Gehaltsbuchung nicht verfügbar. Verknüpfung prüfen.
            </p>
          )}
          {link?.status === 'mismatch' && (
            <p className="pp-warning">
              Gehaltsanteil weicht von der Buchung ab:{' '}
              {eur(link.differenceCents ?? 0, { sign: true })}. Verknüpfte Zettel prüfen.
            </p>
          )}
          {link?.status === 'ok' && (
            <p className="vnote">
              Gehaltsanteil stimmt mit den Gehaltsanteilen der Buchung überein.
            </p>
          )}
        </>
      )}
    </div>
  );
}
