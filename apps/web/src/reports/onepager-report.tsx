import { AllocationBar } from './allocation-bar';
import { AppLink } from '../shell/app-link';
import { chartShare } from '../charts/tooltip-data';
import { ChartValue } from '@budget/ui';
import {
  useAmountPrivacy,
  CLASS_LABEL,
  ClassSwatch,
  DimensionChain,
  RevisionTriangle,
} from '@budget/ui';
import { cents, MINUS } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { HeutePaceChart } from '../heute/charts';
import { eur, eurParts, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { NetWorthMini } from './month-charts';
import { onePagerQuery, type OnePagerData } from './month-api';
import { MonthReportFrame, shortMonth, useReportMonth } from './month-frame';
import './onepager-report.css';

const CLASSES = ['need', 'want', 'future'] as const;
const SOLL = { need: 50, want: 30, future: 20 } as const;

/** Whole percent from basis points, with the real minus sign. */
const percent = (bp: number) => `${bp < 0 ? MINUS : ''}${Math.abs(Math.round(bp / 100))} %`;
const signed = (value: number) => eur(value, { cents: false, sign: true });
const tone = (value: number) => (value > 0 ? 'is-up' : value < 0 ? 'is-down' : '');

export function OnePagerReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const { month, shift, current } = useReportMonth();
  const query = useQuery(onePagerQuery(month));
  const data = query.data;
  return (
    <MonthReportFrame
      report={report}
      meta={meta}
      month={month}
      shift={shift}
      current={current}
      firstMonth={data?.firstMonth}
      asOf={data?.asOf}
      basis={query.isError ? 'nicht verfügbar' : undefined}
      print
    >
      <div className="mrep onepager-report" data-testid="onepager-report">
        {query.isPending && <LoadingNote what="Daten des Monatsblatts" />}
        {query.isError && (
          <ErrorNote
            what="Daten des Monatsblatts"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {data?.beforeRecords && (
          <EmptyNote>
            Vor {shortMonth(data.firstMonth)} gibt es keine Aufzeichnungen, also auch kein
            Monatsblatt.
          </EmptyNote>
        )}
        {data && !data.beforeRecords && <Sheet data={data} />}
      </div>
    </MonthReportFrame>
  );
}

function Sheet({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const { result } = data;
  const parts = eurParts(result.savedCents);
  const yymm = `${data.month.slice(2, 4)}${data.month.slice(5, 7)}`;
  const restLabel = result.restCents >= 0 ? 'Übrig' : 'Aus Guthaben';
  return (
    <div className="psheet-wrap mr-wide">
      <article className="psheet" aria-label={`Monats-One-Pager ${monthLabel(data.month)}`}>
        <Zones />
        <div className="ps-body">
          <header className="ps-head">
            <h2>
              {monthLabel(data.month)}
              {data.partial && <small> laufend</small>}
            </h2>
            <div className="ps-fig">
              <span className="tech">Gespart</span>
              <strong data-testid="onepager-saved">
                {parts.whole}
                <span className="cents">,{parts.fraction} €</span>
              </strong>
              <span data-testid="onepager-rate">
                {data.partial
                  ? 'Sparquote nach Monatsende'
                  : result.savingsRateBp === null
                    ? 'Sparquote –'
                    : `Sparquote ${percent(result.savingsRateBp)}`}
              </span>
            </div>
          </header>
          <DimensionChain
            label="Maßkette des Monats"
            precision="euro"
            terms={[
              { label: 'Einnahmen', value: cents(result.earnedCents) },
              { op: '-', label: 'Konsum', value: cents(result.consumptionCents) },
              { op: '=', label: 'Gespart', value: cents(result.savedCents), result: true },
              { op: '-', label: 'Zukunft', value: cents(result.futureCents) },
              { op: '=', label: restLabel, value: cents(result.restCents), result: true },
            ]}
          />
          {data.capitalCents > 0 && (
            <p className="ps-note" data-testid="onepager-capital">
              Kapitalerträge dieses Monats: {eur(data.capitalCents, { cents: false })}. Sie zählen
              nicht zu den Einnahmen und stehen nicht in der Sparquote.
            </p>
          )}
          <div className="ps-grid">
            <Split523 data={data} />
            <section className="ps-sec" aria-labelledby="ps-b">
              <h3 className="ps-h" id="ps-b">
                <span>B</span>Ausgaben im Monatsverlauf
              </h3>
              <HeutePaceChart data={{ pace: data.pace, stand: { today: data.today } }} />
            </section>
            <Top data={data} />
            <Plan data={data} />
            <Check data={data} />
            <NetWorth data={data} />
            <Findings data={data} />
          </div>
          <footer className="ps-tb">
            {[
              ['Benennung', 'Monats-One-Pager', 'ps-tb-name'],
              ['Monat', monthLabel(data.month), ''],
              ['Stand', longDay(data.asOf), ''],
              ['Zeichnungs-Nr.', `FA-R1.1-${yymm}`, ''],
              ['Einheit', '€', ''],
              ['Blatt', '1 / 1', ''],
            ].map(([label, value, cls]) => (
              <div className={`ps-tb-cell ${cls}`} key={label}>
                <span className="tech">{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </footer>
        </div>
      </article>
    </div>
  );
}

/** Zone marks of the drawing frame, 1–6 across and A–F down. */
function Zones() {
  useAmountPrivacy();
  const numbers = [1, 2, 3, 4, 5, 6].map((i) => <span key={i}>{i}</span>);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'].map((i) => <span key={i}>{i}</span>);
  return (
    <div className="ps-zones" aria-hidden="true">
      <div className="pz-h pz-top">{numbers}</div>
      <div className="pz-h pz-bot">{numbers}</div>
      <div className="pz-v pz-left">{letters}</div>
      <div className="pz-v pz-right">{letters}</div>
    </div>
  );
}

function Split523({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const a = data.allocation;
  const spend = a.needCents + a.wantCents + a.futureCents;
  const base = a.incomeCents;
  const total = Math.max(base, spend);
  const amount: Record<(typeof CLASSES)[number], number> = {
    need: a.needCents,
    want: a.wantCents,
    future: a.futureCents,
  };
  return (
    <section className="ps-sec ps-split" aria-labelledby="ps-a">
      <h3 className="ps-h" id="ps-a">
        <span>A</span>Verteilung 50/30/20
      </h3>
      {base <= 0 || total <= 0 ? (
        <p className="ps-note">Ohne Einnahmen im Monat lässt sich keine Verteilung berechnen.</p>
      ) : (
        <div className="b523" data-testid="onepager-split">
          <ChartValue
            label="Verteilung 50/30/20"
            date={data.month}
            series={[
              ...CLASSES.map((c) => ({
                name: CLASS_LABEL[c],
                value: `${eur(amount[c])} · ${chartShare(amount[c], base)}`,
                color: `var(--${c})`,
              })),
              {
                name: 'Übrig / aus Guthaben',
                value: `${eur(a.restCents)} · ${chartShare(a.restCents, base)}`,
                color: 'var(--ink-3)',
              },
            ]}
          >
            <AllocationBar data={a} label={splitLabel(data)} />
          </ChartValue>
          <div className="b523-leg">
            {CLASSES.map((c) => (
              <span key={c}>
                <ClassSwatch kind={c} />
                {CLASS_LABEL[c]} <strong>{percent(a.shares[c] * 100)}</strong>
                <small>
                  {eur(amount[c], { cents: false })} · Soll {SOLL[c]}
                </small>
              </span>
            ))}
            <span>
              <i className="sw sw-rest" aria-hidden="true" />
              {a.shares.rest >= 0 ? 'Übrig' : 'Aus Guthaben'}{' '}
              <strong>{percent(a.shares.rest * 100)}</strong>
              <small>{eur(a.restCents, { cents: false })}</small>
            </span>
          </div>
          <p className="b523-note">
            Zusammen 100 % von {eur(base, { cents: false })} Einnahmen als Zwölftel. Periodische
            Kosten, Sonderzahlungen und ihre Umbuchungen zählen je Monat mit einem Zwölftel, deshalb
            weichen die Beträge vom Zahlungsmonat ab.
          </p>
        </div>
      )}
    </section>
  );
}

const splitLabel = (data: OnePagerData) => {
  const { shares } = data.allocation;
  return `Bedarf ${shares.need} %, Wunsch ${shares.want} %, Zukunft ${shares.future} %, ${
    shares.rest >= 0 ? 'Übrig' : 'Aus Guthaben'
  } ${Math.abs(shares.rest)} % der Einnahmen.`;
};

function NetWorth({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const nw = data.netWorth;
  return (
    <section className="ps-sec ps-nw ps-wide" aria-labelledby="ps-f">
      <h3 className="ps-h" id="ps-f">
        <span>F</span>Nettovermögen
      </h3>
      {'unavailable' in nw ? (
        <p className="ps-note" role="status" data-testid="onepager-networth-unavailable">
          {nw.unavailable.message} Das Nettovermögen wird nicht geschätzt.
        </p>
      ) : (
        <>
          <div className="ps-nwfig">
            <strong data-testid="onepager-networth">
              {data.incomplete?.length ? '≈' : ''}
              {eur(nw.cents, { cents: false })}
            </strong>
            <span className={`ps-delta ${tone(nw.deltaCents)}`}>{signed(nw.deltaCents)}</span>
          </div>
          <NetWorthMini
            points={nw.series}
            label={`Nettovermögen der letzten ${nw.series.length} Monatsenden bis ${eur(nw.cents)}`}
          />
          <p className="ps-note">
            Eigenleistung {signed(nw.ownCents)} · Markt {signed(nw.marketCents)}
          </p>
        </>
      )}
    </section>
  );
}

function Top({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const max = data.top[0]?.cents ?? 1;
  return (
    <section className="ps-sec ps-top ps-wide" aria-labelledby="ps-c">
      <h3 className="ps-h" id="ps-c">
        <span>C</span>Größte Ausgaben
      </h3>
      <div className="ps-sources">
        <IncomeList data={data} />
        <div>
          {data.top.length === 0 ? (
            <p className="ps-note">In diesem Monat gibt es keine Ausgaben in Bedarf und Wunsch.</p>
          ) : (
            <>
              <table className="ps-cats" data-testid="onepager-top">
                <tbody>
                  {data.top.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <ClassSwatch kind={row.class} />
                        {row.name}
                      </td>
                      <td className="ps-bar">
                        <ChartValue
                          label={row.name}
                          date={data.month}
                          series={[{ name: row.name, value: eur(row.cents), color: 'var(--line)' }]}
                        >
                          <i style={{ width: `${(row.cents / max) * 100}%` }} aria-hidden="true" />
                        </ChartValue>
                      </td>
                      <td className="n">{eur(row.cents, { cents: false })}</td>
                      <td className="n">
                        <small className={tone(-row.deltaCents)}>{signed(row.deltaCents)}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="ps-note">Veränderung gegenüber {monthLabel(data.previousMonth)}.</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Plan({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const { plan } = data;
  return (
    <section className="ps-sec ps-bud" aria-labelledby="ps-d">
      <h3 className="ps-h" id="ps-d">
        <span>D</span>Plan
      </h3>
      <div className="ps-kpi">
        <strong data-testid="onepager-over">{plan.overCount}</strong>
        <span>von {plan.total} Kategorien über Plan</span>
      </div>
      <ul className="ps-over">
        {plan.over.map((row) => (
          <li key={row.id}>
            <span>{row.name}</span>
            <span className={`n ${data.partial ? 'is-urgent' : ''}`}>
              {eur(row.spentCents, { cents: false })}{' '}
              <small>/ {eur(row.budgetedCents, { cents: false })}</small>
            </span>
          </li>
        ))}
        {plan.over.length === 0 && <li className="muted">Keine Überschreitung.</li>}
      </ul>
    </section>
  );
}

function Check({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  const check = data.check;
  return (
    <section className="ps-sec ps-chk" aria-labelledby="ps-e">
      <h3 className="ps-h" id="ps-e">
        <span>E</span>Finanz-Check
      </h3>
      {'unavailable' in check ? (
        <p className="ps-note" role="status" data-testid="onepager-check-unavailable">
          {check.unavailable.message} Der Finanz-Check wird nicht geschätzt.
        </p>
      ) : (
        <>
          <div className="ps-kpi">
            <strong data-testid="onepager-check-ok">{check.ok}</strong>
            <span>von {check.total} Regeln erfüllt</span>
          </div>
          <div
            className="ps-cells"
            role="img"
            aria-label={`${check.ok} erfüllt, ${check.warn} Warnung, ${check.bad} verletzt${
              check.notRated > 0 ? `, ${check.notRated} nicht bewertbar` : ''
            }`}
          >
            {check.rules.map((r) => (
              <span
                key={r.code}
                className={`ps-cell cell-${r.status ?? 'none'}`}
                title={`${r.code} ${r.name}`}
              />
            ))}
          </div>
          <p className="ps-note">
            {check.warn} Warnung · {check.bad} verletzt
            {check.violated.length > 0 ? `: ${check.violated.join(', ')}` : ''}
            {check.notRated > 0 ? ` · ${check.notRated} nicht bewertbar` : ''}
          </p>
        </>
      )}
    </section>
  );
}

function Findings({ data }: { data: OnePagerData }) {
  useAmountPrivacy();
  return (
    <section className="ps-sec ps-wide ps-rev" aria-labelledby="ps-g">
      <h3 className="ps-h" id="ps-g">
        <span>G</span>Revisionen des Monats
      </h3>
      <table className="ps-revt" data-testid="onepager-findings">
        <thead>
          <tr>
            <th className="tech">Rev.</th>
            <th className="tech">Befund</th>
            <th className="tech n">Betrag</th>
            <th className="tech">Regel</th>
          </tr>
        </thead>
        <tbody>
          {data.findings.map((f, i) => (
            <tr key={f.text}>
              <td className="rev-mark">
                <RevisionTriangle letter={String.fromCharCode(65 + i)} />
              </td>
              <td>{f.text}</td>
              <td className="n">
                {signed(f.cents)}
                {f.suffix ? ` ${f.suffix}` : ''}
              </td>
              <td className="tech">{f.rule ?? '–'}</td>
            </tr>
          ))}
          {data.findings.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Ein ruhiger Monat.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function IncomeList({ data }: { data: OnePagerData }) {
  return (
    <div className="ps-income">
      <h4>Einnahmen des Monats</h4>
      <table className="ps-cats" data-testid="onepager-income">
        <tbody>
          {data.incomeRows
            .filter((r) => r.kind === 'household')
            .map((r, i) => (
              <tr key={`${r.bookingId}-${i}`}>
                <td>
                  <AppLink to="/konten/buchungen" search={{ buchung: r.bookingId }}>
                    {r.name}
                    {r.payer ? ` · ${r.payer}` : ''}
                  </AppLink>
                </td>
                <td className="n">{eur(r.cents)}</td>
                <td className="n">{chartShare(r.cents, data.result.earnedCents)}</td>
              </tr>
            ))}
          <tr>
            <th scope="row">Summe Einnahmen</th>
            <td className="n">{eur(data.result.earnedCents)}</td>
            <td className="n">{data.result.earnedCents > 0 ? '100 %' : '–'}</td>
          </tr>
          {data.incomeRows
            .filter((r) => r.kind !== 'household')
            .map((r, i) => (
              <tr key={`separate-${r.bookingId}-${i}`}>
                <td>
                  <AppLink to="/konten/buchungen" search={{ buchung: r.bookingId }}>
                    {r.kind === 'capital' ? 'Kapitalerträge' : 'Erstattungen'} · separat
                    {r.payer ? ` · ${r.payer}` : ''}
                  </AppLink>
                </td>
                <td className="n">{eur(r.cents)}</td>
                <td>–</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
