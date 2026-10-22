import {
  useAmountPrivacy,
  ChartValue,
  Button,
  ClassTag,
  DimensionChain,
  DimensionChainDrawing,
  SectionHead,
  type DimensionChainTerm,
  type RevisionRow,
} from '@budget/ui';
import { addDays, cents } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { PaceAccuracyNote } from '../reports/planning-accuracy-report';
import { eur, longDay, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { ValuationSourceHint } from '../ledger/valuation-hint';
import { HEUTE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { monthLabel as monthName } from '../nav/month';
import { currentMonth, useMonth } from '../shell/use-month';
import { AppLink } from '../shell/app-link';
import { HeutePaceChart, HeuteWealthChart } from './charts';
import { LiquidityChart } from '../reports/liquidity-chart';
import { liquidityQuery } from '../reports/liquidity-api';
import { salaryDay } from '../reports/liquidity-selection';
import { expectedQuery } from '../expected/api';
import { heuteQuery, type Heute } from './api';
import { useBalancePeriod } from './use-balance-period';
import './heute.css';
import { useIsPhone } from '../budget/month-span';
import { useStoredFlag } from '../shell/use-stored-flag';
import { AttentionBar, FundingNotes } from './attention-bar';
import { savingsProposalsQuery } from '../wealth/savings-api';
import { sourceMoney } from '../wealth/trade-api';
import { Kennzahlen } from './kennzahlen';
import { budgetQuery } from '../budget/budget-api';
import { DailyBudgetLine } from './charts';
import { VerdictLine } from '../reports/verdict-line';
import { heuteVerdictFacts } from '../reports/verdict-facts';
import { Upcoming } from './upcoming-payments';
import type { DimensionKind } from './dimension-page';

const pct = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  pending: 'vorgemerkt',
  confirmed: 'bestätigt',
  reconciled: 'abgeglichen',
};

function subscribeOnline(changed: () => void) {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
}

function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function CachedStand({ updatedAt }: { updatedAt: number }) {
  const online = useOnline();
  return !online && updatedAt > 0 ? <p className="heute-note" role="status">Offline · Stand vom{' '}
    <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}</time>
  </p> : null;
}

function PendingSection({ title, chart = false }: { title: string; chart?: boolean }) {
  return <section className={`heute-pending-section${chart ? ' is-chart' : ''}`} aria-label={title} aria-busy="true">
    <h2>{title}</h2><LoadingNote what={title} />
  </section>;
}

export function HeutePage() {
  useAmountPrivacy();
  const [month] = useMonth();
  const { period, setPeriod } = useBalancePeriod();
  const query = useQuery(heuteQuery(month, period));
  const data = query.data;
  return (
    <PageFrame
      meta={HEUTE}
      heutePeriod={data?.stand.period ?? period}
      onHeutePeriodChange={setPeriod}
      standDay={data?.stand.today}
    >
      <div className="heute">
        {!data && <>
          {query.isPending && <>
            <PendingSection title="Kennzahlen" />
            <div className="heute-overview-charts"><PendingSection title="Monat im Blick" chart /><PendingSection title="Nettovermögen · 12 Monate" chart /></div>
          </>}
          <CompactForecastCard />
          {query.isPending && <><PendingSection title="Zu tun" /><PendingSection title="Fällig 14 Tage" /><PendingSection title="Letzte Buchungen" /></>}
        </>}
        {query.isError && (
          <ErrorNote what="Heute" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data && <><CachedStand updatedAt={query.dataUpdatedAt} /><HeuteBody data={data} onReload={() => void query.refetch()} /></>}
      </div>
    </PageFrame>
  );
}

function HeuteBody({ data, onReload }: { data: Heute; onReload: () => void }) {
  useAmountPrivacy();
  const heuteFacts = useMemo(() => heuteVerdictFacts(data), [data]);
  const [chainOpen, setChainOpen] = useState(false);
  const [leadDetail, setLeadDetail] = useState<'need' | 'want' | 'open' | null>(null);
  const [paceDetail, setPaceDetail] = useState<'spent' | 'plan' | 'forecast' | null>(null);
  const navigate = useNavigate();
  const openNetDetail = (kind: DimensionKind) =>
    void navigate({
      to: '/heute/details/$kind',
      params: { kind },
      search: { monat: data.stand.month, period: data.stand.period },
    });
  const [, , setMonth] = useMonth();
  const away = data.stand.month !== data.stand.today.slice(0, 7);
  const net = 'unavailable' in data.netWorth ? null : data.netWorth;
  const phone = useIsPhone();
  const [showPinned, setShowPinned] = useStoredFlag('budget-heute-show-pinned');
  const savings = useQuery(savingsProposalsQuery());
  const budget = useQuery(budgetQuery(data.stand.month));
  const savingsRows: RevisionRow[] = (savings.data?.proposals ?? []).map((proposal, index) => ({
    id: proposal.id,
    letter: String.fromCharCode(65 + (index % 26)),
    urgent: false,
    title: `Sparplan: ${proposal.securityName}`,
    detail: `${longDay(proposal.date)} · ${sourceMoney(proposal.amountCents, proposal.currency)} · ${proposal.accountName}`,
    action: {
      label: 'Ausführung prüfen',
      onClick: () => void navigate({ to: '/konten/pruefen', search: { teil: 'aufgaben' } }),
    },
  }));
  const leadTerms: DimensionChainTerm[] = data.lead.chain.map((term, index) => ({
    ...term,
    value: cents(term.value),
    ...(index === 0 ? { onSelect: () => setLeadDetail('need') } : {}),
    ...(term.label.toLowerCase().includes('wunsch')
      ? { onSelect: () => setLeadDetail('want') }
      : {}),
    ...(term.label.toLowerCase().includes('offen')
      ? { onSelect: () => setLeadDetail('open') }
      : {}),
  }));
  const deltaText =
    !net || net.deltaBp === null
      ? 'keine Vergleichsbasis'
      : `${net.deltaBp >= 0 ? '+' : ''}${pct.format(net.deltaBp / 100)} % zum Vormonatsende`;

  return (
    <>
      {away && (
        <p className="heute-month-note" role="note" data-testid="heute-month-note">
          <span>Ansicht: {monthName(data.stand.month)} –</span>
          <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>
            Zum aktuellen Monat
          </Button>
        </p>
      )}
      <Kennzahlen
        data={data}
        budget={budget}
        chainOpen={chainOpen}
        onLeadClick={() => setChainOpen((open) => !open)}
      />
      {chainOpen && (
      <section className="heute-lead" aria-labelledby="heute-lead-title">
        <div className="heute-lead-head">
          <div>
            <h2 id="heute-lead-title">Spielraum bis Gehalt</h2>
            <p>
              Verfügbar in allen Envelopes für Bedarf und Wunsch, abzüglich der Rechnungen, die vor
              dem Gehalt noch fällig sind.
            </p>
            {away && (
              <span className="heute-anchor" data-testid="heute-anchor">
                Frei bis Gehalt: Stand heute · {longDay(data.stand.today)}. Ansicht:{' '}
                {monthName(data.stand.month)}.
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={chainOpen}
            aria-controls="heute-lead-chain"
            onClick={() => setChainOpen((open) => !open)}
          >
            {chainOpen ? 'Herleitung ausblenden' : 'Herleitung zeigen'}
          </Button>
        </div>
        <DailyBudgetLine data={data} />
        {chainOpen && (
          <div id="heute-lead-chain" className="heute-chain-area">
            <DimensionChain
              terms={leadTerms}
              label="Maßkette: Bedarf plus Wunsch minus offene Rechnungen bis Gehalt"
              precision="cent"
            />
            {leadDetail && <LeadDetail data={data} kind={leadDetail} />}
            <p className="heute-note">
              Wähle Bedarf, Wunsch oder offen bis Gehalt für die zugehörigen Envelopes und
              Zahlungen.
            </p>
          </div>
        )}
      </section>
      )}
      <div className="heute-overview-charts">
      <section className="heute-section heute-pace" aria-labelledby="heute-pace-title">
        <SectionHead
          id="heute-pace-title"
          title={`Monat im Blick · ${monthLabel(data.pace.month)}`}
          aside={
            data.pace.figures.over ? (
              <span className="heute-alert">
                <ArrowUp size={16} aria-hidden="true" />
                {eur(data.pace.figures.deltaCents, { cents: false })} über Plan
              </span>
            ) : (
              <span className="heute-good">
                <ArrowDown size={16} aria-hidden="true" />
                {eur(-data.pace.figures.deltaCents, { cents: false })} unter Plan
              </span>
            )
          }
        />
        <div className="heute-figures">
          <PaceFigure
            label="Ausgegeben"
            value={data.pace.figures.spentCents}
            kind="spent"
            selected={paceDetail}
            setSelected={setPaceDetail}
          />
          <PaceFigure
            label="Plan bis heute"
            value={data.pace.figures.planToDateCents}
            kind="plan"
            selected={paceDetail}
            setSelected={setPaceDetail}
          />
          <PaceFigure
            label={
              data.pace.todayDay < 7 ? 'Prognose Monatsende · vorläufig' : 'Prognose Monatsende'
            }
            value={data.pace.figures.forecastAvailable ? data.pace.figures.forecastEndCents : null}
            kind="forecast"
            selected={paceDetail}
            setSelected={setPaceDetail}
            extra={`von ${eur(data.pace.figures.limitCents, { cents: false })} Limit`}
          />
        </div>
        <HeutePaceChart data={data} />
        <PaceAccuracyNote summary={data.planningAccuracy} />
        {paceDetail && (
          <div className="heute-figure-detail" role="status">
            <strong>
              {paceDetail === 'spent'
                ? 'Ausgegeben'
                : paceDetail === 'plan'
                  ? 'Plan bis heute'
                  : 'Prognose Monatsende'}
            </strong>
            <span>
              {paceDetail === 'spent'
                ? eur(data.pace.figures.spentCents)
                : paceDetail === 'plan'
                  ? eur(data.pace.figures.planToDateCents)
                  : data.pace.figures.forecastAvailable
                    ? eur(data.pace.figures.forecastEndCents)
                    : 'Noch keine verlässliche Prognose'}
            </span>
            {paceDetail === 'forecast' && <span>Limit: {eur(data.pace.figures.limitCents)}</span>}
          </div>
        )}
        <p className="heute-note">
          {data.pace.todayDay < 7
            ? 'Vorläufig: ausgegeben plus offene fixe und wiederkehrende Zahlungen plus verbleibender variabler Plan. Ab dem 7. Tag werden variable Ausgaben hochgerechnet.'
            : 'Fixe und wiederkehrende Zahlungen zählen einmal; nur variable Ausgaben werden hochgerechnet.'}
          {!data.pace.figures.forecastAvailable &&
            ' Für eine Prognose braucht es einen positiven Plan.'}
        </p>
      </section>

        {!phone && <HeuteWealthLine data={data} onRetry={onReload} />}
      </div>
      <CompactForecastCard />
      {phone && <HeuteWealthLine data={data} onRetry={onReload} />}
      <AttentionBar
        data={data}
        savingsRows={savingsRows}
        savingsError={
          savings.isError && (
            <ErrorNote
              what="Sparplanvorschläge"
              error={savings.error}
              onRetry={() => void savings.refetch()}
            />
          )
        }
      />

      <Upcoming
        items={data.upcoming14}
        id="heute-upcoming-title"
        events={data.upcomingEvents.filter((event) => event.date <= addDays(data.stand.today, 14))}
        title="Fällig 14 Tage"
        standToday={away ? longDay(data.stand.today) : undefined}
      />
      <section className="heute-section" aria-labelledby="heute-bookings-title">
        <SectionHead
          id="heute-bookings-title"
          title="Letzte Buchungen"
          aside={
            <AppLink to="/konten/buchungen">
              Alle <ChevronRight size={15} aria-hidden="true" />
            </AppLink>
          }
        />
        {away && <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>}
        {data.lastBookings.length === 0 ? (
          <EmptyNote>Noch keine Buchungen vorhanden.</EmptyNote>
        ) : (
          <ul className="heute-list">
            {data.lastBookings.map((item) => (
              <li key={item.id} className="heute-booking">
                <span
                  className={`heute-booking-class ${item.categoryClass ? `is-${item.categoryClass}` : ''}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>{item.payeeName ?? 'Ohne Empfänger'}</strong>
                  <span>
                    {longDay(item.date)} ·{' '}
                    {[item.categoryName, item.memo].filter(Boolean).join(' · ') ||
                      'Ohne Kategorie'}
                  </span>
                </div>
                <div>
                  <AppLink to="/konten/buchungen" search={{ von: item.date, bis: item.date }}>
                    {eur(item.amountCents, { sign: true })}
                  </AppLink>
                  <span>
                    {STATUS[item.status] ?? item.status} · {item.accountName}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="heute-view-options">
        <summary>Ansicht anpassen</summary>
        <label>
          <input
            type="checkbox"
            checked={showPinned}
            onChange={(event) => setShowPinned(event.currentTarget.checked)}
          />
          Angepinnte Envelopes unter Mehr zum Monat anzeigen
        </label>
      </details>
      <MoreMonth key={phone ? 'phone' : 'desktop'} phone={phone}>
        <VerdictLine facts={heuteFacts} />
        <div className="heute-detail-grid">
          {showPinned && (
            <section className="heute-section" aria-labelledby="heute-pinned-title">
              <SectionHead
                id="heute-pinned-title"
                title="Angepinnte Envelopes"
                aside={
                  <AppLink to="/plan/monat" search={{ monat: data.stand.month }}>
                    Plan öffnen <ChevronRight size={15} aria-hidden="true" />
                  </AppLink>
                }
              />
              {data.pinned.length === 0 ? (
                <EmptyNote>Keine Envelopes angepinnt.</EmptyNote>
              ) : (
                <ul className="heute-list">
                  {data.pinned.map((item) => (
                    <li key={item.id} className="heute-envelope">
                      <div className="he-envelope-main">
                        <div>
                          <strong>{item.name}</strong>
                          {item.class && (
                            <ClassTag kind={item.class}>
                              {item.class === 'need'
                                ? 'Bedarf'
                                : item.class === 'want'
                                  ? 'Wunsch'
                                  : 'Zukunft'}
                            </ClassTag>
                          )}
                        </div>
                        <AppLink
                          to="/plan/monat"
                          search={{ monat: data.stand.month, kategorie: item.id }}
                        >
                          <strong className={item.availableCents < 0 ? 'heute-alert' : ''}>
                            {eur(item.availableCents)}
                          </strong>
                        </AppLink>
                      </div>
                      <ChartValue
                        label={item.name}
                        date={data.stand.today}
                        series={[
                          {
                            name: 'Ausgegeben',
                            value: eur(item.spentCents),
                            color: `var(--${item.class ?? 'line'})`,
                          },
                          {
                            name: 'Budgetiert',
                            value: eur(item.budgetedCents),
                            color: 'var(--line-2)',
                          },
                          { name: 'Pace', value: eur(item.paceMarkCents), color: 'var(--ink-3)' },
                        ]}
                      >
                        <div className="he-envelope-bar" aria-hidden="true">
                          <span
                            className={item.class ? `hatch-${item.class}` : ''}
                            style={{
                              width: `${Math.min(100, item.budgetedCents > 0 ? Math.max(0, (item.spentCents / item.budgetedCents) * 100) : 0)}%`,
                            }}
                          />
                        </div>
                      </ChartValue>
                      <p>
                        {eur(item.spentCents)} ausgegeben · {eur(item.budgetedCents)} budgetiert ·
                        Pace {eur(item.paceMarkCents)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="heute-section heute-net-worth" aria-labelledby="heute-net-title">
            <SectionHead
              id="heute-net-title"
              title="Vermögensaufteilung"
              aside={
                <AppLink to="/vermoegen/nettovermoegen">
                  Details <ChevronRight size={15} aria-hidden="true" />
                </AppLink>
              }
            />
            {away && <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>}
            {net ? (
              <>
                <div className={`heute-delta ${net.deltaCents < 0 ? 'text-bad' : 'text-good'}`}>
                  {net.deltaCents < 0 ? (
                    <ArrowDown size={16} aria-hidden="true" />
                  ) : (
                    <ArrowUp size={16} aria-hidden="true" />
                  )}
                  {eur(net.deltaCents, { cents: false, sign: true })} · {deltaText}
                </div>
                <div
                  data-testid="heute-networth-chart"
                  className={`heute-net-composition${net.totalCents <= 0 ? ' is-nonpositive' : ''}`}
                >
                  <DimensionChainDrawing
                    label="Maßkette Nettovermögen"
                    parts={[
                      {
                        key: 'liquid',
                        label: 'Liquidität',
                        cents: cents(net.liquidCents),
                        fill: 'plain',
                      },
                      {
                        key: 'invested',
                        label: 'Investiert',
                        cents: cents(net.investedCents),
                        fill: 'need',
                      },
                      ...(net.debtCents > 0
                        ? [
                            {
                              key: 'debt',
                              label: 'Guthaben auf Schuldkonten',
                              cents: cents(net.debtCents),
                              fill: 'plain' as const,
                            },
                          ]
                        : []),
                      ...(net.receivableCents > 0
                        ? [
                            {
                              key: 'receivable',
                              label: 'Forderungen',
                              cents: cents(net.receivableCents),
                              fill: 'plain' as const,
                            },
                          ]
                        : []),
                    ]}
                    {...(net.debtCents < 0
                      ? {
                          minus: {
                            key: 'debt',
                            label: 'Schulden',
                            cents: cents(-net.debtCents),
                            kind: 'debt' as const,
                          },
                        }
                      : {})}
                    result={{ label: 'Nettovermögen', cents: cents(net.totalCents) }}
                    onSelect={(key) => openNetDetail(key as DimensionKind)}
                  />
                  <ValuationSourceHint sources={data.valuationSources} label="Nettovermögen" />
                </div>
                <p className="heute-note">
                  Wähle ein Maß für die Konten.
                  {net.debtCents < 0 ? ' Gestrichelt: Schulden, werden abgezogen.' : ''}
                </p>
                <p className="heute-note">
                  Stichtag {longDay(net.asOf)} · Vormonatsende {eur(net.previousMonthEndCents)}
                </p>
              </>
            ) : (
              'unavailable' in data.netWorth && (
                <>
                  <ValuationNote message={data.netWorth.unavailable.message} />
                  <ValuationSourceHint sources={data.valuationSources} label="Nettovermögen" />
                </>
              )
            )}
          </section>
        </div>
        <FundingNotes data={data} />
      </MoreMonth>
    </>
  );
}

/** Stand-today forecast: exactly the same read and unmodified series as the linked detail. */
function CompactForecastCard() {
  useAmountPrivacy();
  const forecast = useQuery(liquidityQuery('35d', []));
  const payments = useQuery(expectedQuery());
  const view = forecast.isSuccess ? forecast.data : undefined;
  const report = !forecast.isFetching && !forecast.isError ? view?.report : undefined;
  const salaryIds = new Set(
    (payments.data ?? [])
      .filter((payment) => payment.incomeTypeId === 'income-salary')
      .map((payment) => payment.id),
  );
  return (
    <section
      className="heute-section heute-compact-forecast"
      aria-labelledby="heute-forecast-title"
    >
      <div className="heute-compact-forecast-head">
        <h2 id="heute-forecast-title">Kontoprognose · 35 Tage</h2>
        <AppLink
          className="btn btn-ghost"
          to="/plan/prognose"
          search={{ horizon: '35d', levers: '' }}
          aria-label="Details zur Kontoprognose für 35 Tage"
        >
          Details
        </AppLink>
      </div>
      <CachedStand updatedAt={forecast.dataUpdatedAt} />
      {forecast.isFetching && <div className="heute-pending-chart"><LoadingNote what="Kontoprognose" /></div>}
      {forecast.isError && (
        <ErrorNote
          what="Kontoprognose"
          error={forecast.error}
          onRetry={() => void forecast.refetch()}
        />
      )}
      {view && !view.available && (
        <EmptyNote>Ohne Budget-Konto gibt es keine Kontoprognose.</EmptyNote>
      )}
      {report && (
        <>
          <p className="heute-note">
            Stand heute · {longDay(view?.asOf ?? report.startDay)} · ohne Stellschrauben
            {
              ' · Budget-Konten; Kreditkarten im Budget eingeschlossen, Reservekonten ausgeschlossen.'
            }
          </p>
          <LiquidityChart report={report} salaryDay={salaryDay(report, salaryIds)} compact />
          <p
            className="heute-forecast-low"
            data-day={report.low?.day}
            data-cents={report.low?.cents}
          >
            {report.low ? (
              <>
                Tiefpunkt: <strong>{eur(report.low.cents)}</strong>
                {' · '}am {longDay(report.low.day)}
              </>
            ) : (
              'Kein Tiefpunkt verfügbar.'
            )}
          </p>
        </>
      )}
    </section>
  );
}

function MoreMonth({ phone, children }: { phone: boolean; children: ReactNode }) {
  const [changed, setChanged] = useStoredFlag(`budget-heute-more-${phone ? 'phone' : 'desktop'}`);
  const open = phone ? changed : !changed;
  return (
    <div className="heute-more">
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls="heute-more-content"
        onClick={() => setChanged(!changed)}
      >
        Mehr zum Monat
      </Button>
      <p className="heute-note">
        Vermögensaufteilung und Ziele; angepinnte Envelopes nach Wahl unter Ansicht anpassen.
      </p>
      <div id="heute-more-content" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Visible independently of the optional month detail; provenance describes its current endpoint. */
export function HeuteWealthLine({
  data,
  onRetry,
}: {
  data: Pick<Heute, 'stand' | 'netWorth' | 'valuationSources'>;
  onRetry?: () => void;
}) {
  useAmountPrivacy();
  const away = data.stand.month !== data.stand.today.slice(0, 7);
  const net = 'unavailable' in data.netWorth ? null : data.netWorth;
  return (
    <section className="heute-wealth-line" aria-labelledby="heute-wealth-title">
      <h2 id="heute-wealth-title">Nettovermögen · 12 Monate</h2>
      {away && <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>}
      {net ? (
        <>
          <HeuteWealthChart series={net.series} />
          <AppLink to="/vermoegen/nettovermoegen" search={{ zeitraum: '1J' }}>
            {eur(net.yearDeltaCents, { sign: true })} seit {shortDay(net.yearAgoDay)} vor 12 Monaten
          </AppLink>
        </>
      ) : (
        'unavailable' in data.netWorth && (
          <><ValuationNote message={data.netWorth.unavailable.message} />{onRetry && <Button variant="ghost" onClick={onRetry}>Erneut versuchen</Button>}</>
        )
      )}
      <ValuationSourceHint
        sources={data.valuationSources}
        label="Verlauf Nettovermögen · aktueller Stand"
      />
    </section>
  );
}

function LeadDetail({ data, kind }: { data: Heute; kind: 'need' | 'want' | 'open' }) {
  useAmountPrivacy();
  if (kind === 'open')
    return (
      <div className="heute-breakdown" aria-live="polite">
        <h3>Offen bis Gehalt</h3>
        {data.lead.items.open.length ? (
          <ul>
            {data.lead.items.open.map((item) => (
              <li key={item.id}>
                <span>
                  {longDay(item.day)} · {item.label}
                </span>
                <strong>{eur(-item.cents)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>Keine offenen Rechnungen vor dem Gehalt.</p>
        )}
      </div>
    );
  const list = data.lead.items[kind];
  return (
    <div className="heute-breakdown" aria-live="polite">
      <h3>Envelopes {kind === 'need' ? 'Bedarf' : 'Wunsch'}</h3>
      {list.length ? (
        <ul>
          {list.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <strong>{eur(item.availableCents)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>Keine Envelopes in dieser Klasse.</p>
      )}
    </div>
  );
}

function PaceFigure({
  label,
  value,
  kind,
  selected,
  setSelected,
  extra,
}: {
  label: string;
  value: number | null;
  kind: 'spent' | 'plan' | 'forecast';
  selected: 'spent' | 'plan' | 'forecast' | null;
  setSelected: (key: 'spent' | 'plan' | 'forecast' | null) => void;
  extra?: string;
}) {
  useAmountPrivacy();
  const open = selected === kind;
  return (
    <button
      type="button"
      className="heute-figure"
      aria-expanded={open}
      onClick={() => setSelected(open ? null : kind)}
    >
      <span>{label}</span>
      <strong>{value === null ? '–' : eur(value, { cents: false })}</strong>
      {extra && <small>{extra}</small>}
    </button>
  );
}

function ValuationNote({ message }: { message: string }) {
  useAmountPrivacy();
  return (
    <div className="rev-empty">
      <AlertTriangle className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <div className="kstate">
        <p>Bewertung nicht verfügbar. {message}</p>
      </div>
    </div>
  );
}

export function CheckCounts({
  check,
  date,
}: {
  check: Exclude<Heute['financeCheck'], { unavailable: unknown }>;
  date: string;
}) {
  useAmountPrivacy();
  const { ok, warn, bad, total } = check.counts;
  return (
    <div
      className="heute-check-counts"
      role="group"
      aria-label={`${ok} erfüllt, ${warn} Warnung, ${bad} verletzt, ${check.counts.notEvaluated} nicht auswertbar`}
    >
      <strong>{ok}</strong>
      <span>von {total} Regeln erfüllt</span>
      <ChartValue
        label="Regelerfüllung"
        date={date}
        series={[
          { name: 'Erfüllt', value: String(ok), color: 'var(--line)' },
          { name: 'Warnung', value: String(warn), color: 'var(--line-2)' },
          { name: 'Verletzt', value: String(bad), color: 'var(--ink-2)' },
          {
            name: 'Nicht auswertbar',
            value: String(check.counts.notEvaluated),
            color: 'var(--ink-3)',
          },
        ]}
      >
        <div className="heute-check-bar" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <i
              key={i}
              className={
                i < ok
                  ? 'is-ok'
                  : i < ok + warn
                    ? 'is-warn'
                    : i < ok + warn + bad
                      ? 'is-bad'
                      : 'is-open'
              }
            />
          ))}
        </div>
      </ChartValue>
      <p>
        <span>{ok} erfüllt</span>
        <span>{warn} Warnung</span>
        <span>{bad} verletzt</span>
        <span>{check.counts.notEvaluated} nicht auswertbar</span>
      </p>
      {check.counts.notEvaluated > 0 && (
        <p>
          Eingangsdaten fehlen; diese Regeln zählen nicht als erfüllt.{' '}
          <AppLink to="/einstellungen/regelwerk" hash="rw-pending">
            Fehlende Angaben ansehen
          </AppLink>
        </p>
      )}
    </div>
  );
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' }).format(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15),
  );
}
