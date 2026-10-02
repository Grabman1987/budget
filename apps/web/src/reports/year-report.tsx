import {
  addMonths,
  cents,
  overviewHeat,
  type YearCategoryRow,
  type YearFinding,
  type YearReport,
} from '@budget/domain';
import { Button, ClassSwatch, DimensionChain, Segmented } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { useRuleDerivation, yearReportQuery, type YearReportRead } from './overview-api';
import {
  bpText,
  euroCellText,
  monthLong,
  monthNameOnly,
  monthShort,
  wholeText,
} from './overview-format';
import { YearCashflowChart, YearNetWorthChart } from './year-charts';
import './overview-reports.css';
import './year-report.css';

const STATUS_WORD = { ok: 'erfüllt', warn: 'Warnung', bad: 'verletzt' } as const;

export function YearReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const [year, setYear] = useState<number | null>(null);
  const query = useQuery(yearReportQuery(year));
  const data = query.data;
  // The Finanz-Check of the year's last month end is stored for the last twelve month ends only.
  const lastMonth = data?.report.months[data.report.months.length - 1];
  useRuleDerivation(
    data !== undefined &&
      lastMonth !== undefined &&
      data.rules === null &&
      lastMonth >= addMonths(data.ref, -11),
  );
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? data.firstMonth
              ? `volle Monate bis ${monthLong(data.ref)}`
              : 'noch keine Buchungen'
            : 'wird geladen'
      }
    >
      <div className="kview ov year-report">
        {query.isPending && <LoadingNote what="Jahresreport" />}
        {query.isError && (
          <ErrorNote what="Jahresreport" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data && (
          <>
            <section className="card ov-card ov-noprint" aria-labelledby="yr-controls">
              <div className="tbd-head">
                <h2 id="yr-controls">Jahr</h2>
                <div className="yr-actions">
                  {data.years.length > 0 && (
                    <Segmented
                      label="Jahr"
                      options={data.years.map((y) => ({ value: String(y), label: String(y) }))}
                      value={String(data.report.year)}
                      onChange={(value) => setYear(Number(value))}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={data.report.months.length === 0}
                    onClick={() => window.print()}
                  >
                    <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
                    Drucken
                  </Button>
                </div>
              </div>
              <p className="ov-note">
                Zwei Blätter im Format A4 aus den vollen Monaten des Jahres. Einkommen ohne
                Kapitalerträge und Erstattungen; Kapitalerträge stehen für sich.
              </p>
            </section>
            {data.report.months.length === 0 ? (
              <section className="card ov-card" aria-live="polite">
                <p className="ov-empty" role="status">
                  {data.firstMonth === null
                    ? 'Es gibt noch keine Buchungen auf Budgetkonten.'
                    : `Für ${data.report.year} liegt kein voller Monat mit Buchungen vor.`}
                </p>
              </section>
            ) : (
              <Sheets data={data} />
            )}
          </>
        )}
      </div>
    </PageFrame>
  );
}

function Sheets({ data }: { data: YearReportRead }) {
  const { report } = data;
  const last = report.months[report.months.length - 1] as string;
  const range = report.partial ? `Jän–${monthShort(last)}` : '';
  const titleBlock = (sheet: number) => (
    <dl className="ov-tb" aria-label={`Schriftfeld Blatt ${sheet} von 2`}>
      <div className="ov-tb-name">
        <dt className="tech">Benennung</dt>
        <dd>Jahresreport</dd>
      </div>
      <div>
        <dt className="tech">Jahr</dt>
        <dd>
          {report.year}
          {range ? ` · ${range}` : ''}
        </dd>
      </div>
      <div>
        <dt className="tech">Stand</dt>
        <dd>{longDay(data.today)}</dd>
      </div>
      <div>
        <dt className="tech">Zeichnungs-Nr.</dt>
        <dd>FA-R5.1-{report.year}</dd>
      </div>
      <div>
        <dt className="tech">Einheit</dt>
        <dd>€</dd>
      </div>
      <div>
        <dt className="tech">Blatt</dt>
        <dd>{sheet} / 2</dd>
      </div>
    </dl>
  );
  return (
    <div className="ov-sheets">
      <SheetOne data={data} range={range} titleBlock={titleBlock(1)} />
      <SheetTwo data={data} titleBlock={titleBlock(2)} />
    </div>
  );
}

function SheetFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <article className="ov-sheet" aria-label={label}>
      <div className="ov-sheet-body">{children}</div>
    </article>
  );
}

function SectionTitle({ letter, children }: { letter: string; children: React.ReactNode }) {
  return (
    <h3 className="ov-sheet-h">
      <span aria-hidden="true">{letter}</span>
      {children}
    </h3>
  );
}

function SheetOne({
  data,
  range,
  titleBlock,
}: {
  data: YearReportRead;
  range: string;
  titleBlock: React.ReactNode;
}) {
  const { report } = data;
  const nw = report.netWorth;
  const t = report.totals;
  const lastRow = report.rows[report.rows.length - 1];
  return (
    <SheetFrame label={`Jahresreport ${report.year}, Blatt 1`}>
      <header className="ov-sheet-head">
        <h2>
          {report.year}
          {range && (
            <small> bis {monthLong(report.months[report.months.length - 1] as string)}</small>
          )}
        </h2>
        {nw ? (
          <div className="ov-sheet-fig">
            <span className="tech">Nettovermögen</span>
            <strong data-testid="yr-networth-end">{eur(nw.endCents, { cents: false })}</strong>
            <span>{eur(nw.endCents - nw.startCents, { cents: false, sign: true })} im Jahr</span>
          </div>
        ) : null}
      </header>
      {nw ? (
        <DimensionChain
          label="Maßkette Nettovermögen im Jahr"
          terms={[
            { label: 'Anfang', value: cents(nw.startCents) },
            {
              label: 'Eigenleistung',
              value: cents(Math.abs(nw.ownCents)),
              op: nw.ownCents >= 0 ? '+' : '-',
            },
            {
              label: 'Markt',
              value: cents(Math.abs(nw.marketCents)),
              op: nw.marketCents >= 0 ? '+' : '-',
            },
            { label: 'Ende', value: cents(nw.endCents), op: '=', result: true },
          ]}
        />
      ) : (
        <p className="ov-note" role="status">
          {data.netWorthUnavailable
            ? `Das Nettovermögen ist nicht verfügbar: ${data.netWorthUnavailable}`
            : 'Für dieses Jahr liegt kein Nettovermögen vor.'}
        </p>
      )}
      <div className="ov-sheet-kpis">
        <div>
          <span className="tech">Einkommen</span>
          <strong data-testid="yr-income">{eur(t.incomeCents, { cents: false })}</strong>
        </div>
        <div>
          <span className="tech">Konsum</span>
          <strong data-testid="yr-consumption">{eur(t.consumptionCents, { cents: false })}</strong>
        </div>
        <div>
          <span className="tech">Zukunft</span>
          <strong data-testid="yr-future">{eur(t.futureCents, { cents: false })}</strong>
        </div>
        <div>
          <span className="tech">Sparquote</span>
          <strong data-testid="yr-rate">{bpText(t.savingsRateBp)}</strong>
        </div>
        <div>
          <span className="tech">Kapitalerträge</span>
          <strong data-testid="yr-capital">{eur(t.capitalCents, { cents: false })}</strong>
        </div>
      </div>
      <section className="ov-sheet-sec" aria-label="Cashflow je Monat">
        <SectionTitle letter="A">Cashflow je Monat</SectionTitle>
        <YearCashflowChart year={report.year} rows={report.rows} />
      </section>
      <div className="ov-sheet-grid">
        <section className="ov-sheet-sec" aria-label="Nettovermögen">
          <SectionTitle letter="B">Nettovermögen</SectionTitle>
          {nw ? (
            <YearNetWorthChart netWorth={nw} />
          ) : (
            <p className="ov-note">Kein Verlauf verfügbar.</p>
          )}
        </section>
        <section className="ov-sheet-sec" aria-label="Stückliste der Monate">
          <SectionTitle letter="C">Stückliste der Monate</SectionTitle>
          <table className="ov-table ov-sheet-table" data-testid="yr-months">
            <thead>
              <tr>
                <th className="tech">Monat</th>
                <th className="tech n">Einkommen</th>
                <th className="tech n">Konsum</th>
                <th className="tech n">Zukunft</th>
                <th className="tech n">Sparquote</th>
                <th className="tech n">Nettovermögen</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.month}>
                  <th scope="row">{monthNameOnly(r.month)}</th>
                  <td className="n">{euroCellText(r.incomeCents)}</td>
                  <td className="n">{euroCellText(r.consumptionCents)}</td>
                  <td className="n">{euroCellText(r.futureCents)}</td>
                  <td className="n">{bpText(r.savingsRateBp, { decimals: 0 })}</td>
                  <td className="n">
                    {r.netWorthCents === null ? '–' : euroCellText(r.netWorthCents)}
                  </td>
                </tr>
              ))}
              <tr className="is-total">
                <th scope="row">Summe</th>
                <td className="n">{euroCellText(t.incomeCents)}</td>
                <td className="n">{euroCellText(t.consumptionCents)}</td>
                <td className="n">{euroCellText(t.futureCents)}</td>
                <td className="n">{bpText(t.savingsRateBp, { decimals: 0 })}</td>
                <td className="n">
                  {lastRow?.netWorthCents == null ? '–' : euroCellText(lastRow.netWorthCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      {titleBlock}
    </SheetFrame>
  );
}

function CategoriesTable({ report }: { report: YearReport }) {
  const rows = report.categories;
  const max = rows[0]?.cents ?? 1;
  return (
    <>
      <table className="ov-table ov-sheet-table" data-testid="yr-categories">
        <caption className="sr-only">Größte Kategorien des Jahres</caption>
        <tbody>
          {rows.map((c: YearCategoryRow) => (
            <tr key={c.categoryId}>
              <th scope="row">
                <ClassSwatch kind={c.class} />
                {c.name}
              </th>
              <td className="ov-bar" aria-hidden="true">
                <i style={{ width: `${(c.cents / max) * 100}%` }} />
              </td>
              <td className="n">{eur(c.cents, { cents: false })}</td>
              <td className="n">
                {c.changeBp === null ? (
                  ''
                ) : (
                  <small>{bpText(c.changeBp, { sign: true, decimals: 0 })}</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ov-sheet-note">
        {report.comparedMonths > 0
          ? `Rechts: Veränderung zu ${report.year - 1}, gleiche ${report.comparedMonths} ${report.comparedMonths === 1 ? 'Monat' : 'Monate'}.`
          : `Ohne Vergleich: ${report.year - 1} liegt nicht im Hauptbuch.`}
      </p>
    </>
  );
}

function SharesBar({ report }: { report: YearReport }) {
  const s = report.shares;
  if (!s) return <p className="ov-sheet-note">Ohne Einkommen keine Verteilung.</p>;
  const parts = [
    { key: 'need', label: 'Bedarf', value: s.need },
    { key: 'want', label: 'Wunsch', value: s.want },
    { key: 'future', label: 'Zukunft', value: s.future },
  ] as const;
  return (
    <div data-testid="yr-shares">
      <ul className="ov-shares">
        {parts.map((p) => (
          <li key={p.key}>
            <ClassSwatch kind={p.key} />
            <span>{p.label}</span>
            <strong>{p.value} %</strong>
          </li>
        ))}
        <li>
          <span className="ov-shares-rest" aria-hidden="true" />
          <span>{s.rest < 0 ? 'Aus Guthaben' : 'Übrig'}</span>
          <strong>{s.rest < 0 ? `−${-s.rest}` : s.rest} %</strong>
        </li>
      </ul>
      <p className="ov-sheet-note">
        Anteile am Einkommen, Bedarf, Wunsch und Zukunft wie die Regeln sie zählen (periodische
        Kosten in Zwölfteln); zusammen 100 %.
      </p>
    </div>
  );
}

function findingRow(f: YearFinding, year: number): { text: string; value: string } {
  const whole = (c: number, sign = false) => eur(c, { cents: false, sign });
  switch (f.kind) {
    case 'priciestMonth':
      return { text: `Teuerster Monat: ${monthNameOnly(f.month)} (Konsum)`, value: whole(f.cents) };
    case 'incomeChange':
      return {
        text: `Einkommen gegenüber ${year - 1}, gleiche Monate`,
        value: whole(f.deltaCents, true),
      };
    case 'special':
      return { text: 'Sonderzahlungen im Jahr', value: whole(f.cents, true) };
    case 'capital':
      return { text: 'Kapitalerträge, nicht im Einkommen', value: whole(f.cents, true) };
    case 'categoryRise':
      return { text: `Stärkster Anstieg: ${f.name}`, value: whole(f.deltaCents, true) };
    case 'categoryDrop':
      return { text: `Stärkster Rückgang: ${f.name}`, value: whole(f.deltaCents, true) };
    case 'marketBest':
      return { text: `Markt: bester Monat ${monthNameOnly(f.month)}`, value: whole(f.cents, true) };
    case 'marketWorst':
      return {
        text: `Markt: schwächster Monat ${monthNameOnly(f.month)}`,
        value: whole(f.cents, true),
      };
  }
}

function SheetTwo({ data, titleBlock }: { data: YearReportRead; titleBlock: React.ReactNode }) {
  const { report, rules } = data;
  const violated = rules?.cells.filter((c) => c.status === 'bad') ?? [];
  const heatRows = report.categories.map((c) => ({
    c,
    heat: overviewHeat(c.byMonth, 'low'),
  }));
  const findings = report.findings.slice(0, 8);
  return (
    <SheetFrame label={`Jahresreport ${report.year}, Blatt 2`}>
      <header className="ov-sheet-head">
        <h2>{report.year} · Ausgaben und Regeln</h2>
      </header>
      <div className="ov-sheet-grid">
        <section className="ov-sheet-sec" aria-label="Größte Kategorien">
          <SectionTitle letter="D">Größte Kategorien</SectionTitle>
          <CategoriesTable report={report} />
        </section>
        <div className="ov-sheet-stack">
          <section className="ov-sheet-sec" aria-label="Verteilung 50/30/20">
            <SectionTitle letter="E">Verteilung 50/30/20</SectionTitle>
            <SharesBar report={report} />
          </section>
          <section className="ov-sheet-sec" aria-label="Finanz-Check zum Jahresende">
            <SectionTitle letter="F">Finanz-Check zum Jahresende</SectionTitle>
            {rules ? (
              <div data-testid="yr-rules">
                <p className="ov-sheet-kpi">
                  <strong>{rules.okCount}</strong>
                  <span>
                    von {rules.total} Regeln erfüllt ({longDay(rules.asOf)})
                  </span>
                </p>
                <div
                  className="ov-cells"
                  role="img"
                  aria-label={rules.cells
                    .map((c) => `${c.code} ${STATUS_WORD[c.status]}`)
                    .join(', ')}
                >
                  {rules.cells.map((c) => (
                    <span
                      key={c.code}
                      className={`ov-cell is-${c.status}`}
                      title={`${c.code} ${c.name}: ${STATUS_WORD[c.status]}`}
                    />
                  ))}
                </div>
                <p className="ov-sheet-note">
                  Verletzt:{' '}
                  {violated.length > 0
                    ? violated.map((c) => `${c.code} ${c.name}`).join(', ')
                    : 'keine'}
                </p>
              </div>
            ) : (
              <p className="ov-sheet-note" role="status">
                Für das Ende dieses Jahres sind keine Regelergebnisse gespeichert; sie reichen zwölf
                Monatsenden zurück.
              </p>
            )}
          </section>
        </div>
      </div>
      <section className="ov-sheet-sec" aria-label="Kategorie nach Monat">
        <SectionTitle letter="G">Kategorie × Monat</SectionTitle>
        <div
          className="ov-scroll"
          role="region"
          aria-label="Kategorie nach Monat, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the wide table.
          tabIndex={0}
        >
          <table className="ov-table ov-sheet-table ov-heat-table" data-testid="yr-heat">
            <thead>
              <tr>
                <th className="tech">Kategorie</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="tech n">
                    {monthShort(`${report.year}-${String(i + 1).padStart(2, '0')}`)}
                  </th>
                ))}
                <th className="tech n">Summe</th>
              </tr>
            </thead>
            <tbody>
              {heatRows.map(({ c, heat }) => (
                <tr key={c.categoryId}>
                  <th scope="row">
                    <ClassSwatch kind={c.class} />
                    {c.name}
                  </th>
                  {c.byMonth.map((v, i) => {
                    const h = heat[i];
                    return (
                      <td
                        key={i}
                        className={`n${h ? ` ov-hc is-${h.tone}` : ''}`}
                        style={
                          h ? ({ '--h': h.strength.toFixed(2) } as React.CSSProperties) : undefined
                        }
                      >
                        {v === null ? (
                          <span className="muted">·</span>
                        ) : (
                          wholeText(Math.round(v / 100))
                        )}
                      </td>
                    );
                  })}
                  <td className="n">
                    <strong>{wholeText(Math.round(c.cents / 100))}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ov-sheet-note">
          Tönung je Zeile gegen ihren Durchschnitt: Rot teurer, Grün günstiger; die Zahl bleibt das
          Signal. Die zehn größten Kategorien in Bedarf und Wunsch.
        </p>
      </section>
      <section className="ov-sheet-sec" aria-label="Revisionen des Jahres">
        <SectionTitle letter="H">Revisionen des Jahres</SectionTitle>
        {findings.length === 0 ? (
          <p className="ov-sheet-note">Keine Auffälligkeiten.</p>
        ) : (
          <table className="ov-table ov-sheet-table" data-testid="yr-findings">
            <caption className="sr-only">Auffälligkeiten des Jahres</caption>
            <tbody>
              {findings.map((f, i) => {
                const row = findingRow(f, report.year);
                return (
                  <tr key={`${f.kind}-${i}`}>
                    <td className="tech ov-rev-no">{String.fromCharCode(65 + i)}</td>
                    <td>{row.text}</td>
                    <td className="n">
                      <strong>{row.value}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {titleBlock}
    </SheetFrame>
  );
}
