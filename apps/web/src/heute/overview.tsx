import { bookingCounterparty } from '../ledger/booking-counterparty';
import {
  privateAmount,
  useAmountPrivacy,
  Segmented,
  RevisionTriangle,
  BudgetStateMark,
} from '@budget/ui';
import { addDays } from '@budget/domain';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown, Minus, CircleCheck, TriangleAlert } from 'lucide-react';
import { budgetQuery } from '../budget/budget-api';
import { monthLabel } from '../nav/month';
import { eur, longDay, shortDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { ValuationSourceHint } from '../ledger/valuation-hint';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { MonthSwitch } from '../shell/month-switch';
import { useMonth } from '../shell/use-month';
import { PAYDAY_ONLY_THIS_MONTH, useBalancePeriod } from './use-balance-period';
import { heuteQuery, type Heute, type HeutePeriod } from './api';
import { HeutePaceChart, HeuteWealthChart } from './charts';
import { CompactForecastCard } from './compact-forecast-card';
import { attentionModel } from './attention-model';
import './overview.css';

const time = new Intl.DateTimeFormat('de-AT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Vienna',
});
export type HeuteDetail =
  'pace' | 'forecast' | 'tasks' | 'due' | 'bookings' | 'wealth' | 'month' | 'metrics' | 'pinned';
export const HEUTE_DETAILS: HeuteDetail[] = [
  'pace',
  'forecast',
  'tasks',
  'due',
  'bookings',
  'wealth',
  'month',
  'metrics',
  'pinned',
];
export const detailNames: Record<HeuteDetail, string> = {
  pace: 'Monat im Blick · Pace',
  forecast: 'Kontoprognose · 35 Tage',
  tasks: 'Als Nächstes · alle Aufgaben',
  due: 'Fällig · alle Zahlungen',
  bookings: 'Letzte Buchungen',
  wealth: 'Nettovermögen · Herleitung',
  month: 'Mehr zum Monat',
  metrics: 'Kennzahlen',
  pinned: 'Angepinnte Kategorien',
};

function useShellRead() {
  const [month] = useMonth();
  const { period, setPeriod, paydayAvailable } = useBalancePeriod();
  const read = useQuery(heuteQuery(month, period));
  const data =
    !read.isError &&
    read.failureCount === 0 &&
    !read.isPlaceholderData &&
    read.data?.stand.month === month &&
    read.data.stand.period === period
      ? read.data
      : undefined;
  return { data, updatedAt: read.dataUpdatedAt, period, setPeriod, paydayAvailable };
}

/** Same cached query as the page; the shell does not invent a source clock. */
export function HeuteShellHead({ showStand = true }: { showStand?: boolean }) {
  const { data, updatedAt, period, setPeriod, paydayAvailable } = useShellRead();
  return (
    <HeuteHeader
      data={data}
      updatedAt={updatedAt}
      period={period}
      setPeriod={setPeriod}
      paydayAvailable={paydayAvailable}
      showStand={showStand}
    />
  );
}

const STAND_TITLE = 'Berechnung zum angezeigten Stichtag; Uhrzeit des erfolgreichen Abrufs';
function standText(data: Heute | undefined, updatedAt: number) {
  return data
    ? `Stand ${shortDay(data.stand.today)}${updatedAt ? `, ${time.format(updatedAt)}` : ''}`
    : 'Stand nicht verfügbar';
}

/** Data-freshness line at the top of the Heute body while the controls sit in the 64px header. */
export function HeuteStandLine() {
  const { data, updatedAt } = useShellRead();
  return (
    <p className="page-stand-line" title={STAND_TITLE}>
      {standText(data, updatedAt)}
    </p>
  );
}

export function HeuteHeader({
  data,
  updatedAt,
  period,
  setPeriod,
  paydayAvailable,
  phone = false,
  showStand = true,
}: {
  data: Heute | undefined;
  updatedAt: number;
  period: HeutePeriod;
  setPeriod: (value: HeutePeriod) => void;
  paydayAvailable: boolean;
  phone?: boolean;
  /** False when the Stand line renders elsewhere (top of the body) so it appears once. */
  showStand?: boolean;
}) {
  const [month] = useMonth();
  return (
    <div className={`hv-head${phone ? ' hv-head-phone' : ''}`}>
      <div className="hv-head-title">
        <h1 className="sr-only">Heute</h1>
        {showStand && <span title={STAND_TITLE}>{standText(data, updatedAt)}</span>}
      </div>
      <MonthSwitch heading={monthLabel(month)} headingAs="span" />
      <Segmented
        label="Zeitraum"
        slide={REDESIGN_ENABLED}
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'month', label: 'Monat' },
          {
            value: 'payday',
            label: 'Bis Gehalt',
            disabled: !paydayAvailable,
            ...(!paydayAvailable ? { description: PAYDAY_ONLY_THIS_MONTH } : {}),
          },
        ]}
      />
    </div>
  );
}

function Card({
  number,
  title,
  kind,
  children,
  aside,
  titleAside,
  className = '',
}: {
  number?: number;
  title: string;
  kind: HeuteDetail;
  children: ReactNode;
  aside?: ReactNode;
  titleAside?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section
      className={`hv-card hv-${kind} ${className}`}
      aria-labelledby={`hv-${kind}-title`}
      data-card={kind}
    >
      <div className="hv-card-head">
        <div className="hv-card-title">
          <h2 id={`hv-${kind}-title`}>
            {number && (
              <span className="hv-number" aria-hidden="true">
                {number}
              </span>
            )}
            {title}
          </h2>
          {titleAside}
        </div>
        {aside ?? (
          <DetailLink kind={kind}>
            {kind === 'pace' ? 'Pace' : kind === 'forecast' ? 'Prognose' : 'Alle'} →
          </DetailLink>
        )}
      </div>
      {children}
    </section>
  );
}
export function DetailLink({
  kind,
  children,
  hash,
  ...rest
}: {
  kind: string;
  children: ReactNode;
  hash?: string;
  className?: string | undefined;
  'aria-label'?: string;
}) {
  const [month] = useMonth();
  const { period } = useBalancePeriod();
  return (
    <AppLink
      to={`/heute/details/${kind}`}
      search={{ monat: month, period, von: `/?monat=${month}&period=${period}` }}
      hash={hash}
      {...rest}
    >
      {children}
    </AppLink>
  );
}
function ReadState({ read, name }: { read: UseQueryResult<Heute>; name: string }) {
  return read.isError ? (
    <ErrorNote what={name} error={read.error} onRetry={() => void read.refetch()} />
  ) : read.isPending || read.isFetching ? (
    <LoadingNote what={name} />
  ) : (
    <EmptyNote>{name} nicht verfügbar.</EmptyNote>
  );
}

export function HeuteOverview({
  data,
  read,
  period,
  setPeriod,
  paydayAvailable,
}: {
  data: Heute | undefined;
  read: UseQueryResult<Heute>;
  period: HeutePeriod;
  setPeriod: (value: HeutePeriod) => void;
  paydayAvailable: boolean;
}) {
  useAmountPrivacy();
  const [month] = useMonth();
  const budget = useQuery(budgetQuery(month));
  const plan =
    !budget.isError &&
    !budget.isPlaceholderData &&
    !(budget.failureCount > 0) &&
    budget.data?.summary.month === month
      ? budget.data
      : undefined;
  const refreshing = Boolean(data) && read.isFetching;
  const net = data && !('unavailable' in data.netWorth) ? data.netWorth : undefined;
  const parts = data
    ? [data.monthResult.consumptionCents, data.lead.openCents, data.lead.freeCents]
    : [];
  const scale = parts.reduce((sum, value) => sum + Math.max(0, value), 0);
  const due = data
    ? [
        ...data.upcoming14.map((item) => ({
          date: item.dueDate,
          name: item.name,
          cents: item.amountCents,
          covered: item.covered,
        })),
        ...data.upcomingEvents
          .filter((event) => event.date <= addDays(data.stand.today, 14))
          .map((event) => ({
            date: event.date,
            name: event.name,
            cents: event.amountCents,
            covered: null,
          })),
      ].sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const outflows = due.filter((item) => item.cents < 0);
  const uncovered = outflows.filter((item) => item.covered === false).length;
  const unknown = outflows.filter((item) => item.covered === null).length;
  return (
    <div className="heute-screen" data-testid="heute-v2-overview">
      <HeuteHeader
        phone
        data={data}
        updatedAt={read.dataUpdatedAt}
        period={period}
        setPeriod={setPeriod}
        paydayAvailable={paydayAvailable}
      />
      {refreshing && (
        <p className="hv-status" role="status">
          Heute-Daten werden aktualisiert · Stand heute {longDay(data!.stand.today)}
        </p>
      )}
      {data && month !== data.stand.today.slice(0, 7) && (
        <p className="hv-status">
          Ansicht: {monthLabel(month)} · Spielraum und Monatsergebnis: Stand heute{' '}
          {longDay(data.stand.today)}
        </p>
      )}
      <div className="hv-top">
        <section
          className="hv-lead"
          aria-labelledby="hv-lead-title"
          data-id="heute.lead"
          data-as-of={data?.stand.today}
        >
          <div className="hv-lead-label">
            <h2 id="hv-lead-title">Frei bis Gehalt</h2>
            <span>
              {data
                ? `bis ${shortDay(data.stand.payday.day)} · ${data.lead.daysToPayday} Tage`
                : 'Stand wird geladen'}
            </span>
          </div>
          {data ? (
            <>
              <div className="hv-lead-answer">
                <DetailLink
                  kind="free"
                  className={`hv-lead-value${data.lead.freeCents < 0 ? ' is-negative' : ''}`}
                  aria-label={`Frei verfügbar bis Gehalt: ${eur(data.lead.freeCents)}. Herleitung zeigen`}
                >
                  <span data-testid="heute-lead-value">
                    {data.lead.freeCents < 0 && <TriangleAlert size={22} aria-hidden="true" />}
                    {eur(data.lead.freeCents)}
                  </span>
                </DetailLink>
                <DetailLink kind="free" hash="rechenweg" className="hv-chain">
                  <div className="hv-chain-labels">
                    {['Bereits verbraucht', 'Bereits verplant', 'Frei'].map((label, i) => (
                      <span key={label}>
                        {label}
                        <strong>{eur(parts[i]!)}</strong>
                      </span>
                    ))}
                  </div>
                  <div className="hv-chain-bar" aria-hidden="true">
                    {parts.map((value, i) => (
                      <span
                        key={i}
                        className={`hv-segment-${i}`}
                        style={{ flexGrow: Math.max(0, value), flexBasis: scale ? 0 : '33.33%' }}
                      />
                    ))}
                  </div>
                </DetailLink>
              </div>
              <div
                className="hv-monthline"
                aria-label="Einnahmen minus Ausgaben gleich bisher übrig"
              >
                <span>
                  Einnahmen<strong>{eur(data.monthResult.earnedCents, { cents: false })}</strong>
                </span>
                <i aria-hidden="true">−</i>
                <span>
                  Ausgaben
                  <strong>{eur(data.monthResult.consumptionCents, { cents: false })}</strong>
                </span>
                <i aria-hidden="true">=</i>
                <span>
                  Bisher übrig
                  <strong>{eur(data.monthResult.savedCents, { cents: false, sign: true })}</strong>
                </span>
                <DetailLink kind="free" hash="tagesbudget" className="hv-daily">
                  Tagesbudget bis Gehalt
                  <strong>
                    {data.dailyBudget.perDayCents === null
                      ? 'Kein Spielraum'
                      : `≈ ${eur(data.dailyBudget.perDayCents, { cents: false })}/Tag`}
                  </strong>
                </DetailLink>
              </div>
              <div className="hv-lead-foot">
                <span>
                  {data.dailyBudget.perDayCents === null
                    ? 'Kein Spielraum bis Gehalt'
                    : `Tagesbudget bis Gehalt ≈ ${eur(data.dailyBudget.perDayCents, { cents: false })}/Tag`}
                </span>
                <span>{data.attention.pendingCount} Buchungen unbestätigt</span>
                <span className="hv-mobile-stand">
                  Stand {shortDay(data.stand.today)}
                  {read.dataUpdatedAt ? `, ${time.format(read.dataUpdatedAt)}` : ''}
                </span>
              </div>
            </>
          ) : (
            <div className="hv-lead-pending">
              <ReadState read={read} name="Spielraum bis Gehalt" />
            </div>
          )}
        </section>
        <Card
          title="Nettovermögen"
          kind="wealth"
          className="hv-net"
          titleAside={
            net ? (
              <ValuationSourceHint sources={data?.valuationSources} label="Nettovermögen" />
            ) : undefined
          }
          aside={
            net ? (
              <div className="hv-net-value">
                <DetailLink kind="wealth">
                  <strong data-kennzahl="nettovermoegen" data-testid="kennzahl-value">
                    {eur(net.totalCents)}
                  </strong>
                  <span className="hv-net-delta">
                    {net.yearDeltaCents === null || net.yearDeltaCents === 0 ? (
                      <Minus size={14} aria-hidden="true" />
                    ) : net.yearDeltaCents < 0 ? (
                      <ArrowDown size={14} aria-hidden="true" />
                    ) : (
                      <ArrowUp size={14} aria-hidden="true" />
                    )}
                    {net.yearDeltaCents === null
                      ? 'Jahresvergleich nicht verfügbar'
                      : `${eur(net.yearDeltaCents, { cents: false, sign: true })} in 12 Monaten`}
                  </span>
                </DetailLink>
              </div>
            ) : undefined
          }
        >
          {net ? (
            <>
              <HeuteWealthChart net={net} />
            </>
          ) : data && 'unavailable' in data.netWorth ? (
            <EmptyNote>{data.netWorth.unavailable.message}</EmptyNote>
          ) : (
            <ReadState read={read} name="Nettovermögen" />
          )}
        </Card>
      </div>
      <div className="hv-grid">
        <div className="hv-main">
          <Card number={1} title="Monat im Blick" kind="pace">
            {data ? (
              <>
                <p className="hv-pace-summary">
                  Ausgegeben <strong>{eur(data.pace.figures.spentCents, { cents: false })}</strong>{' '}
                  · Prognose Monatsende{' '}
                  <strong>
                    {data.pace.figures.forecastAvailable
                      ? eur(data.pace.figures.forecastEndCents, { cents: false })
                      : 'noch nicht verfügbar'}
                  </strong>{' '}
                  von {eur(data.pace.figures.limitCents, { cents: false })} Deckel
                </p>
                <HeutePaceChart data={data} compact />
              </>
            ) : (
              <ReadState read={read} name="Monat im Blick" />
            )}
          </Card>
          <CompactForecastCard data={data} read={read} refreshing={refreshing} overview />
        </div>
        <div className="hv-aside">
          <Card number={3} title="Als Nächstes" kind="tasks">
            <NextWork data={data} assignment={plan?.summary.toBeAssignedCents} />
            {!data && <ReadState read={read} name="Weitere Aufgaben" />}
            {plan && budget.isFetching && (
              <p role="status" className="hv-source-note">
                Budgetangaben werden aktualisiert · {monthLabel(month)}
              </p>
            )}
            {budget.isPending && !plan && <LoadingNote what="Planangaben" />}
            {budget.isError && (
              <ErrorNote
                what="Planangaben"
                error={budget.error}
                onRetry={() => void budget.refetch()}
              />
            )}
          </Card>
          <Card
            number={4}
            title="Fällig"
            kind="due"
            aside={
              <DetailLink kind="due" className={uncovered ? 'hv-uncovered' : undefined}>
                {data ? (
                  <BudgetStateMark state={uncovered ? 'open' : 'met'}>
                    {uncovered} von {outflows.length} nicht gedeckt
                  </BudgetStateMark>
                ) : (
                  'Alle →'
                )}
              </DetailLink>
            }
          >
            {!data ? (
              <ReadState read={read} name="Fällige Zahlungen" />
            ) : !outflows.length ? (
              <EmptyNote>Keine fälligen Ausgaben in den nächsten 14 Tagen.</EmptyNote>
            ) : (
              <ul className="hv-due-list">
                {outflows.slice(0, 5).map((item, i) => (
                  <li key={`${item.date}/${i}`}>
                    <span className={item.covered === false ? 'hv-uncovered' : 'hv-covered'}>
                      <BudgetStateMark
                        state={
                          item.covered === true
                            ? 'met'
                            : item.covered === false
                              ? 'open'
                              : 'neutral'
                        }
                      >
                        <span className="sr-only">
                          {item.covered === true
                            ? 'Gedeckt'
                            : item.covered === false
                              ? 'Nicht gedeckt'
                              : 'Keine Budgetzuordnung'}
                        </span>
                      </BudgetStateMark>
                    </span>
                    <span title={item.name}>{item.name}</span>
                    <time dateTime={item.date}>{shortDay(item.date)}</time>
                    <strong>{eur(item.cents)}</strong>
                  </li>
                ))}
              </ul>
            )}
            {unknown > 0 && (
              <span className="hv-source-note">
                {unknown} ohne Budgetzuordnung · <DetailLink kind="due">Details</DetailLink>
              </span>
            )}
          </Card>
          <Card number={5} title="Letzte Buchungen" kind="bookings">
            {!data ? (
              <ReadState read={read} name="Letzte Buchungen" />
            ) : !data.lastBookings.length ? (
              <EmptyNote>Noch keine Buchungen vorhanden.</EmptyNote>
            ) : (
              <ul className="hv-booking-list">
                {data.lastBookings.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{privateAmount(bookingCounterparty(item))}</strong>
                      <small>
                        {item.accountName} · {shortDay(item.date)}
                      </small>
                    </span>
                    <b>{eur(item.amountCents, { sign: true })}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <nav className="hv-more" aria-label="Weitere Heute-Ansichten">
        <DetailLink kind="metrics">Kennzahlen</DetailLink>
        <DetailLink kind="pinned">Angepinnte Kategorien</DetailLink>
        <DetailLink kind="month">Mehr zum Monat</DetailLink>
        <AppLink to="/reports/finanzcheck" search={{ monat: month }}>
          Finanz-Check · Verlauf →
        </AppLink>
      </nav>
    </div>
  );
}

function NextWork({
  data,
  assignment,
}: {
  data: Heute | undefined;
  assignment: number | undefined;
}) {
  const [month] = useMonth();
  const now = data?.stand.today.slice(0, 7) ?? month;
  const over = data?.nextSteps.items.filter((item) => item.kind === 'overspent') ?? [];
  const tasks: Array<{
    id: string;
    title: ReactNode;
    amount?: ReactNode;
    label: string;
    to: string;
    search?: Record<string, string>;
    urgent?: boolean;
  }> = [];
  if (assignment !== undefined && assignment !== 0)
    tasks.push({
      id: 'assignment',
      title: assignment > 0 ? 'zu verteilen' : 'zu viel zugewiesen',
      amount: (
        <b
          className={assignment > 0 ? 'hv-available' : undefined}
          data-testid="kennzahl-value"
          data-kennzahl="zu-verteilen"
        >
          {assignment > 0 && <ArrowUp size={14} aria-hidden="true" />}
          {eur(assignment)}
        </b>
      ),
      label: 'Verteilen',
      to: '/plan/monat',
      search: { monat: month },
      urgent: assignment < 0,
    });
  if (over.length)
    tasks.push({
      id: 'cover',
      title: `${over.length} ${over.length === 1 ? 'Kategorie überzogen' : 'Kategorien überzogen'}`,
      amount: eur(
        over.reduce((sum, item) => sum + item.cents, 0),
        { cents: false },
      ),
      label: 'Decken',
      to: '/plan/monat',
      search: { monat: now, ansicht: 'triage' },
      urgent: true,
    });
  if (data?.attention.pendingCount)
    tasks.push({
      id: 'pending',
      title: `${data.attention.pendingCount} Buchungen unbestätigt`,
      label: 'Bestätigen',
      to: '/konten/buchungen',
      search: { status: 'pending', bis: data.attention.pendingBefore },
    });
  if (data?.accountReminders.length)
    tasks.push({
      id: 'accounts',
      title: `${data.accountReminders.length} Konten zu prüfen`,
      label: 'Abgleichen',
      to: '/konten/pruefen',
      search: { teil: 'aufgaben' },
    });
  const model = data ? attentionModel(data, { count: 0, unavailable: false }) : { tasks: [] };
  if (tasks.length < 4 && data?.attention.inboxCount)
    tasks.push({
      id: 'inbox',
      title: `${data.attention.inboxCount} unter Prüfen`,
      label: 'Zuordnen',
      to: '/konten/pruefen',
    });
  if (tasks.length < 4 && model.tasks.some((task) => task.kind === 'rules'))
    tasks.push({
      id: 'rules',
      title: 'Regelbefunde zum Handeln',
      label: 'Handeln',
      to: '/einstellungen/regelwerk',
    });
  if (
    tasks.length < 4 &&
    model.tasks.some(
      (task) =>
        task.kind === 'contact' ||
        task.kind === 'month-close' ||
        (task.kind === 'accounts' && !tasks.some((row) => row.id === 'accounts')),
    )
  )
    tasks.push({
      id: 'more',
      title: 'Weitere offene Aufgaben',
      label: 'Prüfen',
      to: '/heute/details/tasks',
      search: {
        monat: month,
        period: data?.stand.period ?? 'month',
        von: `/?monat=${month}&period=${data?.stand.period ?? 'month'}`,
      },
    });
  if (!tasks.length && (!data || assignment === undefined)) return null;
  if (!tasks.length)
    return (
      <p className="hv-quiet">
        <CircleCheck size={16} aria-hidden="true" />
        Keine vorrangigen Aufgaben. <DetailLink kind="tasks">Alle Grundlagen →</DetailLink>
      </p>
    );
  return (
    <table className="hv-revisions">
      <caption className="sr-only">Als Nächstes</caption>
      <thead>
        <tr>
          <th scope="col">Rev.</th>
          <th scope="col">Aufgabe</th>
          <th scope="col" className="hv-task-amount">
            Betrag
          </th>
          <th scope="col">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {tasks.slice(0, 4).map((task, i) => (
          <tr key={task.id} className={task.urgent ? 'is-urgent' : undefined}>
            <td>
              <RevisionTriangle
                letter={String.fromCharCode(65 + i)}
                urgent={task.urgent ?? false}
              />
            </td>
            <td>{task.title}</td>
            <td className="hv-task-amount">{task.amount}</td>
            <td>
              <AppLink to={task.to} search={task.search}>
                {task.label} →
              </AppLink>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
