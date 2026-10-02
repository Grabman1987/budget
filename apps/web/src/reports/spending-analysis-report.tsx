import { cents, heatCells } from '@budget/domain';
import type { SpendingReport } from '@budget/db';
import { ClassSwatch, DimensionChain } from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { request } from '../api/http';
import { eur, longDay } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  bpText,
  monthShort,
  PeriodSwitch,
  periodName,
  ReportQuery,
  ScrollRegion,
  useReportPeriod,
} from './spending-shared';
import type { SpendingPeriod } from '@budget/domain';

const analysisQuery = (period: SpendingPeriod) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'spending-analysis', period],
    retry: false,
    queryFn: () =>
      request<SpendingReport>('GET', `/api/reports/spending/analysis?period=${period}`),
  });

const CLASS_NAME = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' } as const;

/** 2.1 Ausgabenanalyse: Wofür geben wir Geld aus? */
export function SpendingAnalysisReport({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const [period, setPeriod] = useReportPeriod();
  const query = useQuery(analysisQuery(period));
  const data = query.data && !query.isFetching ? query.data : undefined;
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
              : 'keine geschlossenen Monate'
            : 'wird geladen'
      }
      reportStand={{
        label: 'Stichtag',
        value: data?.to ? `${longDay(data.to)} · Monatsende` : 'Monatsende',
      }}
      extraFields={[
        {
          label: 'Zeitraum',
          value: <PeriodSwitch period={period} onChange={setPeriod} />,
        },
      ]}
    >
      <div className="kview sr" data-testid="spending-analysis">
        <ReportQuery query={query} what="Ausgabenanalyse">
          {(report) => <Body data={report} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: SpendingReport }) {
  if (data.months.length === 0)
    return (
      <section className="sr-card sr-wide" aria-labelledby="sa-empty">
        <div className="sr-head">
          <h2 id="sa-empty">Noch keine geschlossenen Monate</h2>
        </div>
        <p className="sr-empty" role="status">
          Sobald ein Budgetkonto einen vollen Monat Buchungen hat, erscheint hier die
          Ausgabenanalyse.
        </p>
      </section>
    );
  const total = data.consumptionCents + data.futureCents;
  const range = `${longDay(data.from as string)} bis ${longDay(data.to as string)}`;
  const parts = [
    { id: 'need', cents: data.needCents, pct: data.classShares.need },
    { id: 'want', cents: data.wantCents, pct: data.classShares.want },
    { id: 'future', cents: data.futureCents, pct: data.classShares.future },
  ] as const;
  const maxRow = Math.max(1, ...data.rows.map((r) => r.cents));
  const maxMove = Math.max(1, ...data.moves.map((m) => Math.abs(m.changeCents)));
  const heatLabels = data.heatMonths.map(monthShort);
  const drill = (id: string) => ({
    kategorie: id,
    von: data.from as string,
    bis: data.to as string,
  });
  return (
    <>
      <section className="sr-card" aria-labelledby="sa-main">
        <div className="sr-head">
          <h2 id="sa-main">Konsum · {periodName(data.period, data.months)}</h2>
          <span className="sr-state">
            Ø {eur(data.averagePerMonthCents, { cents: false })} je Monat
          </span>
        </div>
        <p className="sr-range">{range}</p>
        <div className="sr-fig">
          <span>Bedarf und Wunsch, netto</span>
          <strong data-testid="sa-consumption">{eur(data.consumptionCents)}</strong>
        </div>
        <DimensionChain
          label="Maßkette Konsum"
          precision="cent"
          terms={[
            { label: 'Bedarf', value: cents(data.needCents) },
            { label: 'Wunsch', op: '+', value: cents(data.wantCents) },
            { label: 'Konsum', op: '=', value: cents(data.consumptionCents), result: true },
          ]}
        />
        {total > 0 ? (
          <>
            <div
              className="sr-seg"
              role="img"
              aria-label={`Bedarf ${data.classShares.need} %, Wunsch ${data.classShares.want} %, Zukunft ${data.classShares.future} %`}
            >
              {parts.map((p) => (
                <span
                  key={p.id}
                  className={`sw-${p.id}`}
                  style={{ width: `${(Math.max(0, p.cents) / total) * 100}%` }}
                />
              ))}
            </div>
            <ul className="sr-seg-leg">
              {parts.map((p) => (
                <li key={p.id}>
                  <ClassSwatch kind={p.id} />
                  {CLASS_NAME[p.id]} <strong>{p.pct} %</strong> {eur(p.cents, { cents: false })}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="sr-note">
          Anteile an allem, was abgeflossen ist; Zukunft bleibt im Vermögen und zählt nicht zum
          Konsum. Erstattungen mindern die Kategorie, in der sie gebucht sind.
        </p>
      </section>

      <section className="sr-card" aria-labelledby="sa-moves">
        <div className="sr-head">
          <h2 id="sa-moves">Größte Veränderungen</h2>
          {data.changeCents !== null && (
            <span className={`sr-state ${data.changeCents <= 0 ? 'is-good' : 'is-bad'}`}>
              {eur(data.changeCents, { cents: false, sign: true })}
              {data.changeBp !== null ? ` · ${bpText(data.changeBp, { sign: true })}` : ''}
            </span>
          )}
        </div>
        {data.previousFrom && data.previousTo ? (
          data.moves.length ? (
            <>
              <ul className="sr-bars sr-moves" aria-label="Veränderung gegen die Vorperiode">
                {data.moves.map((m) => (
                  <li key={m.id}>
                    <span className="sr-name">
                      <ClassSwatch kind={m.class} />
                      <span>{m.name}</span>
                    </span>
                    <span className="sr-track" aria-hidden="true">
                      <i
                        className={m.changeCents < 0 ? 'is-less' : 'is-more'}
                        style={{ width: `${(Math.abs(m.changeCents) / maxMove) * 50}%` }}
                      />
                    </span>
                    <span className="sr-val">
                      <strong className={m.changeCents <= 0 ? 'is-better' : 'is-worse'}>
                        {eur(m.changeCents, { cents: false, sign: true })}
                      </strong>
                      <small>
                        {eur(m.previousCents ?? 0, { cents: false })} →{' '}
                        {eur(m.cents, { cents: false })}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="sr-note">
                Gegen die gleich lange Vorperiode ({longDay(data.previousFrom)} bis{' '}
                {longDay(data.previousTo)}); rechts mehr, links weniger ausgegeben.
              </p>
            </>
          ) : (
            <p className="sr-empty">Keine Veränderung gegen die Vorperiode.</p>
          )
        ) : (
          <p className="sr-empty" role="status">
            Für diesen Zeitraum gibt es keine gleich lange Vorperiode.
          </p>
        )}
      </section>

      <section className="sr-card sr-wide" aria-labelledby="sa-cats">
        <div className="sr-head">
          <h2 id="sa-cats">Nach Kategorie</h2>
          <span className="sr-state">{data.rows.length} Kategorien</span>
        </div>
        {data.rows.length === 0 ? (
          <p className="sr-empty" role="status">
            In diesem Zeitraum gibt es keine Ausgaben in Bedarf oder Wunsch.
          </p>
        ) : (
          <ul className="sr-bars is-cols" aria-label="Kategorien nach Ausgaben sortiert">
            {data.rows.map((r) => (
              <li key={r.id}>
                <AppLink to="/konten/buchungen" search={drill(r.id)} className="sr-name">
                  <ClassSwatch kind={r.class} />
                  <span>{r.name}</span>
                </AppLink>
                <span className="sr-track" aria-hidden="true">
                  <i
                    className={`sw-${r.class}`}
                    style={{ width: `${(r.cents / maxRow) * 100}%` }}
                  />
                </span>
                <span className="sr-val">
                  {eur(r.cents, { cents: false })}
                  {r.previousCents ? (
                    <small
                      className={r.cents <= r.previousCents ? 'is-better' : 'is-worse'}
                      aria-label="Veränderung zur Vorperiode"
                    >
                      {bpText(
                        Math.round(((r.cents - r.previousCents) / r.previousCents) * 10_000),
                        {
                          sign: true,
                          digits: 0,
                        },
                      )}
                    </small>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="sr-note">Jede Zeile öffnet die zugehörigen Buchungen des Zeitraums.</p>
      </section>

      <section className="sr-card sr-wide" aria-labelledby="sa-heat">
        <div className="sr-head">
          <h2 id="sa-heat">Heatmap Kategorie × Monat</h2>
          <span className="sr-state">
            {heatLabels[0]} bis {heatLabels[heatLabels.length - 1]}
          </span>
        </div>
        {data.heatRows.length === 0 ? (
          <p className="sr-empty">Keine Ausgaben für die Heatmap.</p>
        ) : (
          <ScrollRegion label="Heatmap Kategorie mal Monat, bei Bedarf horizontal verschiebbar">
            <table className="sr-table sr-heat">
              <caption className="sr-only">
                Ausgaben je Kategorie und Monat, eingefärbt gegen den Durchschnitt der Zeile
              </caption>
              <thead>
                <tr>
                  <th scope="col">Kategorie</th>
                  {heatLabels.map((label) => (
                    <th key={label} scope="col" className="n">
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="n">
                    Summe
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.heatRows.map((row) => {
                  const cells = heatCells(row.values, 'low');
                  return (
                    <tr key={row.id}>
                      <th scope="row" title={row.name}>
                        <span className="sr-name">
                          <ClassSwatch kind={row.class} />
                          <span>{row.name}</span>
                        </span>
                      </th>
                      {row.values.map((v, i) => {
                        const cell = cells[i];
                        const tone =
                          cell?.tone === 'bad' ? 'is-red' : cell?.tone === 'good' ? 'is-green' : '';
                        return (
                          <td
                            key={data.heatMonths[i]}
                            className={`n ${tone}${v < 0 ? ' is-refund' : ''}`}
                            style={{ '--h': cell?.level.toFixed(2) ?? '0' } as CSSProperties}
                          >
                            {v === 0 ? (
                              <span aria-label="nichts ausgegeben">·</span>
                            ) : (
                              eur(v, { cents: false })
                            )}
                          </td>
                        );
                      })}
                      <td className="n">
                        <strong>{eur(row.totalCents, { cents: false })}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="sr-note">
          Farbe je Zeile gegen den Durchschnitt der Kategorie: Rot = teurer Monat, Grün = günstiger;
          innerhalb von 8 % bleibt die Zelle neutral. Eine gestrichelte Umrandung markiert einen
          Monat mit Netto-Erstattung. So fallen Saisonmuster auf.
        </p>
      </section>
    </>
  );
}
