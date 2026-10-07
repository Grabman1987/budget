import {
  useAmountPrivacy,
  ChartValue,
  maskMoneyText,
  Button,
  ClassTag,
  DimensionChain,
  DimensionChainDrawing,
  DetailPanel,
  RevisionTable,
  SectionHead,
  type DimensionChainTerm,
  type RevisionRow,
} from '@budget/ui';
import { addDays, cents, closeEntryMonth } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Info,
  ArrowUp,
  ChevronRight,
  CircleCheck,
  Clock3,
} from 'lucide-react';
import { fetchAccounts } from '../ledger/api';
import { LEDGER_KEY } from '../ledger/queries';
import { PaceAccuracyNote } from '../reports/planning-accuracy-report';
import { eur, longDay, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { ValuationHint } from '../ledger/valuation-hint';
import { HEUTE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { monthLabel as monthName } from '../nav/month';
import { currentMonth, useMonth } from '../shell/use-month';
import { AppLink } from '../shell/app-link';
import { BalanceChart, HeutePaceChart } from './charts';
import { heuteQuery, type Heute } from './api';
import { useBalancePeriod } from './use-balance-period';
import './heute.css';
import { useIsPhone } from '../budget/month-span';
import { useStoredFlag } from '../shell/use-stored-flag';
import { AttentionBar, FundingNotes } from './attention-bar';
import { savingsProposalsQuery } from '../wealth/savings-api';
import { sourceMoney } from '../wealth/trade-api';
import { AnswerCards } from './answer-cards';
import { DailyBudgetLine } from './charts';

const pct = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  pending: 'vorgemerkt',
  confirmed: 'bestätigt',
  reconciled: 'abgeglichen',
};

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
        {query.isPending && <LoadingNote what="Heute" />}
        {query.isError && (
          <ErrorNote what="Heute" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data && <HeuteBody data={data} />}
      </div>
    </PageFrame>
  );
}

function HeuteBody({ data }: { data: Heute }) {
  useAmountPrivacy();
  const [chainOpen, setChainOpen] = useState(false);
  const [netDetail, setNetDetail] = useState<'liquid' | 'invested' | 'receivable' | 'debt' | null>(
    null,
  );
  const [leadDetail, setLeadDetail] = useState<'need' | 'want' | 'open' | null>(null);
  const [paceDetail, setPaceDetail] = useState<'spent' | 'plan' | 'forecast' | null>(null);
  const navigate = useNavigate();
  const [, , setMonth] = useMonth();
  const savings = useQuery(savingsProposalsQuery());
  // Another month than today's: the lead, next steps, upcoming, checks, net worth and bookings
  // stay anchored to today, and the page says so.
  const away = data.stand.month !== data.stand.today.slice(0, 7);
  const net = 'unavailable' in data.netWorth ? null : data.netWorth;
  const check = 'unavailable' in data.financeCheck ? null : data.financeCheck;
  const phone = useIsPhone();
  const revisions: RevisionRow[] = [];
  const closeMonth = closeEntryMonth(data.stand.today);
  if (closeMonth)
    revisions.push({
      id: 'month-close',
      letter: 'A',
      urgent: false,
      title: `Monatsabschluss · ${monthName(closeMonth)}`,
      detail: 'Posteingang, Konten und Überziehungen prüfen; danach den nächsten Monat planen.',
      action: {
        label: 'Fortsetzen',
        onClick: () =>
          void navigate({
            to: '/monatsabschluss/$month',
            params: { month: closeMonth },
            search: {},
          }),
      },
    });
  for (const proposal of savings.data?.proposals ?? [])
    revisions.push({
      id: proposal.id,
      letter: String.fromCharCode(65 + (revisions.length % 26)),
      urgent: false,
      title: `Sparplan: ${proposal.securityName}`,
      detail: `${longDay(proposal.date)} · ${sourceMoney(proposal.amountCents, proposal.currency)} · ${proposal.accountName}`,
      action: {
        label: 'Ausführung prüfen',
        onClick: () => void navigate({ to: '/konten/posteingang' }),
      },
    });
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
          <Info size={16} aria-hidden="true" />
          <span>
            Du siehst {monthName(data.stand.month)}. Pace, Verlauf und angepinnte Envelopes folgen
            diesem Monat; Frei verfügbar bis Gehalt, Nächste Schritte, Anstehend, Finanz-Check,
            Nettovermögen und Buchungen zeigen den Stand von heute ({longDay(data.stand.today)}).
            Die Antwortkarten und das nächste Sparziel zeigen ebenfalls den laufenden Monat.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>
            Zum aktuellen Monat
          </Button>
        </p>
      )}
      <AnswerCards
        data={data}
        chainOpen={chainOpen}
        onBudgetClick={() => setChainOpen((open) => !open)}
      />
      <AttentionBar data={data} />
      <section className="heute-section heute-pace" aria-labelledby="heute-pace-title">
        <SectionHead
          id="heute-pace-title"
          title={`${monthLabel(data.pace.month)} · Pace`}
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

      <section className="heute-lead" aria-labelledby="heute-lead-title">
        <div className="heute-lead-head">
          <div>
            <h2 id="heute-lead-title">Kontoprognose</h2>
            <p>
              Verfügbar in allen Envelopes für Bedarf und Wunsch, abzüglich der Rechnungen, die vor
              dem Gehalt noch fällig sind.
            </p>
            {away && (
              <span className="heute-anchor" data-testid="heute-anchor">
                Bis Gehalt zählt immer ab heute ({shortDay(data.stand.today)}, Gehalt am{' '}
                {shortDay(data.stand.payday.day)}), nicht ab {monthName(data.stand.month)}.
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
        <BalanceChart
          data={data}
          chainOpen={chainOpen}
          onToggleChain={() => setChainOpen((open) => !open)}
          showLead={false}
        />
        <DailyBudgetLine data={data} />
        {data.balance.forecast.length > 0 && (
          <p className="heute-note">
            Kontoprognose bis {longDay(data.stand.to)} · 14 Tage Rückblick · gleicher Horizont wie
            R07.
          </p>
        )}
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

      <Upcoming
        items={data.upcoming14.filter((p) => p.dueDate < addDays(data.stand.today, 7))}
        id="heute-upcoming-title"
        title="Was steht an? · Nächste 7 Tage"
      />
      <section className="heute-wealth-line" aria-labelledby="heute-wealth-title">
        <h2 id="heute-wealth-title">Nettovermögen · 12 Monate</h2>
        {net ? (
          <>
            <WealthSparkline series={net.series} />
            <AppLink to="/vermoegen/nettovermoegen" search={{ zeitraum: '1J' }}>
              {eur(net.yearDeltaCents, { sign: true })} seit {shortDay(net.yearAgoDay)} vor 12
              Monaten
            </AppLink>
            <ValuationHint incomplete={data.incomplete} />
          </>
        ) : (
          'unavailable' in data.netWorth && (
            <ValuationNote message={data.netWorth.unavailable.message} />
          )
        )}
      </section>
      <MoreMonth key={phone ? 'phone' : 'desktop'} phone={phone}>
        <div className="heute-main-grid">
          <section className="heute-section heute-next-steps" aria-labelledby="heute-next-title">
            <SectionHead
              id="heute-next-title"
              title="Nächste Schritte"
              aside={`${revisions.length} offen`}
            />
            {savings.isError && (
              <ErrorNote
                what="Sparplanvorschläge"
                error={savings.error}
                onRetry={() => void savings.refetch()}
              />
            )}
            {revisions.length === 0 ? (
              <EmptyNote>Keine offenen Schritte aus den Heute-Prüfungen.</EmptyNote>
            ) : (
              <RevisionTable
                rows={revisions}
                caption="Nächste Schritte"
                empty={<EmptyNote>Keine offenen Schritte.</EmptyNote>}
              />
            )}
          </section>
        </div>

        <div className="heute-detail-grid">
          <section className="heute-section" aria-labelledby="heute-pinned-title">
            <SectionHead
              id="heute-pinned-title"
              detail={1}
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

          <section className="heute-section" aria-labelledby="heute-check-title">
            <SectionHead
              id="heute-check-title"
              detail={3}
              title="Finanz-Check"
              aside={
                <AppLink to="/einstellungen/regelwerk">
                  Alle Regeln <ChevronRight size={15} aria-hidden="true" />
                </AppLink>
              }
            />
            {check ? (
              <>
                <CheckCounts check={check} date={data.stand.today} />
                {check.keyRules.length === 0 ? (
                  <EmptyNote>Für den Finanz-Check sind noch keine Regeln auswertbar.</EmptyNote>
                ) : (
                  <ul className="heute-list">
                    {check.keyRules
                      .filter((rule) => !rule.actionNeeded)
                      .map((rule) => (
                        <li className="heute-rule" key={rule.code}>
                          <div>
                            <strong>{rule.name}</strong>
                            <span>{maskMoneyText(rule.valueText)}</span>
                          </div>
                          <span className={`heute-state is-${rule.status}`}>
                            <StatusIcon status={rule.status} />
                            {rule.status === 'ok'
                              ? 'erfüllt'
                              : rule.status === 'warn'
                                ? 'Warnung'
                                : 'verletzt'}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            ) : (
              'unavailable' in data.financeCheck && (
                <ValuationNote message={data.financeCheck.unavailable.message} />
              )
            )}
          </section>

          <section className="heute-section heute-net-worth" aria-labelledby="heute-net-title">
            <SectionHead
              id="heute-net-title"
              detail={4}
              title="Vermögensaufteilung"
              aside={
                <AppLink to="/vermoegen/nettovermoegen">
                  Details <ChevronRight size={15} aria-hidden="true" />
                </AppLink>
              }
            />
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
                    onSelect={(key) => setNetDetail(key as NonNullable<typeof netDetail>)}
                  />
                </div>
                <p className="heute-note">
                  Wähle ein Maß für die Konten.
                  {net.debtCents < 0 ? ' Gestrichelt: Schulden, werden abgezogen.' : ''}
                </p>
                <p className="heute-note">
                  Stichtag {longDay(net.asOf)} · Vormonatsende {eur(net.previousMonthEndCents)}
                </p>
                <ValuationHint incomplete={data.incomplete} />
              </>
            ) : (
              'unavailable' in data.netWorth && (
                <ValuationNote message={data.netWorth.unavailable.message} />
              )
            )}
          </section>

          <section className="heute-section" aria-labelledby="heute-bookings-title">
            <SectionHead
              id="heute-bookings-title"
              detail={5}
              title="Letzte Buchungen"
              aside={
                <AppLink to="/konten/buchungen">
                  Alle <ChevronRight size={15} aria-hidden="true" />
                </AppLink>
              }
            />
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
        </div>
        <Upcoming
          items={data.upcoming14.filter((p) => p.dueDate >= addDays(data.stand.today, 7))}
          id="heute-later-title"
          title="Danach · bis in 14 Tagen"
        />
        <FundingNotes data={data} />
      </MoreMonth>
      {net && <NetWorthDetail net={net} kind={netDetail} onClose={() => setNetDetail(null)} />}
    </>
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
        Angepinnte Envelopes, Finanz-Check, Vermögensaufteilung, 50/30/20, Ziele, weitere Zahlungen
        und letzte Buchungen.
      </p>
      <div id="heute-more-content" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

function Upcoming({ items, id, title }: { items: Heute['upcoming14']; id: string; title: string }) {
  useAmountPrivacy();
  return (
    <section className="heute-section" aria-labelledby={id}>
      <SectionHead
        id={id}
        title={title}
        aside={
          <AppLink to="/plan/erwartet">
            Alle <ChevronRight size={15} aria-hidden="true" />
          </AppLink>
        }
      />
      {items.length === 0 ? (
        <EmptyNote>Keine wiederkehrenden Zahlungen in diesem Zeitraum.</EmptyNote>
      ) : (
        <ul className="heute-list">
          {items.map((item) => (
            <li className="heute-upcoming" key={`${item.paymentId}-${item.dueDate}`}>
              <time dateTime={item.dueDate}>{shortDay(item.dueDate)}</time>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {[item.accountName, item.contactName, item.categoryName]
                    .filter(Boolean)
                    .join(' · ') || 'Ohne weitere Angabe'}
                </span>
              </div>
              <div className="heute-amount-status">
                <AppLink to="/plan/erwartet" search={{ zahlung: item.paymentId }}>
                  {eur(item.amountCents, { sign: true })}
                </AppLink>
                <span
                  className={
                    item.covered === false ? 'heute-note' : item.covered ? 'heute-good' : ''
                  }
                >
                  {item.covered === true ? (
                    <>
                      <CircleCheck size={14} aria-hidden="true" /> Rücklage voll
                    </>
                  ) : item.covered === false ? (
                    <>
                      <Clock3 size={14} aria-hidden="true" /> nicht gedeckt
                    </>
                  ) : (
                    statusText(item.status)
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WealthSparkline({ series }: { series: { day: string; cents: number }[] }) {
  const min = Math.min(...series.map((p) => p.cents));
  const span = Math.max(1, Math.max(...series.map((p) => p.cents)) - min);
  const points = series
    .map(
      (p, i) =>
        `${4 + (i * 152) / Math.max(1, series.length - 1)},${32 - ((p.cents - min) * 28) / span}`,
    )
    .join(' ');
  return (
    <AppLink to="/vermoegen/nettovermoegen" search={{ zeitraum: '1J' }}>
      <svg
        viewBox="0 0 160 36"
        width="160"
        height="36"
        role="img"
        aria-label="Nettovermögen · Verlauf der letzten 12 Monate"
      >
        <polyline points={points} fill="none" stroke="var(--line)" strokeWidth="2" />
      </svg>
    </AppLink>
  );
}

function NetWorthDetail({
  net,
  kind,
  onClose,
}: {
  net: Exclude<Heute['netWorth'], { unavailable: unknown }>;
  kind: 'liquid' | 'invested' | 'receivable' | 'debt' | null;
  onClose: () => void;
}) {
  useAmountPrivacy();
  const names = {
    liquid: 'Liquidität',
    invested: 'Investiert',
    receivable: 'Forderungen',
    debt: net.debtCents > 0 ? 'Guthaben auf Schuldkonten' : 'Schulden',
  };
  const totals = {
    liquid: net.liquidCents,
    invested: net.investedCents,
    receivable: net.receivableCents,
    debt: net.debtCents,
  };
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'accounts', net.asOf],
    queryFn: () => fetchAccounts(net.asOf),
    enabled: kind !== null,
  });
  const accounts =
    query.data?.accounts.filter((account) => {
      const value = account.valueEurCents;
      if (value === null) return false;
      if (kind === 'debt') return value < 0 || account.role === 'debt';
      if (value < 0 || account.role === 'debt') return false;
      if (kind === 'invested') return account.role === 'investment';
      if (kind === 'receivable') return account.role === 'receivable';
      return account.role === 'budget' || account.role === 'reserve';
    }) ?? [];
  return (
    <DetailPanel open={kind !== null} title={kind ? names[kind] : ''} onClose={onClose}>
      <div className="heute-breakdown">
        <p>Stand {longDay(net.asOf)}</p>
        {query.isPending && <LoadingNote what="Konten" />}
        {query.isError && (
          <ErrorNote what="Konten" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.data &&
          (accounts.length ? (
            <ul>
              {accounts.map((account) => (
                <li key={account.id}>
                  <AppLink to={`/konten/${encodeURIComponent(account.id)}`}>{account.name}</AppLink>
                  <strong>{eur(account.valueEurCents!)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>Keine Konten in diesem Maß.</EmptyNote>
          ))}
        <p className="heute-figure-detail">
          <strong>{kind ? names[kind] : ''}</strong>
          <strong>{kind ? eur(totals[kind]) : ''}</strong>
        </p>
      </div>
    </DetailPanel>
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

function CheckCounts({
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
      </p>
    </div>
  );
}

function StatusIcon({ status }: { status: 'ok' | 'warn' | 'bad' }) {
  useAmountPrivacy();
  if (status === 'ok') return <CircleCheck size={15} aria-hidden="true" />;
  if (status === 'warn') return <Clock3 size={15} aria-hidden="true" />;
  return <AlertTriangle size={15} aria-hidden="true" />;
}

function statusText(status: Heute['upcoming14'][number]['status']) {
  return status === 'expected'
    ? 'erwartet'
    : status === 'received'
      ? 'erhalten'
      : status === 'deviating'
        ? 'abweichend'
        : 'versäumt';
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' }).format(
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15),
  );
}
