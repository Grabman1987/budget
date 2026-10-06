import { plannedEventOccurrences, planYearMonths, planYearScenario } from '@budget/domain';
import { Button, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { plannedEventsQuery, type PlannedEventView } from '../reports/liquidity-api';
import { AppLink } from '../shell/app-link';
import type { BudgetMonthView } from './budget-api';
import { EventPanel, RECURRENCE_LABELS } from './event-panel';

export function YearPlanning({
  year,
  selectedMonth,
  views,
}: {
  year: number;
  selectedMonth: string;
  views: BudgetMonthView[];
}) {
  const query = useQuery(plannedEventsQuery());
  const [phoneMonth, setPhoneMonth] = useState(selectedMonth);
  const [without, setWithout] = useState(false);
  // A selection is local to this view/year. New events are included by default.
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const search = useSearch({ strict: false }) as { ereignis?: string };
  const navigate = useNavigate();
  const select = (ereignis?: string) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({ ...prev, ereignis })) as never,
    }).then(() => {
      if (!ereignis && search.ereignis)
        requestAnimationFrame(() => {
          if (document.querySelector('dialog[open]')) return;
          const trigger = [
            ...document.querySelectorAll<HTMLButtonElement>(
              `[data-event="${CSS.escape(search.ereignis!)}"]`,
            ),
          ].find((button) => button.getClientRects().length > 0);
          (trigger ?? document.querySelector<HTMLButtonElement>('[data-event="neu"]'))?.focus();
        });
    });
  if (query.isError)
    return <ErrorNote what="Ereignisse" error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <LoadingNote what="Ereignisse" />;
  const { events, asOf, budgetAccounts } = query.data;
  const months = planYearMonths(year);
  const eligible = events.filter(
    (e) => e.status !== 'off_budget' && e.status !== 'unknown_account',
  );
  const ids = eligible.filter((e) => !excluded.includes(e.id)).map((e) => e.id);
  const scenario = planYearScenario(
    year,
    views.map((v) => v.summary),
    eligible,
    ids,
    asOf,
  );
  const activeMonth = scenario.months.find((m) => m.month === phoneMonth)!;
  const categories = [
    ...new Map(views.flatMap((v) => v.categories.map((c) => [c.id, c] as const))).values(),
  ];
  const rows = events.map((event) => ({
    event,
    occurrences: plannedEventOccurrences(event, `${year}-01-01`, `${year}-12-31`),
  }));
  const edit = events.find((e) => e.id === search.ereignis);
  const selection = (e: PlannedEventView) => (
    <label className="event-check">
      <input
        type="checkbox"
        aria-label={`${e.name} im Szenario`}
        checked={ids.includes(e.id) && e.enabled}
        disabled={!e.enabled || !eligible.includes(e)}
        onChange={(change) =>
          setExcluded((previous) =>
            change.target.checked ? previous.filter((id) => id !== e.id) : [...previous, e.id],
          )
        }
      />
      <span>
        {e.name}
        {!e.enabled ? ' · ausgeschaltet' : !eligible.includes(e) ? ' · Konto nicht verfügbar' : ''}
      </span>
    </label>
  );
  return (
    <section
      className="card year-planning"
      aria-labelledby="events-title"
      aria-busy={query.isFetching}
    >
      <div className="year-toolbar">
        <h2 id="events-title">Ereignisse und Szenario</h2>
        <Button data-event="neu" onClick={() => select('neu')}>
          Ereignis planen
        </Button>
      </div>
      {events.length > 0 && (
        <>
          <p className="year-note">
            Gestrichelt: geplante Beträge je Termin, getrennt von Zugewiesen und Aktivität.
            Wiederholungen gelten ab dem Beginn. Bereits gebuchte Zahlungen werden nicht automatisch
            mit Ereignissen abgeglichen.
          </p>
          <div className="year-toolbar">
            <div className="seg" role="group" aria-label="Szenario">
              <button type="button" aria-pressed={!without} onClick={() => setWithout(false)}>
                Mit Auswahl
              </button>
              <button type="button" aria-pressed={without} onClick={() => setWithout(true)}>
                Ohne Auswahl
              </button>
            </div>
            <AppLink to="/reports/liquiditaet">Liquiditätsprognose · 3.1</AppLink>
          </div>
          <p className="year-note">
            Zu verteilen mit Ereignissen = „Zu verteilen“ laut gespeichertem Monatsplan + kumulierte
            Ereignisse nach {longDay(asOf)}. Keine zusätzlichen Gehaltsannahmen, keine
            Kontostandsprognose. Die Auswahl wird nicht gespeichert; ausgeschaltete Ereignisse
            zählen auch in der Liquiditätsprognose nicht.
          </p>
          <dl className="year-totals" aria-live="polite">
            <div>
              <dt>Freies Geld · Jahresende · {without ? 'ohne Auswahl' : 'mit Auswahl'}</dt>
              <dd data-testid="scenario-year-end">
                {eur(without ? scenario.yearEnd.withoutCents : scenario.yearEnd.withCents)}
              </dd>
            </div>
            <div>
              <dt>Ereigniseffekt · Jahresende</dt>
              <dd data-testid="scenario-year-effect">
                {eur(without ? 0 : scenario.yearEnd.effectCents, { sign: true })}
              </dd>
            </div>
          </dl>
        </>
      )}
      <div
        className="year-desktop"
        role="region"
        aria-label="Ereignisse und Szenario, horizontal scrollbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Allow keyboard scrolling of the calendar.
        tabIndex={0}
      >
        <table className="year-table event-grid">
          <caption className="sr-only">
            Geplante Ereignisse nach Kategorie und Monat {year}, und freies Geld im Szenario.
          </caption>
          <thead>
            <tr>
              <th scope="col">Ereignis · Kategorie</th>
              {months.map((m) => (
                <th key={m} scope="col">
                  <abbr title={monthLabel(m)}>{monthLabel(m).split(' ')[0]}</abbr>
                </th>
              ))}
              <th scope="col">Bearbeiten</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ event: e, occurrences }) => (
              <tr key={e.id}>
                <th scope="row">
                  {selection(e)}
                  <small>
                    {e.categoryName ??
                      (e.categoryId ? 'Kategorie nicht verfügbar' : 'Ohne Kategorie')}{' '}
                    · {RECURRENCE_LABELS[e.recurrence]}
                  </small>
                </th>
                {months.map((m) => (
                  <td key={m}>
                    {occurrences
                      .filter((o) => o.date.startsWith(m))
                      .map((o) => (
                        <button
                          type="button"
                          className="event-plan"
                          key={o.date}
                          onClick={() => select(e.id)}
                          aria-label={`${e.name} am ${longDay(o.date)} bearbeiten`}
                        >
                          {eur(o.amountCents, { sign: true })}
                          {!e.enabled && <small>ausgeschaltet</small>}
                        </button>
                      ))}
                  </td>
                ))}
                <td>
                  <Button
                    variant="ghost"
                    data-event={e.id}
                    onClick={() => select(e.id)}
                    aria-label={`${e.name} bearbeiten`}
                  >
                    Bearbeiten
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Zu verteilen</th>
              {scenario.months.map((m) => (
                <td key={m.month}>{eur(m.withoutCents)}</td>
              ))}
              <td />
            </tr>
            {events.length > 0 && (
              <>
                <tr>
                  <th scope="row">
                    <ScenarioLabel kind="month" />
                  </th>
                  {scenario.months.map((m) => (
                    <td key={m.month}>{eur(without ? 0 : m.eventCents, { sign: true })}</td>
                  ))}
                  <td />
                </tr>
                <tr>
                  <th scope="row">
                    <ScenarioLabel kind="sum" />
                  </th>
                  {scenario.months.map((m) => (
                    <td key={m.month}>{eur(without ? 0 : m.effectCents, { sign: true })}</td>
                  ))}
                  <td />
                </tr>
                <tr>
                  <th scope="row">
                    <ScenarioLabel kind="available" />
                  </th>
                  {scenario.months.map((m) => (
                    <td key={m.month}>{eur(without ? m.withoutCents : m.withCents)}</td>
                  ))}
                  <td />
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>
      <div className="year-phone">
        <label className="year-month-choice">
          Ereignismonat
          <Select value={phoneMonth} onChange={(e) => setPhoneMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
        </label>
        {rows.map(({ event: e, occurrences }) => (
          <div className="event-phone-row" key={e.id}>
            {selection(e)}
            <small>
              {e.categoryName ?? (e.categoryId ? 'Kategorie nicht verfügbar' : 'Ohne Kategorie')} ·{' '}
              {RECURRENCE_LABELS[e.recurrence]}
            </small>
            <div className="event-actions">
              {occurrences
                .filter((o) => o.date.startsWith(phoneMonth))
                .map((o) => (
                  <span className="event-plan" key={o.date}>
                    {eur(o.amountCents, { sign: true })}
                  </span>
                ))}
              <Button
                variant="ghost"
                data-event={e.id}
                onClick={() => select(e.id)}
                aria-label={`${e.name} bearbeiten`}
              >
                Bearbeiten
              </Button>
            </div>
          </div>
        ))}
        <dl className="year-totals">
          <div>
            <dt>Zu verteilen</dt>
            <dd>{eur(activeMonth.withoutCents)}</dd>
          </div>
          {events.length > 0 && (
            <>
              <div>
                <dt>
                  <ScenarioLabel kind="month" />
                </dt>
                <dd>{eur(without ? 0 : activeMonth.eventCents, { sign: true })}</dd>
              </div>
              <div>
                <dt>
                  <ScenarioLabel kind="sum" />
                </dt>
                <dd>{eur(without ? 0 : activeMonth.effectCents, { sign: true })}</dd>
              </div>
              <div>
                <dt>
                  <ScenarioLabel kind="available" /> · {monthLabel(phoneMonth)}
                </dt>
                <dd>{eur(without ? activeMonth.withoutCents : activeMonth.withCents)}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
      {!events.length && (
        <p className="year-empty">
          Noch keine Ereignisse geplant. Plane eine einmalige Zahlung oder eine Wiederholung ein.
        </p>
      )}
      {search.ereignis &&
        (edit || search.ereignis === 'neu' ? (
          <EventPanel
            key={search.ereignis}
            event={edit}
            date={selectedMonth + '-01'}
            categories={categories}
            accounts={budgetAccounts}
            onClose={() => select()}
          />
        ) : (
          <p className="year-empty" role="alert">
            Ereignis nicht mehr verfügbar.{' '}
            <Button variant="ghost" onClick={() => select()}>
              Schließen
            </Button>
          </p>
        ))}
    </section>
  );
}

const SCENARIO_LABELS = {
  month: [
    'Geplante Ereignisse in diesem Monat',
    'Summe der ausgewählten geplanten Beträge in diesem Monat nach dem heutigen Stand.',
  ],
  sum: [
    'Ereignisse bis dahin zusammen',
    'Summe der ausgewählten geplanten Beträge nach dem heutigen Stand bis zum Ende dieses Monats.',
  ],
  available: [
    'Zu verteilen mit Ereignissen',
    'Zu verteilen laut Monatsplan plus die ausgewählten geplanten Beträge bis zum Ende dieses Monats.',
  ],
} as const;

function ScenarioLabel({ kind }: { kind: keyof typeof SCENARIO_LABELS }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [label, explanation] = SCENARIO_LABELS[kind];
  return (
    <span
      className="scenario-label"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {label}{' '}
      <Button
        variant="ghost"
        size="xs"
        aria-label={`${label} erklären`}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <Info size={14} aria-hidden="true" />
      </Button>
      {open && (
        <span id={id} role="tooltip" className="scenario-help">
          {explanation}
        </span>
      )}
    </span>
  );
}
