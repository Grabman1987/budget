import { useAmountPrivacy, DimensionChain, Segmented } from '@budget/ui';
import { cents } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { eur, eurParts, eurWhole, longDay, monthName } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { periodText } from '../wealth/networth-model';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { cashflowQuery, type CashflowReport } from './cashflow-api';
import { CashflowChart } from './cashflow-chart';
import './reports-future.css';

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));
const long = (month: string) => `${monthName(`${month}-01`)} ${month.slice(0, 4)}`;

/**
 * Report 3.2 Cashflow-Verlauf: what is left of the household income after consumption, month by
 * month. Kapitalerträge (dividends, interest) stand on their own line: they are not household
 * income and not part of the net cashflow (owner decision 02.10.2026).
 */
export function CashflowReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(cashflowQuery(period));
  const data = query.isSuccess ? query.data : undefined;
  const window = data?.windowMonths ?? [];
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        data
          ? window.length
            ? `${long(window[0] as string)} bis ${long(window[window.length - 1] as string)}, volle Monate`
            : 'noch kein voller Monat'
          : query.isError
            ? 'nicht verfügbar'
            : 'wird geladen'
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
              className="seg-period"
            />
          ),
        },
      ]}
    >
      <div className="kview rf-report cashflow-report">
        {query.isPending && <LoadingNote what="Cashflow" />}
        {query.isError && (
          <ErrorNote what="Cashflow" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data && window.length === 0 && (
          <EmptyNote>
            Es liegt noch kein voller Monat auf den Budget-Konten vor. Der laufende Monat zählt erst
            nach seinem Ende.
          </EmptyNote>
        )}
        {data && window.length > 0 && <Body data={data} />}
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: CashflowReport }) {
  useAmountPrivacy();
  const { totals: t } = data;
  const inWindow = data.months.filter((m) => m.inWindow);
  const positive = t.netCents > 0;
  const { whole, fraction } = eurParts(t.netCents);
  const Icon = positive ? CheckCircle2 : AlertCircle;
  return (
    <>
      <section className="card rf-card rf-wide" aria-labelledby="cf-title">
        <div className="tbd-head">
          <h2 id="cf-title">
            Nettocashflow · {periodText(data.period, `${data.windowMonths[0] as string}-01`)}
          </h2>
          <span className="tbd-state">
            <span className={positive ? 'ok' : 'ink'} data-testid="cf-state">
              <Icon className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
              {t.positiveMonths} von {t.months} Monaten positiv
            </span>
          </span>
        </div>
        <div className="rf-figure" data-testid="cf-figure">
          {whole}
          <span className="cents">,{fraction} €</span>
        </div>
        <DimensionChain
          terms={[
            { label: 'Einnahmen', value: cents(t.incomeCents) },
            { label: 'Konsumausgaben', op: '-', value: cents(t.consumptionCents) },
            { label: 'Nettocashflow', op: '=', value: cents(t.netCents), result: true },
          ]}
          label="Maßkette Nettocashflow"
        />
        <p className="rf-note-row" data-testid="cf-capital">
          <span>
            Kapitalerträge im Zeitraum, getrennt ausgewiesen: <strong>{eur(t.capitalCents)}</strong>
          </span>
          <span>Zählen weder zu den Einnahmen noch zum Nettocashflow.</span>
        </p>
        <CashflowChart report={data} />
        <ul className="rf-legend" aria-label="Legende">
          <li>
            <i className="rf-sq rf-sq-need" aria-hidden="true" />
            Bedarf
          </li>
          <li>
            <i className="rf-sq rf-sq-want-hatch" aria-hidden="true" />
            Wunsch
          </li>
          <li>
            <svg viewBox="0 0 26 8" aria-hidden="true">
              <path className="l-actual" d="M0 4h26" />
            </svg>
            Einnahmen (Haushalt)
          </li>
          <li>
            <i className="rf-sq rf-sq-ink" aria-hidden="true" />
            Nettocashflow
          </li>
          <li>
            <i className="rf-sq rf-sq-pale" aria-hidden="true" />
            Kapitalerträge (separat)
          </li>
        </ul>
        <p className="vnote">
          Einnahmen sind das Haushaltseinkommen der Budget-Konten ohne Umbuchungen, Erstattungen und
          Rückzahlungen von Kontakten. Umbuchungen und Zukunft (ETF, Notgroschen, Sondertilgung)
          zählen nicht als Ausgabe; sie sind Teil des Nettocashflows. Der laufende Monat ist nicht
          enthalten
          {data.months.length > t.months ? '; das Diagramm zeigt mindestens sechs Monate' : ''}.
        </p>
      </section>
      <section className="card rf-card rf-wide" aria-labelledby="cf-months">
        <div className="tbd-head">
          <h2 id="cf-months">Je Monat</h2>
          <span className="tbd-state">
            <span className="ink">Stand {longDay(data.asOf)}</span>
          </span>
        </div>
        <div
          className="rf-scroll"
          role="region"
          aria-label="Cashflow je Monat, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
          tabIndex={0}
        >
          <table className="rf-table" data-testid="cf-table">
            <thead>
              <tr>
                <th className="tech">Monat</th>
                <th className="tech n">Einnahmen</th>
                <th className="tech n">Bedarf</th>
                <th className="tech n">Wunsch</th>
                <th className="tech n">Nettocashflow</th>
                <th className="tech n">davon in Zukunft</th>
                <th className="tech n">Kapitalerträge (separat)</th>
              </tr>
            </thead>
            <tbody>
              {inWindow
                .slice()
                .reverse()
                .map((m) => (
                  <tr key={m.month}>
                    <td>{long(m.month)}</td>
                    <td className="n">{eur(m.incomeCents)}</td>
                    <td className="n">{eur(m.needCents)}</td>
                    <td className="n">{eur(m.wantCents)}</td>
                    <td className="n">
                      <strong>{eur(m.netCents, { sign: true })}</strong>
                    </td>
                    <td className="n">{eur(m.futureCents)}</td>
                    <td className="n">{eur(m.capitalCents)}</td>
                  </tr>
                ))}
              <tr className="is-total">
                <td>Zeitraum</td>
                <td className="n">{eur(t.incomeCents)}</td>
                <td className="n">{eur(t.needCents)}</td>
                <td className="n">{eur(t.wantCents)}</td>
                <td className="n">{eur(t.netCents, { sign: true })}</td>
                <td className="n">{eur(t.futureCents)}</td>
                <td className="n">{eur(t.capitalCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="vnote">
          Gesamt {eurWhole(t.netCents, true)} Nettocashflow in {t.months} Monaten.
        </p>
      </section>
    </>
  );
}
