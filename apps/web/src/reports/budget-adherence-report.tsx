import { chartShare } from '../charts/tooltip-data';
import { ChartValue } from '@budget/ui';
import { useAmountPrivacy, ClassSwatch, DimensionChain } from '@budget/ui';
import { cents } from '@budget/domain';
import type { AllocationRow, BudgetAdherenceReport } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { request } from '../api/http';
import { eur, longDay, MINUS } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import { monthLabel } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';

const adherenceQuery = (month: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'budget-adherence', month],
    retry: false,
    queryFn: () =>
      request<BudgetAdherenceReport>('GET', `/api/reports/spending/adherence?month=${month}`),
  });

const CLASS_NAME = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' } as const;

/** 2.2 Budgettreue inkl. 50/30/20: Halten wir den Plan, stimmt 50/30/20? */
export function BudgetAdherenceReportPage({
  report,
  meta,
}: {
  report: ReportEntry;
  meta: PageMeta;
}) {
  useAmountPrivacy();
  const [month, shift] = useMonth();
  const query = useQuery(adherenceQuery(month));
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
            ? `${monthLabel(month)}${data.live ? ' bis ' + longDay(data.liveUntil as string) : ''}`
            : 'wird geladen'
      }
      reportStand={{
        label: 'Stichtag',
        value: data?.live ? `${longDay(data.liveUntil as string)} · laufender Monat` : 'Monatsende',
      }}
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
                <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <span data-testid="sr-month">{monthLabel(month)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Nächster Monat"
                onClick={() => shift(1)}
              >
                <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          ),
        },
      ]}
    >
      <div className="kview sr" data-testid="budget-adherence">
        <ReportQuery query={query} what="Budgettreue">
          {(result) => <Body data={result} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function Unavailable({ data }: { data: BudgetAdherenceReport }) {
  useAmountPrivacy();
  const text =
    data.status === 'no_budget'
      ? 'Es gibt noch kein Budgetkonto. Sobald eines angelegt ist, zeigt dieser Report Plan und Ist.'
      : data.status === 'before_start'
        ? `Vor ${monthLabel(data.firstMonth as string)} gibt es keine Aufzeichnungen im Budget.`
        : 'Dieser Monat liegt in der Zukunft: es gibt weder Plan noch Ist.';
  return (
    <section className="sr-card sr-wide" aria-labelledby="ba-empty">
      <div className="sr-head">
        <h2 id="ba-empty">{monthLabel(data.month)}</h2>
      </div>
      <p className="sr-empty" role="status">
        {text}
      </p>
    </section>
  );
}

function Body({ data }: { data: BudgetAdherenceReport }) {
  useAmountPrivacy();
  if (data.status !== 'ok') return <Unavailable data={data} />;
  const day = data.liveUntil ? `${Number(data.liveUntil.slice(8, 10))}.` : null;
  const max = Math.max(1, ...data.items.map((x) => Math.max(x.istCents, x.planCents)));
  const drill = (id: string) => ({
    kategorie: id,
    von: `${data.month}-01`,
    bis: data.liveUntil ?? `${data.month}-31`,
  });
  return (
    <>
      <section className="sr-card" aria-labelledby="ba-main">
        <div className="sr-head">
          <h2 id="ba-main">
            {monthLabel(data.month)}
            {day ? ` · bis ${day}` : ''}
          </h2>
          {data.overCount > 0 ? (
            <span className={`sr-status ${data.live ? 'is-action' : ''}`}>
              <AlertTriangle size={15} strokeWidth={1.75} aria-hidden="true" />
              {data.overCount} über Plan
            </span>
          ) : (
            <span className="sr-status is-ok">
              <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden="true" />
              {data.items.length ? 'alles im Plan' : 'nichts geplant'}
            </span>
          )}
        </div>
        <div className="sr-fig">
          <span>Kategorien über Plan</span>
          <strong data-testid="ba-over">
            {data.overCount} von {data.items.length}
          </strong>
        </div>
        <DimensionChain
          label="Maßkette Plan gegen Ist"
          precision="cent"
          terms={[
            { label: 'Plan', value: cents(data.planCents) },
            { label: data.live ? 'Ist bis heute' : 'Ist', op: '-', value: cents(data.istCents) },
            {
              label: data.restCents >= 0 ? 'Rest' : 'Überzogen',
              op: '=',
              value: cents(data.restCents),
              result: true,
            },
          ]}
        />
        {data.items.length === 0 ? (
          <p className="sr-empty" role="status">
            In diesem Monat ist nichts zugewiesen und nichts ausgegeben.
          </p>
        ) : (
          <div className="sr-bullets">
            {data.groups.map((group) => (
              <div className="sr-bl-grp" key={group}>
                <h3>{group}</h3>
                {data.items
                  .filter((x) => x.groupName === group)
                  .map((x) => (
                    <div className={`sr-bl${x.over ? ' is-over' : ''}`} key={x.id}>
                      <AppLink to="/konten/buchungen" search={drill(x.id)} className="sr-name">
                        <ClassSwatch kind={x.class} />
                        <span>{x.name}</span>
                      </AppLink>
                      <ChartValue
                        label="Ist und Plan"
                        date={data.month}
                        series={[
                          { name: 'Ist', value: eur(x.istCents), color: `var(--${x.class})` },
                          { name: 'Plan', value: eur(x.planCents), color: 'var(--line-2)' },
                        ]}
                      >
                        <span
                          className="sr-bl-track"
                          role="img"
                          aria-label={`Ist ${eur(x.istCents)} von Plan ${eur(x.planCents)}`}
                        >
                          <i
                            className={`sr-bl-ist sw-${x.class}`}
                            style={{ width: `${(Math.max(0, x.istCents) / max) * 100}%` }}
                          />
                          {x.planCents > 0 ? (
                            <i
                              className="sr-bl-plan"
                              style={{ left: `${Math.min(99.5, (x.planCents / max) * 100)}%` }}
                            />
                          ) : null}
                        </span>
                      </ChartValue>
                      <span className="sr-val">
                        <strong>{eur(x.istCents, { cents: false })}</strong>
                        <small>/ {eur(x.planCents, { cents: false })}</small>
                      </span>
                      <span className="sr-bl-diff">
                        {x.over ? (
                          <span className="sr-status is-action">
                            {data.live ? (
                              <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                            ) : null}
                            {eur(x.istCents - x.planCents, { cents: false, sign: true })}
                          </span>
                        ) : (
                          eur(x.istCents - x.planCents, { cents: false, sign: true })
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
        <p className="sr-note">
          Balken = Ist, senkrechte Marke = Plan (das im Plan zugewiesene Geld). Periodische
          Kategorien zählen mit ihrer Rücklage: Übertrag plus Zuweisung, weil die Jahresrechnung aus
          dem Angesparten bezahlt wird.
          {data.live ? ' Rot heißt: jetzt handeln, im Plan umschichten.' : ''}
        </p>
      </section>

      <section className="sr-card" aria-labelledby="ba-523">
        <div className="sr-head">
          <h2 id="ba-523">50/30/20 je Monat</h2>
          <span className="sr-state">zugewiesenes Geld</span>
        </div>
        {data.allocation.length === 0 ? (
          <p className="sr-empty" role="status">
            Es gibt noch keinen geschlossenen Monat.
          </p>
        ) : (
          <div className="sr-523" role="list" aria-label="Aufteilung der Einnahmen je Monat">
            {data.allocation.map((row) => (
              <Allocation key={row.month} row={row} current={row.month === data.month} />
            ))}
          </div>
        )}
        <ul className="sr-leg">
          {(['need', 'want', 'future'] as const).map((c, i) => (
            <li key={c}>
              <ClassSwatch kind={c} />
              {CLASS_NAME[c]} · Soll {[50, 30, 20][i]} %
            </li>
          ))}
          <li>
            <i className="sw sw-rest" aria-hidden="true" />
            Übrig / aus Guthaben
          </li>
        </ul>
        <p className="sr-note">
          Je Zeile zusammen 100 % der Haushaltseinnahmen: Bedarf, Wunsch und Zukunft plus Rest
          (übrig, oder {MINUS} aus Guthaben). Periodische Kosten, Sonderzahlungen und ihre
          Umbuchungen zählen als Zwölftel. Kapitalerträge und Erstattungen sind kein
          Haushaltseinkommen und fehlen in der Basis.
        </p>
      </section>

      <section className="sr-card sr-wide" aria-labelledby="ba-dev">
        <div className="sr-head">
          <h2 id="ba-dev">Planabweichung, rollierend 12 Monate</h2>
          <span className="sr-state">Ziel ± 10 %</span>
        </div>
        {data.deviation.rows.length === 0 ? (
          <p className="sr-empty" role="status">
            Für die letzten geschlossenen Monate ist noch nichts zugewiesen.
          </p>
        ) : (
          <ScrollRegion label="Planabweichung je Kategorie, bei Bedarf horizontal verschiebbar">
            <table className="sr-table">
              <caption className="sr-only">
                Zugewiesen und ausgegeben je Kategorie, 12 Monate bis {data.deviation.to}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Kategorie</th>
                  <th scope="col" className="n">
                    Plan 12 M
                  </th>
                  <th scope="col" className="n">
                    Ist 12 M
                  </th>
                  <th scope="col" className="n">
                    Abweichung
                  </th>
                  <th scope="col">Einordnung</th>
                </tr>
              </thead>
              <tbody>
                {data.deviation.rows.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <span className="sr-name">
                        <ClassSwatch kind={r.class} />
                        <span>{r.name}</span>
                      </span>
                    </th>
                    <td className="n">{eur(r.planCents, { cents: false })}</td>
                    <td className="n">{eur(r.istCents, { cents: false })}</td>
                    <td className="n">
                      <strong>
                        {r.deviationBp === null
                          ? eur(r.deviationCents, { cents: false, sign: true })
                          : bpText(r.deviationBp, { sign: true })}
                      </strong>
                      {r.deviationBp === null && (
                        <small>Kein Prozentvergleich · absolute Abweichung</small>
                      )}
                    </td>
                    <td>
                      {r.inBand === null ? (
                        <span className="sr-status">Abweichung in Euro</span>
                      ) : r.inBand ? (
                        <span className="sr-status is-ok">
                          <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                          im Band
                        </span>
                      ) : (
                        <span className="sr-status">
                          <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                          Plan anpassen?
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
        <p className="sr-note">
          Plan = zugewiesenes Geld der zwölf Monate
          {data.deviation.from && data.deviation.to
            ? ` (${longDay(data.deviation.from)} bis ${longDay(data.deviation.to)})`
            : ''}
          , Ist = Nettoausgaben. Die zehn größten Abweichungen.
        </p>
      </section>
    </>
  );
}

function Allocation({ row, current }: { row: AllocationRow; current: boolean }) {
  useAmountPrivacy();
  const spend = row.needCents + row.wantCents + row.futureCents;
  const total = Math.max(row.incomeCents, spend);
  const width = (c: number) => `${total > 0 ? (Math.max(0, c) / total) * 100 : 0}%`;
  const { need, want, future, rest } = row.shares;
  const hasIncome = row.incomeCents > 0;
  return (
    <div className={`sr-523-row${current ? ' is-cur' : ''}`} role="listitem">
      <span className="sr-523-month">{monthShort(row.month)}</span>
      <ChartValue
        label="Verteilung 50/30/20"
        date={row.month}
        series={[
          {
            name: 'Bedarf',
            value: `${eur(row.needCents)} · ${chartShare(row.needCents, row.incomeCents)}`,
            color: 'var(--need)',
          },
          {
            name: 'Wunsch',
            value: `${eur(row.wantCents)} · ${chartShare(row.wantCents, row.incomeCents)}`,
            color: 'var(--want)',
          },
          {
            name: 'Zukunft',
            value: `${eur(row.futureCents)} · ${chartShare(row.futureCents, row.incomeCents)}`,
            color: 'var(--future)',
          },
          {
            name: 'Übrig / aus Guthaben',
            value: `${eur(row.restCents)} · ${chartShare(row.restCents, row.incomeCents)}`,
            color: 'var(--ink-3)',
          },
        ]}
      >
        <span
          className="sr-523-bar"
          role="img"
          aria-label={
            hasIncome
              ? `${monthShort(row.month)}: Bedarf ${need} %, Wunsch ${want} %, Zukunft ${future} %, ${rest < 0 ? 'aus Guthaben' : 'übrig'} ${Math.abs(rest)} %`
              : `${monthShort(row.month)}: keine Haushaltseinnahmen`
          }
        >
          <span className="sw-need" style={{ width: width(row.needCents) }} />
          <span className="sw-want" style={{ width: width(row.wantCents) }} />
          <span className="sw-future" style={{ width: width(row.futureCents) }} />
          {row.restCents > 0 ? (
            <span className="sr-523-rest" style={{ width: width(row.restCents) }} />
          ) : null}
          {hasIncome ? (
            <>
              <i
                className="sr-523-mark"
                style={{ left: `${((row.incomeCents * 0.5) / total) * 100}%` }}
              />
              <i
                className="sr-523-mark"
                style={{ left: `${((row.incomeCents * 0.8) / total) * 100}%` }}
              />
              {spend > row.incomeCents ? (
                <i
                  className="sr-523-mark is-full"
                  style={{ left: `${(row.incomeCents / total) * 100}%` }}
                />
              ) : null}
            </>
          ) : null}
        </span>
      </ChartValue>
      <span className="sr-523-num">
        {hasIncome ? (
          <>
            {need}/{want}/{future}
            <small className={rest < 0 ? 'is-worse' : 'is-better'}>
              {rest < 0 ? MINUS : '+'}
              {Math.abs(rest)}
            </small>
          </>
        ) : (
          '–'
        )}
      </span>
    </div>
  );
}
