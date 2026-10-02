import { cents } from '@budget/domain';
import type { ContractsReport } from '@budget/db';
import {
  AxisLine,
  ChartSvg,
  ClassSwatch,
  DimensionChain,
  Graticule,
  Line,
  LineLegend,
  XTicks,
} from '@budget/ui';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { request } from '../api/http';
import { eur, longDay, nativeCurrency } from '../ledger/format';
import { LEDGER_KEY } from '../ledger/queries';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { bpText, monthShort, ReportQuery, ScrollRegion } from './spending-shared';

const contractsQuery = queryOptions({
  queryKey: [...LEDGER_KEY, 'contracts-report'],
  retry: false,
  queryFn: () => request<ContractsReport>('GET', '/api/reports/spending/contracts'),
});

const RHYTHM = {
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  semiannual: 'halbjährlich',
  yearly: 'jährlich',
} as const;

const rate = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const rateText = (micro: number | null, currency: string) =>
  micro === null ? '–' : `${rate.format(micro / 1_000_000)} €/${currency}`;

/** 2.3 Verträge und Abos: Welche Verträge binden uns, und was lässt sich kündigen? */
export function ContractsReportPage({ report, meta }: { report: ReportEntry; meta: PageMeta }) {
  const query = useQuery(contractsQuery);
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
            ? `Erwartete Zahlungen am ${longDay(data.asOf)}`
            : 'wird geladen'
      }
      reportStand={{
        label: 'Stichtag',
        value: data ? `${longDay(data.asOf)} · heute` : 'heute',
      }}
    >
      <div className="kview sr" data-testid="contracts-report">
        <ReportQuery query={query} what="Verträge und Abos">
          {(result) => <Body data={result} />}
        </ReportQuery>
      </div>
    </PageFrame>
  );
}

function Body({ data }: { data: ContractsReport }) {
  if (data.items.length === 0)
    return (
      <section className="sr-card sr-wide" aria-labelledby="co-empty">
        <div className="sr-head">
          <h2 id="co-empty">Noch keine Verträge</h2>
        </div>
        <p className="sr-empty" role="status">
          Verträge entstehen aus erwarteten Zahlungen in Fix-, Kredit- und periodischen Kategorien.
          Sobald eine angelegt ist, erscheint sie hier mit Preis und Preisgeschichte.
        </p>
      </section>
    );
  const r10 = data.r10;
  const quote = r10?.ratioBp ?? null;
  const ok = quote !== null && r10 ? quote <= r10.maxBp : null;
  const raises = data.items
    .filter((i) => i.recentIncrease)
    .sort(
      (a, b) =>
        (b.recentIncrease?.yearlyEffectCents ?? 0) - (a.recentIncrease?.yearlyEffectCents ?? 0),
    );
  const raiseTotal = raises.reduce((a, i) => a + (i.recentIncrease?.yearlyEffectCents ?? 0), 0);
  return (
    <>
      <section className="sr-card" aria-labelledby="co-main">
        <div className="sr-head">
          <h2 id="co-main">Gebunden je Monat</h2>
          {quote !== null && r10 ? (
            <span className={`sr-status ${ok ? 'is-ok' : 'is-action'}`}>
              {ok ? (
                <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <AlertTriangle size={15} strokeWidth={1.75} aria-hidden="true" />
              )}
              Fixkostenquote {bpText(quote)} · Ziel ≤ {bpText(r10.maxBp, { digits: 0 })} (R10)
            </span>
          ) : (
            <span className="sr-state">Fixkostenquote ohne Einkommensbasis nicht berechenbar</span>
          )}
        </div>
        <div className="sr-fig">
          <span>Fixkosten plus periodische Zahlungen ÷ 12</span>
          <strong data-testid="co-bound">{eur(data.boundMonthlyCents)}</strong>
        </div>
        <DimensionChain
          label="Maßkette Verträge"
          precision="cent"
          terms={[
            { label: 'Verträge je Monat', value: cents(data.fixedMonthlyCents) },
            {
              label: 'Periodische ÷ 12',
              op: '+',
              value: cents(data.boundMonthlyCents - data.fixedMonthlyCents),
            },
            { label: 'Gebunden', op: '=', value: cents(data.boundMonthlyCents), result: true },
          ]}
        />
        {data.unconvertedCount > 0 && (
          <p className="sr-note" role="status">
            {data.unconvertedCount} Vertrag in Fremdwährung hat keinen gespeicherten Kurs und fehlt
            in den Summen.
          </p>
        )}
        <CostChart data={data} />
        <LineLegend items={[{ kind: 'actual', label: 'Verträge je Monat' }]} />
        <p className="sr-note">
          Dreiecke markieren eine Preisänderung oder einen neuen Vertrag; die Einträge stehen unten
          in der Vertragsliste.
          {data.seriesPartial ? ' Monate ohne Wechselkurs lassen die Fremdwährung aus.' : ''}
        </p>
      </section>

      <section className="sr-card" aria-labelledby="co-raise">
        <div className="sr-head">
          <h2 id="co-raise">Preis prüfen</h2>
          {raises.length > 0 && raiseTotal > 0 && (
            <span className="sr-state">
              +{eur(raiseTotal, { cents: false })} im Jahr durch Erhöhungen
            </span>
          )}
        </div>
        {raises.length === 0 ? (
          <p className="sr-empty" role="status">
            In den letzten zwölf Monaten hat kein Vertrag seinen Preis erhöht.
          </p>
        ) : (
          <ul className="sr-hints">
            {raises.map((i) => (
              <li key={i.id}>
                <strong>{i.name}</strong>
                <span>
                  {bpText(i.recentIncrease?.changeBp ?? null, { sign: true })} seit{' '}
                  {monthShort((i.recentIncrease?.from ?? '').slice(0, 7))}: Tarif vergleichen oder
                  verhandeln
                </span>
                {i.recentIncrease?.yearlyEffectCents ? (
                  <span className="sr-hint-val">
                    {eur(i.recentIncrease.yearlyEffectCents, { cents: false, sign: true })}
                    <small>im Jahr</small>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="sr-note">
          Vorschläge entstehen aus den gespeicherten Preisversionen der erwarteten Zahlungen.
          Bindung und Kündigungsfrist sind im Hauptbuch noch nicht erfasst; ohne diese Angaben nennt
          der Report keine Kündigungstermine.
        </p>
      </section>

      <section className="sr-card sr-wide" aria-labelledby="co-list">
        <div className="sr-head">
          <h2 id="co-list">Alle Verträge und Abos</h2>
          <span className="sr-state">
            {data.items.length} Positionen · {eur(data.yearlyCents, { cents: false })} im Jahr
          </span>
        </div>
        <ScrollRegion label="Alle Verträge, bei Bedarf horizontal verschiebbar">
          <table className="sr-table sr-parts" data-testid="contracts-table">
            <caption className="sr-only">
              Verträge nach Gruppe mit Preis je Monat und Jahr, Beginn, Ende und letzter
              Preisänderung
            </caption>
            <thead>
              <tr>
                <th scope="col">Pos</th>
                <th scope="col">Vertrag</th>
                <th scope="col" className="n">
                  je Monat
                </th>
                <th scope="col" className="n">
                  je Jahr
                </th>
                <th scope="col">seit</th>
                <th scope="col">Laufzeit</th>
                <th scope="col">Letzte Preisänderung</th>
              </tr>
            </thead>
            {data.groups.map((group, gi) => {
              const rows = data.items.filter((i) => i.groupName === group);
              const monthly = rows.reduce((a, i) => a + (i.monthlyCents ?? 0), 0);
              const yearly = rows.reduce((a, i) => a + (i.yearlyCents ?? 0), 0);
              return (
                <tbody key={group}>
                  <tr className="sr-grp">
                    <td>{gi + 1}</td>
                    <th scope="rowgroup">{group}</th>
                    <td className="n">
                      <strong>{eur(monthly)}</strong>
                    </td>
                    <td className="n">{eur(yearly, { cents: false })}</td>
                    <td colSpan={3} />
                  </tr>
                  {rows.map((i, n) => {
                    const change = [...i.changes].reverse().find((c) => c.previousCents !== null);
                    return (
                      <tr key={i.id}>
                        <td>
                          {gi + 1}.{n + 1}
                        </td>
                        <th scope="row">
                          <span className="sr-name">
                            {i.class ? <ClassSwatch kind={i.class} /> : null}
                            <span>{i.name}</span>
                          </span>
                          <small>
                            {RHYTHM[i.rhythm]}
                            {i.binding === 'periodic' ? ' · periodisch, als Zwölftel' : ''}
                          </small>
                        </th>
                        <td className="n">
                          {i.currency !== 'EUR' ? (
                            <>
                              {nativeCurrency(i.nativeCents, i.currency)}
                              <small>
                                {i.monthlyCents === null ? 'Kurs fehlt' : eur(i.monthlyCents)}
                              </small>
                            </>
                          ) : i.monthlyCents === null ? (
                            '–'
                          ) : (
                            eur(i.monthlyCents)
                          )}
                        </td>
                        <td className="n">
                          {i.yearlyCents === null ? '–' : eur(i.yearlyCents, { cents: false })}
                        </td>
                        <td>{i.since ? monthShort(i.since.slice(0, 7)) : '–'}</td>
                        <td>{i.endDate ? `bis ${longDay(i.endDate)}` : 'unbefristet'}</td>
                        <td>
                          {change ? (
                            <>
                              {monthShort(change.from.slice(0, 7))}
                              <small>
                                {nativeCurrency(change.previousCents ?? 0, change.currency)} →{' '}
                                {nativeCurrency(change.amountCents, change.currency)}
                                {change.changeBp !== null
                                  ? ` (${bpText(change.changeBp, { sign: true })})`
                                  : ''}
                              </small>
                            </>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </ScrollRegion>
        <p className="sr-note">
          Fixe Verträge zählen je Monat, periodische Zahlungen als Zwölftel; dieselbe Auswahl wie
          die Fixkostenquote (R10). Beträge in Fremdwährung stehen mit dem Originalbetrag und werden
          mit dem zuletzt gespeicherten Referenzkurs umgerechnet.{' '}
          <AppLink to="/plan/erwartet">Erwartete Zahlungen pflegen</AppLink>
        </p>
      </section>

      {data.foreign.length > 0 && (
        <section className="sr-card sr-wide" aria-labelledby="co-fx">
          <div className="sr-head">
            <h2 id="co-fx">Fremdwährung</h2>
            {data.foreignFrom && data.foreignTo && (
              <span className="sr-state">
                {longDay(data.foreignFrom)} bis {longDay(data.foreignTo)}
              </span>
            )}
          </div>
          <ScrollRegion label="Verträge in Fremdwährung, bei Bedarf horizontal verschiebbar">
            <table className="sr-table" data-testid="foreign-table">
              <caption className="sr-only">
                Preis in Originalwährung, Wert in Euro, bezahlte Euro und Durchschnittskurs
              </caption>
              <thead>
                <tr>
                  <th scope="col">Abo</th>
                  <th scope="col" className="n">
                    Preis
                  </th>
                  <th scope="col" className="n">
                    in EUR heute
                  </th>
                  <th scope="col" className="n">
                    12 Monate bezahlt
                  </th>
                  <th scope="col" className="n">
                    Ø Kurs
                  </th>
                  <th scope="col" className="n">
                    Bankgebühr
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.foreign.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">{f.name}</th>
                    <td className="n">{nativeCurrency(f.nativeCents, f.currency)}</td>
                    <td className="n">
                      {f.eurCents === null ? 'Kurs fehlt' : eur(f.eurCents)}
                      <small>{rateText(f.rateMicro, f.currency)}</small>
                    </td>
                    <td className="n">
                      {f.paymentCount ? eur(f.paidEurCents) : '–'}
                      {f.paymentCount ? (
                        <small>
                          {nativeCurrency(f.paidNativeCents, f.currency)} · {f.paymentCount}{' '}
                          Zahlungen
                        </small>
                      ) : null}
                    </td>
                    <td className="n">{rateText(f.averageRateMicro, f.currency)}</td>
                    <td className="n">{f.paymentCount ? eur(f.feeCents) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <p className="sr-note">
            So rechnet die App: Jede Buchung behält Originalbetrag und Währung. In Euro umgerechnet
            wird mit dem EZB-Referenzkurs des Buchungstags; weicht die Bank ab, gilt der Bankbetrag
            und die Differenz läuft als Fremdwährungsgebühr in 2.6. Die Spalte „in EUR heute“
            rechnet den Vertragspreis mit dem letzten gespeicherten Kurs; ein schwächerer Euro
            verteuert das Abo, ohne dass sich der Preis ändert.
            {data.foreign.some((f) => f.skippedSplitPayments > 0)
              ? ' Aufgeteilte Zahlungen sind keinem Vertrag zugeordnet und fehlen hier.'
              : ''}
          </p>
        </section>
      )}
    </>
  );
}

const W = 760;
const H = 250;
const L = 52;
const R = 76;
const T = 30;
const B = 214;

function CostChart({ data }: { data: ContractsReport }) {
  const points = data.series;
  if (points.length < 2)
    return (
      <p className="sr-empty" role="status">
        Für einen Verlauf fehlen mindestens zwei Monate.
      </p>
    );
  const values = points.map((p) => p.fixedMonthlyCents);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.18);
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => B - ((v - min) / (max - min || 1)) * (B - T);
  const step = Math.ceil(points.length / 8);
  const ticks = points.flatMap((p, i) =>
    i % step === 0 ? [{ x: x(i), label: monthShort(p.month) }] : [],
  );
  const grid = [0, 1, 2, 3].map((n) => {
    const v = min + ((max - min) * n) / 3;
    return { y: y(v), label: eur(Math.round(v / 100) * 100, { cents: false }) };
  });
  const last = points[points.length - 1]!;
  return (
    <ScrollRegion label="Diagramm, bei Bedarf horizontal verschiebbar" className="sr-chart">
      <ChartSvg
        width={W}
        height={H}
        label={`Verträge je Monat seit ${monthShort(points[0]!.month)}: von ${eur(values[0]!, { cents: false })} auf ${eur(last.fixedMonthlyCents, { cents: false })}. ${data.markers.length} Monate mit Preisänderung oder neuem Vertrag.`}
        testId="contracts-chart"
      >
        <Graticule x1={L} x2={W - R} lines={grid} />
        <AxisLine x1={L} x2={W - R} y={B} />
        <Line
          kind="actual"
          points={points.map((p, i) => [x(i), y(p.fixedMonthlyCents)] as const)}
        />
        {data.markers.map((m) => {
          const i = points.findIndex((p) => p.month === m.month);
          if (i < 0) return null;
          const yy = y(points[i]!.fixedMonthlyCents) - 6;
          return (
            <path
              key={m.month}
              d={`M${x(i) - 5},${yy - 8}h10l-5,8Z`}
              className="kote"
              data-testid="contracts-marker"
            >
              <title>
                {monthShort(m.month)}:{' '}
                {m.entries
                  .map(
                    (e) =>
                      `${e.name} ${e.previousCents === null ? 'neu ' : nativeCurrency(e.previousCents, e.currency) + ' → '}${nativeCurrency(e.amountCents, e.currency)}`,
                  )
                  .join('; ')}
              </title>
            </path>
          );
        })}
        <XTicks y={H - 14} ticks={ticks} />
        <text
          x={x(points.length - 1) + 8}
          y={y(last.fixedMonthlyCents) + 4}
          className="svg-label-strong"
        >
          {eur(last.fixedMonthlyCents)}
        </text>
      </ChartSvg>
    </ScrollRegion>
  );
}
