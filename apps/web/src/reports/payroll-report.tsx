import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { ReportBodyDisclosure } from './report-body-disclosure';
import { payrollCalculation } from './payroll-presentation';
import './payroll-redesign.css';
import { ReportTable } from './report-table';
import { cents, payrollTotals } from '@budget/domain';
import { Button, DimensionChain, useIsPhone, useAmountPrivacy } from '@budget/ui';
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
import { PayrollNetComposition } from './payroll-net-composition';
import { PayrollDevelopment } from './payroll-development';
import { PayrollProjectChart } from './payroll-project-chart';
import { PayslipPanel } from './payslip-panel';
import { PayrollSource } from './payroll-source';
import { PayrollBankParts } from './payroll-bank-parts';
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
  useAmountPrivacy();
  const phone = useIsPhone();
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
  useEffect(() => {
    if (gehaltszettel === 'upload') {
      void navigate({ to: '/plan/monat/einnahmen', search: { monat: month }, replace: true });
    }
  }, [gehaltszettel, month, navigate]);
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
  const headlineTotal =
    history && zettel && detailSlips.length ? payrollTotals(detailSlips) : data?.month;
  const headlineAvailable =
    !!data && (history && zettel ? detailSlips.length > 0 : data.slips.length > 0);
  const recent = data?.timeline.slice(-24) ?? [];
  const historySlips = REDESIGN_ENABLED
    ? [...(data?.captured ?? [])].sort((a, b) => b.month.localeCompare(a.month))
    : (data?.captured ?? []);
  const salaryPosition = (position: number) =>
    position <= 12
      ? shortMonth(`${month.slice(0, 4)}-${String(position).padStart(2, '0')}`)
      : `${position}. Gehalt`;
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
                <td className="n">{eur(-p.svCents)}</td>
              </tr>
              <tr>
                <th>{p.taxCents < 0 ? 'Lohnsteuer-Erstattung (Aufrollung)' : 'Lohnsteuer'}</th>
                <td className="n">{eur(-p.taxCents)}</td>
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
                    <td className="n">{eur(l.amountCents)}</td>
                  </tr>
                ))}
              <tr className="is-total">
                <th>Auszahlung</th>
                <td className="n">{eur(p.netCents)}</td>
              </tr>
            </tbody>
          </table>
          {data.sources?.find((source) => source.id === p.id) && (
            <PayrollSource source={data.sources.find((source) => source.id === p.id)!} level="h4" />
          )}
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
      calculation={
        headlineAvailable && headlineTotal
          ? payrollCalculation(
              headlineTotal,
              history && zettel && detailSlips[0]
                ? `Auszahlung ${shortMonth(detailSlips[0].month)} · ausgewählter Zettel`
                : undefined,
            )
          : undefined
      }
      verdict={
        data && !query.isError
          ? {
              reportId: report.id,
              ...(REDESIGN_ENABLED ? { unavailable: !headlineAvailable } : {}),
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
            {REDESIGN_ENABLED && (
              <Button disabled={!data} onClick={(event) => open('neu', event.currentTarget)}>
                Gehaltszettel hinzufügen
              </Button>
            )}
            {REDESIGN_ENABLED && (
              <AppLink to="/plan/monat/einnahmen" search={{ monat: month }}>
                PDF im Plan hinzufügen
              </AppLink>
            )}
            <AppLink
              className="pp-history-link"
              to="/reports/gehalt/historie"
              search={{ monat: month }}
              state={{ reportDetailOpenedInApp: true }}
            >
              Gehaltszettel-Historie
            </AppLink>
          </div>
        )}
        {REDESIGN_ENABLED && data && !history && data.slips.length === 0 && (
          <EmptyNote>Für diesen Monat ist noch kein Gehaltszettel erfasst.</EmptyNote>
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
                  {historySlips.map((p) => (
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
              {data.slips.map((p) => {
                const source = data.sources?.find((row) => row.id === p.id);
                return (
                  source && (
                    <section className="mr-card mr-wide" key={p.id}>
                      <PayrollSource source={source} />
                      <LinkStatus data={data} id={p.id} />
                    </section>
                  )
                );
              })}
              {REDESIGN_ENABLED && (
                <section
                  className="mr-card mr-wide r9-salary-trend"
                  aria-labelledby="r9-salary-title"
                >
                  <div className="tbd-head">
                    <h2 id="r9-salary-title">
                      {recent.length
                        ? `Netto der letzten ${recent.length} Monate inkl. Sonderzahlungen`
                        : 'Netto im Verlauf inkl. Sonderzahlungen'}
                    </h2>
                  </div>
                  {recent.some((row) => row.composition.recorded) ? (
                    <PayrollNetComposition
                      height={phone ? 176 : 240}
                      rows={recent.map((r) => r.composition)}
                    />
                  ) : (
                    <EmptyNote>Noch keine Gehaltszettel erfasst.</EmptyNote>
                  )}
                  <p className="r9-meta">
                    Volles Netto je Auszahlungsmonat, ohne Reisespesen. Fehlende Zettel bleiben
                    Lücken.
                  </p>
                </section>
              )}
              <ReportBodyDisclosure id="payroll-payout" label="Abzüge und Auszahlung im Detail">
                <section className="mr-card">
                  <div className="tbd-head">
                    <h2>Auszahlung {shortMonth(month)}</h2>
                    {!REDESIGN_ENABLED && (
                      <Button size="sm" onClick={(event) => open('neu', event.currentTarget)}>
                        Gehaltszettel hinzufügen
                      </Button>
                    )}
                  </div>
                  {data.slips.length === 0 ? (
                    !REDESIGN_ENABLED && (
                      <EmptyNote>Für diesen Monat ist noch kein Gehaltszettel erfasst.</EmptyNote>
                    )
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
                          {
                            op: '-',
                            label: 'Sonstige Abzüge',
                            value: cents(data.month.otherCents),
                          },
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
                              <span
                                key={i}
                                className={`pp-ink-${i}`}
                                style={{ flex: v || 0.001 }}
                              />
                            ))}
                          </div>
                        )}
                      <p className="vnote">
                        Abzugsquote {pct(data.month.deductionRatio)} · SV {pct(data.month.svRatio)}{' '}
                        · Lohnsteuer {pct(data.month.taxRatio)} · sonstige Abzüge{' '}
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
              </ReportBodyDisclosure>
              <ReportBodyDisclosure
                id="payroll-history"
                label="Brutto und Netto · gesamter Verlauf"
              >
                <section className="mr-card mr-wide">
                  <div className="tbd-head">
                    <h2>Verlauf · Brutto und Netto je Monat</h2>
                  </div>
                  {data.timeline.some((row) => row.recorded) ? (
                    <PayrollProjectChart
                      table={REDESIGN_ENABLED}
                      months={data.timeline.map((r) => r.month)}
                      values={data.timeline.map((r) => (r.recorded ? r.payNetCents : null))}
                      gross={data.timeline.map((r) => (r.recorded ? r.payGrossCents : null))}
                    />
                  ) : (
                    <EmptyNote>Noch keine Gehaltszettel erfasst.</EmptyNote>
                  )}
                  <p className="vnote">
                    Tusche: Netto · blasse Tusche: Brutto, jeweils je Monat inklusive
                    Sonderzahlungen und Zusätzen; Telearbeit und Fahrgeld zählen als Gehalt,
                    Reisespesen sind ausgenommen. Fehlende Zettel bleiben Lücken.
                  </p>
                </section>
              </ReportBodyDisclosure>
              <ReportBodyDisclosure id="payroll-months" label="Auszahlung je Monat und Jahr">
                <section className="mr-card mr-wide">
                  <h2>Auszahlung je Monat und Jahr</h2>
                  <ReportTable
                    caption="Auszahlungen nach Kalenderjahr"
                    regionLabel="Auszahlungen nach Kalenderjahr"
                    className="rtable"
                  >
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
                  </ReportTable>
                </section>
              </ReportBodyDisclosure>
              <ReportBodyDisclosure
                id="payroll-years"
                label="Jahresgehälter und Vorjahresvergleich"
              >
                <section className="mr-card mr-wide">
                  <h2>Jahresgehälter</h2>
                  <ReportTable
                    caption="Jahresgehälter und Vorjahresvergleich"
                    regionLabel="Jahresgehälter und Vorjahresvergleich"
                    className="rtable"
                  >
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
                              {v === null ? 'nicht bestimmbar' : eur(v)}
                            </td>
                          ))}
                          <td className="n">{pct(y.deductionRatio)}</td>
                          <td className="n">
                            {y.changeCents === null
                              ? 'nicht vergleichbar'
                              : `${eur(y.changeCents)} · ${pct(y.changeRatio)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </ReportTable>
                  <p className="vnote">
                    Jahressummen und Vorjahresvergleich enthalten die Sonderzahlungen (13./14.
                    Gehalt, Bonus) im Monat der Auszahlung; die Spalte Sonderzahlungen zeigt ihren
                    Brutto-Anteil. Keine Hochrechnung. Bruttovergleich ohne steuerfreie Erstattungen
                    und nur bei erfassten gleichen Monaten und Zahlungsarten im Vorjahr.
                  </p>
                </section>
              </ReportBodyDisclosure>
              <ReportBodyDisclosure id="payroll-development" label="Gehaltsentwicklung">
                <PayrollDevelopment month={month} />
              </ReportBodyDisclosure>
              <ReportBodyDisclosure id="payroll-special" label="Sonderzahlungen und 14 Gehälter">
                <section className="mr-card mr-wide">
                  <h2>14 Gehälter · {month.slice(0, 4)}</h2>
                  <ReportTable
                    caption="Vierzehn Gehälter"
                    regionLabel="Vierzehn Gehälter"
                    className="rtable"
                  >
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
                      {data.salaries
                        .filter((salary) => salary.ids.length > 0)
                        .map((s) => (
                          <tr key={s.position}>
                            <th>{salaryPosition(s.position)}</th>
                            {[s.salaryNetCents, s.reimbursementsCents, s.netCents].map(
                              (value, i) => (
                                <td className="n" key={i}>
                                  {value === null ? 'nicht erfasst' : eur(value)}
                                </td>
                              ),
                            )}
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
                      {!data.salaries.some((salary) => salary.ids.length > 0) && (
                        <tr>
                          <td colSpan={5}>Für dieses Jahr sind keine Gehälter erfasst.</td>
                        </tr>
                      )}
                    </tbody>
                  </ReportTable>
                  <p className="vnote">
                    Sonstige Sonderzahlungen separat: {eur(data.otherSpecialCents)}. Steuerwerte
                    laut Zettel; keine Steuerberechnung.
                  </p>
                </section>
              </ReportBodyDisclosure>
            </>
          ))}
      </div>
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
      {link &&
        'parts' in link &&
        link.parts?.map((part, index) => (
          <p className="vnote" key={index}>
            Bankanteil ·{' '}
            {part.incomeTypeId === 'income-salary'
              ? 'Laufendes Gehalt'
              : part.incomeTypeId === 'income-special'
                ? 'Sonderzahlung'
                : part.incomeTypeId === 'income-refund'
                  ? 'Erstattung'
                  : 'Andere Einnahmenart'}{' '}
            · {eur(part.amountCents)}
          </p>
        ))}
      {link &&
        'parts' in link &&
        link.parts &&
        link.parts.length > 0 &&
        link.parts.every((part) =>
          ['income-salary', 'income-special', 'income-refund'].includes(part.incomeTypeId ?? ''),
        ) && <PayrollBankParts key={JSON.stringify(link.parts)} id={id} parts={link.parts} />}
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
              Auszahlung weicht von den zugeordneten Bankanteilen ab:{' '}
              {eur(link.differenceCents ?? 0, { sign: true })}. Verknüpfte Zettel prüfen.
            </p>
          )}
          {link?.status === 'ok' && (
            <p className="vnote">Auszahlung stimmt mit den zugeordneten Bankanteilen überein.</p>
          )}
        </>
      )}
    </div>
  );
}
