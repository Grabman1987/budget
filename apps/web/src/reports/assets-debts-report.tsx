import { ReportPeriodControl } from './period-quick-select';
import { useAmountPrivacy } from '@budget/ui';
import { MINUS } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { userText } from '../api/error-text';
import { ApiError } from '../api/http';
import { eur, eurParts, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { periodText } from '../wealth/networth-model';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { assetsDebtsHistoryQuery, type AssetsDebtsHistory } from './assets-debts-api';
import { AssetsDebtsChart, longMonth } from './assets-debts-chart';
import { assetsDebtsVerdictFacts } from './verdict-facts';
import './reports-future.css';

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));
const percent = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "+12,3 %" / "−4,0 %" from a rate (0,1 = 10 %); `null` has no percentage. */
const signedPercent = (rate: number | null): string | null => {
  if (rate === null) return null;
  const text = `${percent.format(Math.abs(rate) * 100)} %`;
  return rate < 0 ? `${MINUS}${text}` : `+${text}`;
};

/** Selected month (`?monat=`), falling back to the newest month of the report. */
function useSelectedMonth(
  history: AssetsDebtsHistory | undefined,
): [string, (month: string) => void] {
  const { monat } = useSearch({ strict: false }) as { monat?: unknown };
  const navigate = useNavigate();
  const set = (month: string) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({ ...prev, monat: month })) as never,
      replace: true,
    });
  const months = history?.months ?? [];
  const known = typeof monat === 'string' && months.some((m) => m.month === monat);
  return [known ? monat : (months[months.length - 1]?.month ?? ''), set];
}

/**
 * Report Vermögen & Schulden: what the household owns and owes at every month end, with the net
 * worth on top. Same valuation as Vermögen › Nettovermögen (one calculation, `netWorthAsOf`);
 * months that rest on an estimated price carry the usual valuation hint. A selected month shows
 * the accounts behind it.
 */
export function AssetsDebtsReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum('Alles');
  const query = useQuery(assetsDebtsHistoryQuery(period));
  const history = query.isSuccess ? query.data : undefined;
  const [selected, select] = useSelectedMonth(history);
  const verdict = useMemo(
    () =>
      history && !query.isFetching && !query.isError
        ? assetsDebtsVerdictFacts(report.id, history)
        : undefined,
    [history, query.isFetching, query.isError, report.id],
  );
  return (
    <PageFrame
      verdict={verdict}
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        history
          ? history.months.length
            ? `${longMonth(history.months[0]!.month)} bis ${longDay(history.to)}`
            : 'noch keine Konten'
          : query.isError
            ? 'nicht verfügbar'
            : 'wird geladen'
      }
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <ReportPeriodControl
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
      <div className="kview rf-report assets-debts-report">
        {query.isPending && <LoadingNote what="Vermögen und Schulden" />}
        {query.isError &&
          (query.error instanceof ApiError && query.error.code === 'valuation_unavailable' ? (
            <p className="rf-wide" role="alert">
              <strong>Bewertung nicht verfügbar.</strong>{' '}
              {userText(query.error.detail, 'Für den Zeitraum fehlt ein Kurs oder Wechselkurs.')}
            </p>
          ) : (
            <ErrorNote
              what="Vermögen und Schulden"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ))}
        {history && history.months.length === 0 && (
          <EmptyNote>Noch keine Konten. Lege unter Konten ein Konto an.</EmptyNote>
        )}
        {history && history.months.length > 0 && (
          <Body history={history} selected={selected} onSelect={select} />
        )}
      </div>
    </PageFrame>
  );
}

function Body({
  history,
  selected,
  onSelect,
}: {
  history: AssetsDebtsHistory;
  selected: string;
  onSelect: (month: string) => void;
}) {
  useAmountPrivacy();
  const { months, change } = history;
  const end = months[months.length - 1]!;
  const { whole, fraction } = eurParts(end.netCents);
  const rising = change.deltaCents >= 0;
  const Arrow = rising ? ArrowUp : ArrowDown;
  const rate = signedPercent(change.deltaRate);
  const text = periodText(history.period, history.from);
  const anyEstimated = months.some((m) => m.incomplete);
  return (
    <>
      <section className="card rf-card rf-wide" aria-labelledby="ad-title">
        <div className="tbd-head">
          <h2 id="ad-title">Nettovermögen · {text}</h2>
          <span className="tbd-state">
            <span className={rising ? 'ok' : 'ink'} data-testid="ad-state">
              <Arrow className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
              {eur(change.deltaCents, { sign: true })}
              {rate ? ` · ${rate}` : ''}
            </span>
          </span>
        </div>
        <div className="rf-figs" data-testid="ad-figures">
          <div>
            <span className="tech">Nettovermögen, {longDay(end.date)}</span>
            <strong data-testid="ad-net">
              {whole}
              <span className="cents">,{fraction} €</span>
            </strong>
          </div>
          <div>
            <span className="tech">Vermögenswerte</span>
            <strong data-testid="ad-assets">{eur(end.assetsCents)}</strong>
          </div>
          <div>
            <span className="tech">Schulden</span>
            <strong data-testid="ad-debts">{eur(end.debtsCents)}</strong>
          </div>
          <div>
            <span className="tech">Veränderung im Zeitraum</span>
            <strong data-testid="ad-change">{eur(change.deltaCents, { sign: true })}</strong>
            <small data-testid="ad-change-rate">
              {rate ?? 'Prozent nicht berechenbar (Start bei 0)'}, seit {longDay(history.from)}
            </small>
          </div>
        </div>
        <AssetsDebtsChart history={history} selected={selected} onSelect={onSelect} />
        <ul className="rf-legend" aria-label="Legende">
          <li>
            <i className="rf-sq rf-sq-ink" aria-hidden="true" />
            Vermögenswerte
          </li>
          <li>
            <i className="rf-sq rf-sq-pale" aria-hidden="true" />
            Schulden, unter Null
          </li>
          <li>
            <svg viewBox="0 0 26 8" aria-hidden="true">
              <path className="l-actual" d="M0 4h26" />
            </svg>
            Nettovermögen
          </li>
          {anyEstimated && (
            <li>
              <span aria-hidden="true">≈</span> Bewertung teilweise geschätzt
            </li>
          )}
        </ul>
        <p className="vnote">
          Stand zum Monatsende, der laufende Monat bis heute. Ein Konto zählt als Vermögen, solange
          sein Saldo positiv ist, und als Schuld, solange er negativ ist; Kredite, Kreditkarten im
          Minus und überzogene Konten stehen daher unter den Schulden. Die Bewertung ist dieselbe
          wie unter Vermögen › Nettovermögen. Tippe auf einen Monat im Diagramm oder in der Tabelle,
          um die Konten dahinter zu sehen.
        </p>
      </section>

      <section className="card rf-card rf-wide" aria-labelledby="ad-months">
        <div className="tbd-head">
          <h2 id="ad-months">Monatsenden</h2>
        </div>
        <div
          className="rf-scroll"
          role="region"
          aria-label="Monatsenden, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
          tabIndex={0}
        >
          <table className="rf-table" data-testid="ad-months">
            <caption className="sr-only">
              Vermögenswerte, Schulden und Nettovermögen zu jedem Monatsende
            </caption>
            <thead>
              <tr>
                <th scope="col" className="tech">
                  Monat
                </th>
                <th scope="col" className="tech n">
                  Vermögenswerte
                </th>
                <th scope="col" className="tech n">
                  Schulden
                </th>
                <th scope="col" className="tech n">
                  Nettovermögen
                </th>
                <th scope="col" className="tech">
                  Bewertung
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className={m.month === selected ? 'is-picked' : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="rf-month-btn"
                      aria-pressed={m.month === selected}
                      onClick={() => onSelect(m.month)}
                    >
                      {longMonth(m.month)}
                      {m.partial && <small>bis {longDay(m.date)}</small>}
                    </button>
                  </th>
                  <td className="n">{eur(m.assetsCents)}</td>
                  <td className="n">{eur(m.debtsCents)}</td>
                  <td className="n">
                    <strong>{eur(m.netCents)}</strong>
                  </td>
                  <td>
                    {m.incomplete ? (
                      'teilweise geschätzt'
                    ) : (
                      <span className="muted">vollständig</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Breakdown history={history} month={selected} />
    </>
  );
}

function Breakdown({ history, month }: { history: AssetsDebtsHistory; month: string }) {
  useAmountPrivacy();
  const m = history.months.find((x) => x.month === month) ?? history.months.at(-1)!;
  const group = (title: string, rows: typeof m.assets, total: number, id: string) => (
    <>
      <tr className="rf-grp">
        <th scope="rowgroup" colSpan={2} id={id}>
          {title}
        </th>
        <td className="n" data-testid={`${id}-total`}>
          {eur(total)}
        </td>
      </tr>
      {rows.length === 0 && (
        <tr className="is-muted">
          <td colSpan={3}>Keine</td>
        </tr>
      )}
      {rows.map((a) => (
        <tr key={a.accountId} data-account={a.accountId}>
          <td>{a.name}</td>
          <td>{a.typeLabel}</td>
          <td className="n">{eur(a.valueCents)}</td>
        </tr>
      ))}
    </>
  );
  return (
    <section
      className="card rf-card rf-wide"
      aria-labelledby="ad-breakdown"
      data-testid="ad-breakdown"
    >
      <div className="tbd-head">
        <h2 id="ad-breakdown">
          Konten · {longMonth(m.month)}{' '}
          {m.incomplete && (
            <abbr title="Teilweise geschätzt" data-testid="ad-month-estimated">
              ≈
            </abbr>
          )}
        </h2>
        <span className="tbd-state">
          {m.partial ? `Stand ${longDay(m.date)}` : `Monatsende ${longDay(m.date)}`}
        </span>
      </div>
      <div
        className="rf-scroll"
        role="region"
        aria-label="Konten des gewählten Monats, bei Bedarf horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the table on narrow viewports.
        tabIndex={0}
      >
        <table className="rf-table" data-testid="ad-accounts">
          <caption className="sr-only">
            Vermögenswerte und Schulden nach Konto, {longMonth(m.month)}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="tech">
                Konto
              </th>
              <th scope="col" className="tech">
                Typ
              </th>
              <th scope="col" className="tech n">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {group('Vermögenswerte', m.assets, m.assetsCents, 'ad-g-assets')}
            {group('Schulden', m.debts, m.debtsCents, 'ad-g-debts')}
            <tr className="is-total">
              <td colSpan={2}>Nettovermögen</td>
              <td className="n" data-testid="ad-g-net">
                {eur(m.netCents)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
