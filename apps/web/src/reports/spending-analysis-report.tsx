import {
  ChartValue,
  ClassSwatch,
  DimensionChain,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { cents, type SpendRow, type SpendingPeriod } from '@budget/domain';
import type { SpendingReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { request } from '../api/http';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { ReportAnswer } from './report-answer';
import { useCollapsibleSections } from './month-frame';
import { PeriodSwitch, periodName, ReportQuery, useReportPeriod } from './spending-shared';
import './spending-analysis-report.css';

const analysisQuery = (period: SpendingPeriod) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'spending-analysis', period],
    retry: false,
    queryFn: () =>
      request<SpendingReport>('GET', `/api/reports/spending/analysis?period=${period}`),
  });
const DEFAULT_COLLAPSED = ['sa-moves', 'sa-classes', 'sa-explorer'] as const;

/** The pilot report reuses the shared report controls and authoritative spending figures. */
export function SpendingAnalysisReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  useAmountPrivacy();
  const [period, setPeriod] = useReportPeriod();
  const query = useQuery(analysisQuery(period));
  const data = query.data && !query.isFetching ? query.data : undefined;
  const sections = useCollapsibleSections(report.id, DEFAULT_COLLAPSED);
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : data
            ? data.from && data.to
              ? `${longDay(data.from)} bis ${longDay(data.to)}`
              : 'keine Monatsdaten'
            : 'wird geladen'
      }
      reportStand={{ label: 'Stichtag', value: data?.to ? longDay(data.to) : '–' }}
      extraFields={[
        {
          label: 'Zeitraum',
          value: <PeriodSwitch period={period} onChange={setPeriod} />,
        },
      ]}
    >
      <div ref={sections} className="kview sr spending-analysis" data-testid="spending-analysis">
        <ReportQuery query={query} what="Ausgabenanalyse">
          {(result) => <Body data={result} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

interface CategoryRow extends SpendRow {
  previous: number | null;
  change: number | null;
}
interface SpendingGroup {
  id: string;
  name: string;
  rows: CategoryRow[];
  cents: number;
  previous: number | null;
}
const checkedSum = (values: number[]) => {
  let total = 0;
  for (const amount of values) {
    total += amount;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(total))
      throw new RangeError('Spending display exceeds safe integer cents');
  }
  return total;
};

/** Group only the supplied signed rows; previous figures belong to the exact-day comparison. */
export function spendingGroups(
  data: Pick<SpendingReport, 'breakdown' | 'answerComparison' | 'consumptionCents'>,
): SpendingGroup[] {
  const previous = new Map(data.answerComparison.rows.map((row) => [row.id, row.previousCents]));
  const groups = new Map<string, SpendingGroup>();
  for (const row of data.breakdown) {
    const prior = previous.get(row.id) ?? null;
    // Older metadata without an ID stays separate, never merged by a nonunique label.
    const key = row.groupId ?? `category:${row.id}`;
    const group = groups.get(key) ?? {
      id: key,
      name: row.groupName,
      rows: [],
      cents: 0,
      previous: null,
    };
    group.rows.push({
      ...row,
      previous: prior,
      change: prior === null ? null : checkedSum([row.cents, -prior]),
    });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.cents = checkedSum(group.rows.map((row) => row.cents));
    group.previous = group.rows.every((row) => row.previous !== null)
      ? checkedSum(group.rows.map((row) => row.previous!))
      : null;
    group.rows.sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  }
  const result = [...groups.values()].sort((a, b) => b.cents - a.cents || a.id.localeCompare(b.id));
  if (checkedSum(result.map((group) => group.cents)) !== data.consumptionCents)
    throw new Error('Spending groups do not match the supplied report total');
  return result;
}

function SignedBar({
  current,
  previous,
  minimum,
  maximum,
  label,
  date,
}: {
  current: number;
  previous: number | null;
  minimum: number;
  maximum: number;
  label: string;
  date: string;
}) {
  const width = maximum - minimum || 1;
  const point = (value: number) => ((value - minimum) / width) * 100;
  const left = point(Math.min(0, current));
  return (
    <ChartValue
      label={label}
      date={date}
      series={[
        { name: 'Aktuell', value: eur(current), color: 'var(--line)' },
        ...(previous === null
          ? []
          : [{ name: 'Vorzeitraum', value: eur(previous), color: 'var(--ink-3)' }]),
      ]}
    >
      <span
        className="sa-track"
        aria-hidden="true"
        style={{ '--sa-zero': `${point(0)}%` } as CSSProperties}
      >
        <i
          className={current < 0 ? 'is-refund' : undefined}
          style={{ left: `${left}%`, width: `${(Math.abs(current) / width) * 100}%` }}
        />
        {previous !== null && (
          <b className="sa-prior-tick" style={{ left: `${point(previous)}%` }} />
        )}
      </span>
    </ChartValue>
  );
}

function Body({ data }: { data: SpendingReport }) {
  useAmountPrivacy();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tableOpen, setTableOpen] = useState(false);
  if (data.months.length === 0)
    return (
      <section className="sr-card sr-wide" aria-labelledby="sa-empty">
        <div className="sr-head">
          <h2 id="sa-empty">Noch keine Monatsdaten</h2>
        </div>
        <p role="status">
          Sobald Monatswerte eines Budgetkontos vorliegen, erscheint hier die Ausgabenanalyse.
        </p>
      </section>
    );
  const groups = spendingGroups(data);
  const rows = groups.flatMap((group) => group.rows);
  const riser = rows
    .filter((row) => row.change !== null && row.change > 0)
    .sort((a, b) => b.change! - a.change! || a.id.localeCompare(b.id))[0];
  const moves = rows
    .filter((row) => row.change !== null && row.change !== 0)
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!) || a.id.localeCompare(b.id))
    .slice(0, 6);
  const amounts = groups.flatMap((group) => [
    group.cents,
    group.previous ?? 0,
    ...group.rows.flatMap((row) => [row.cents, row.previous ?? 0]),
  ]);
  const minimum = Math.min(0, ...amounts);
  const maximum = Math.max(1, ...amounts);
  const toggle = (id: string) =>
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const drill = (id: string) => ({
    kategorie: id,
    basis: 'category-spending',
    von: data.from,
    bis: data.to,
  });
  const comparison = data.answerComparison;
  const date = data.from && data.to ? `${data.from} · ${data.to}` : '';
  return (
    <>
      <section className="sr-card sr-wide" aria-labelledby="sa-main">
        <div className="sr-head">
          <h2 id="sa-main">01 · Konsum nach Gruppe</h2>
          <span className="sr-state">{periodName(data.period, data.months)}</span>
        </div>
        <p className="sr-range">
          {data.from && data.to
            ? `${longDay(data.from)} bis ${longDay(data.to)}`
            : 'Zeitraum nicht verfügbar'}
        </p>
        <div className="sr-fig">
          <span>Bedarf und Wunsch, netto</span>
          <strong data-testid="sa-consumption">{eur(data.consumptionCents)}</strong>
        </div>
        <ReportAnswer
          facts={{
            totalCents: data.consumptionCents,
            previousCents: comparison.previousCents,
            metric: 'expenses',
            ...(riser ? { biggestRiser: { name: riser.name, changeCents: riser.change! } } : {}),
          }}
        />
        {comparison.previousFrom && comparison.previousTo ? (
          <p className="sa-comparison">
            Vorzeitraum: {longDay(comparison.previousFrom)} bis {longDay(comparison.previousTo)} ·
            jeweils {comparison.days} Tage. Der Strich markiert den Vorzeitraum.
          </p>
        ) : (
          <p className="sa-comparison">
            Für diesen Zeitraum ist kein vollständig abgedeckter, gleich langer Vorzeitraum
            verfügbar.
          </p>
        )}
        <div
          role="img"
          aria-label={`Konsum nach Kategoriegruppe: ${eur(data.consumptionCents)}; ${groups.length} Gruppen, einschließlich Erstattungen. Vorzeitraum als Strich.`}
        />
        <ul className="sa-groups" aria-label="Konsum nach Kategoriegruppe">
          {groups.map((group, index) => {
            const open = expanded.has(group.id);
            const detailId = `sa-group-${index}`;
            return (
              <li key={group.id} data-group={group.id}>
                <div className="sa-row sa-group-row">
                  <button
                    type="button"
                    className="sa-group-name"
                    aria-expanded={open}
                    aria-controls={detailId}
                    onClick={() => toggle(group.id)}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                    <strong>{maskMoneyText(group.name)}</strong>
                  </button>
                  <SignedBar
                    current={group.cents}
                    previous={group.previous}
                    minimum={minimum}
                    maximum={maximum}
                    label={group.name}
                    date={date}
                  />
                  <AppLink
                    className="sa-amount"
                    to="/konten/buchungen"
                    search={
                      group.rows[0]?.groupId
                        ? {
                            kategoriegruppe: group.rows[0].groupId,
                            basis: 'category-spending',
                            von: data.from,
                            bis: data.to,
                          }
                        : drill(group.rows[0]!.id)
                    }
                    aria-label={`${maskMoneyText(group.name)} · ${eur(group.cents)} · Buchungen öffnen`}
                  >
                    {eur(group.cents)}
                  </AppLink>
                  <span className="sa-delta">
                    {group.previous === null
                      ? '–'
                      : eur(checkedSum([group.cents, -group.previous]), { sign: true })}
                  </span>
                </div>
                <ul id={detailId} className="sa-category-rows" hidden={!open}>
                  {group.rows.map((row) => (
                    <li key={row.id} className="sa-row" data-category={row.id}>
                      <span className="sa-category-name">
                        <ClassSwatch kind={row.class} />
                        {maskMoneyText(row.name)}
                      </span>
                      <SignedBar
                        current={row.cents}
                        previous={row.previous}
                        minimum={minimum}
                        maximum={maximum}
                        label={row.name}
                        date={date}
                      />
                      <AppLink
                        className="sa-amount"
                        to="/konten/buchungen"
                        search={drill(row.id)}
                        aria-label={`${maskMoneyText(row.name)} · ${eur(row.cents)} · Buchungen öffnen`}
                      >
                        {eur(row.cents)}
                      </AppLink>
                      <span className="sa-delta">
                        {row.change === null ? '–' : eur(row.change, { sign: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="btn sa-explorer-link"
          aria-expanded={tableOpen}
          aria-controls="sa-data-table"
          onClick={() => setTableOpen(!tableOpen)}
        >
          {tableOpen ? 'Tabelle ausblenden' : 'Tabelle anzeigen'}
        </button>
        <div id="sa-data-table" hidden={!tableOpen}>
          <table className="sr-table">
            <caption>Konsum nach Gruppe und Kategorie, netto in Euro</caption>
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Aktuell</th>
                <th scope="col">Vorzeitraum</th>
                <th scope="col">Differenz</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) => [
                <tr key={`group:${group.id}`}>
                  <th scope="row">{maskMoneyText(group.name)}</th>
                  <td>{eur(group.cents)}</td>
                  <td>{group.previous === null ? '–' : eur(group.previous)}</td>
                  <td>
                    {group.previous === null
                      ? '–'
                      : eur(checkedSum([group.cents, -group.previous]), { sign: true })}
                  </td>
                </tr>,
                ...group.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{maskMoneyText(row.name)}</th>
                    <td>{eur(row.cents)}</td>
                    <td>{row.previous === null ? '–' : eur(row.previous)}</td>
                    <td>{row.change === null ? '–' : eur(row.change, { sign: true })}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="sr-note">
          Konsum ist Bedarf plus Wunsch. Erstattungen mindern die jeweilige Kategorie; Zukunft
          bleibt im Vermögen. Beträge an den Kategorien öffnen die Buchungen dieses Zeitraums.
        </p>
      </section>
      <section className="sr-card sr-wide" aria-labelledby="sa-moves">
        <div className="sr-head">
          <h2 id="sa-moves">02 · Größte Veränderungen</h2>
          <span className="sr-state">
            {comparison.previousCents === null
              ? 'Kein Vorzeitraum'
              : eur(checkedSum([data.consumptionCents, -comparison.previousCents]), { sign: true })}
          </span>
        </div>
        {comparison.previousCents === null ? (
          <p>Kein gleich langer Vorzeitraum verfügbar.</p>
        ) : moves.length === 0 ? (
          <p>Keine Veränderung zum Vorzeitraum.</p>
        ) : (
          <ul className="sa-moves">
            {moves.map((row) => (
              <li key={row.id}>
                <AppLink to="/konten/buchungen" search={drill(row.id)}>
                  {maskMoneyText(row.name)}
                </AppLink>
                <span>
                  {eur(row.previous!)} → {eur(row.cents)}
                </span>
                <strong>{eur(row.change!, { sign: true })}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="sr-card sr-wide" aria-labelledby="sa-classes">
        <div className="sr-head">
          <h2 id="sa-classes">03 · Klassen und Zukunft</h2>
          <span className="sr-state">Zukunft {eur(data.futureCents)}</span>
        </div>
        {data.consumptionCents + data.futureCents > 0 && (
          <div
            className="sr-seg"
            role="img"
            aria-label={`Bedarf ${data.classShares.need} %, Wunsch ${data.classShares.want} %, Zukunft ${data.classShares.future} %`}
          >
            {(['need', 'want', 'future'] as const).map((kind) => (
              <span
                key={kind}
                className={`sw-${kind}`}
                style={{ width: `${data.classShares[kind]}%` }}
              />
            ))}
          </div>
        )}
        <DimensionChain
          label="Maßkette Konsum"
          precision="cent"
          terms={[
            { label: 'Bedarf', value: cents(data.needCents) },
            { label: 'Wunsch', op: '+', value: cents(data.wantCents) },
            { label: 'Konsum', op: '=', value: cents(data.consumptionCents), result: true },
          ]}
        />
        <p>Zukunft, außerhalb Konsum: {eur(data.futureCents)}.</p>
      </section>
      <section className="sr-card sr-wide" aria-labelledby="sa-explorer">
        <div className="sr-head">
          <h2 id="sa-explorer">04 · Auswertung</h2>
          <span className="sr-state">
            {data.months.length} Monate · {eur(data.consumptionCents)}
          </span>
        </div>
        <p>
          Die Kategorie×Monat-Tabelle zeigt denselben Zeitraum und dieselben Netto-Ausgaben
          einschließlich Erstattungen.
        </p>
        <AppLink
          className="sa-explorer-link"
          to="/reports/explorer"
          search={{
            vorlage: 'heatmap',
            exakt: true,
            zeitraum: `${data.months[0]}..${data.months.at(-1)}`,
          }}
        >
          In Auswertung öffnen
        </AppLink>
      </section>
    </>
  );
}
