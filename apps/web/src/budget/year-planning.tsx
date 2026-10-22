import { plannedEventOccurrences, planYearScenario } from '@budget/domain';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { plannedEventsQuery, type PlannedEventView } from '../reports/liquidity-api';
import type { BudgetMonthView } from './budget-api';
import { EventPanel, RECURRENCE_LABELS } from './event-panel';
import { YearScenarioChart } from './year-scenario-chart';

export function YearPlanning({
  year,
  selectedMonth,
  views,
  context,
}: {
  year: number;
  selectedMonth: string;
  views: BudgetMonthView[];
  context?: ReactNode;
}) {
  useAmountPrivacy();
  const query = useQuery(plannedEventsQuery());
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
  const categories = [
    ...new Map(views.flatMap((v) => v.categories.map((c) => [c.id, c] as const))).values(),
  ];
  const rows = events.map((event) => ({
    event,
    occurrences: plannedEventOccurrences(event, `${year}-01-01`, `${year}-12-31`),
  }));
  const selectedOccurrences = without
    ? []
    : rows.flatMap(({ event, occurrences }) =>
        event.enabled && eligible.includes(event) && ids.includes(event.id)
          ? occurrences.filter((o) => o.date > asOf)
          : [],
      );
  const edit = events.find((e) => e.id === search.ereignis);
  const selection = (e: PlannedEventView) => (
    <label className="event-check">
      <input
        type="checkbox"
        aria-label={`${maskMoneyText(e.name)} im Szenario`}
        checked={ids.includes(e.id) && e.enabled}
        disabled={!e.enabled || !eligible.includes(e)}
        onChange={(change) =>
          setExcluded((previous) =>
            change.target.checked ? previous.filter((id) => id !== e.id) : [...previous, e.id],
          )
        }
      />
      <span>
        {maskMoneyText(e.name)}
        {!e.enabled ? ' · ausgeschaltet' : !eligible.includes(e) ? ' · Konto nicht verfügbar' : ''}
      </span>
    </label>
  );
  return (
    <section
      className="card year-planning"
      aria-labelledby="year-scenario-title"
      aria-busy={query.isFetching}
    >
      <div className="year-toolbar">
        <h2 id="year-scenario-title">Geld bis Jahresende</h2>
      </div>
      <dl className="year-scenario-lead">
        <dt>
          Freies Geld am 31.12.{year} {without ? 'ohne Ereignisse' : 'mit Ereignissen'}
        </dt>
        <dd>
          <span data-testid="scenario-year-end" aria-live="polite">
            {eur(without ? scenario.yearEnd.withoutCents : scenario.yearEnd.withCents)}
          </span>
          <div className="seg" role="group" aria-label="Szenario">
            <button type="button" aria-pressed={!without} onClick={() => setWithout(false)}>
              Mit Auswahl
            </button>
            <button type="button" aria-pressed={without} onClick={() => setWithout(true)}>
              Ohne Auswahl
            </button>
          </div>
        </dd>
      </dl>
      <div className="year-scenario-context">
        {context}
        <span>
          Ereignisse:{' '}
          <strong data-testid="scenario-year-effect">
            {eur(without ? 0 : scenario.yearEnd.effectCents, { sign: true })}
          </strong>
        </span>
      </div>
      <YearScenarioChart
        year={year}
        scenario={scenario}
        without={without}
        asOf={asOf}
        occurrences={selectedOccurrences}
      />
      <div className="year-event-controls">
        <h3 id="events-title" className="sr-only">
          Ereignisse
        </h3>
        <Button data-event="neu" onClick={() => select('neu')}>
          Ereignis planen
        </Button>
        {!rows.length ? (
          <p className="year-empty">
            Noch keine Ereignisse geplant. Auch ohne Ereignisse gilt der gespeicherte Jahresplan.
          </p>
        ) : (
          <details className="year-events">
            <summary>
              <ChevronDown aria-hidden="true" size={16} /> {rows.length}{' '}
              {rows.length === 1 ? 'Ereignis' : 'Ereignisse'}
              <span className="sr-only"> ansehen und auswählen</span>
            </summary>
            <p className="year-note">
              Auswahl nur für dieses Szenario; ein Häkchen bucht kein Geld. „Ohne Auswahl“ blendet
              alle Wirkungen aus.
            </p>
            <ul className="year-event-list" aria-labelledby="events-title">
              {rows.map(({ event: e, occurrences }) => {
                const upcoming = occurrences.find((o) => o.date > asOf);
                const date = upcoming?.date ?? occurrences[0]?.date ?? e.date;
                return (
                  <li key={e.id}>
                    <div className="year-event-date">
                      <time dateTime={date}>{longDay(date)}</time>
                      <small>{RECURRENCE_LABELS[e.recurrence]}</small>
                    </div>
                    <div>
                      {selection(e)}
                      <small>
                        {maskMoneyText(
                          e.categoryName ??
                            (e.categoryId ? 'Kategorie nicht verfügbar' : 'Ohne Kategorie'),
                        )}
                      </small>
                      {!upcoming && (
                        <small>
                          Kein weiterer Termin in diesem Jahr; keine neue Szenariowirkung.
                        </small>
                      )}
                    </div>
                    <strong className="year-event-amount">
                      {eur(e.amountCents, { sign: true })}
                    </strong>
                    <Button
                      variant="ghost"
                      data-event={e.id}
                      onClick={() => select(e.id)}
                      aria-label={`${maskMoneyText(e.name)} bearbeiten`}
                    >
                      Bearbeiten
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p className="year-note">
              Wirkung auf den Jahresendstand:{' '}
              {eur(without ? 0 : scenario.yearEnd.effectCents, { sign: true })}. Nur ausgewählte,
              eingeschaltete Termine nach {longDay(asOf)} auf verfügbaren Budgetkonten zählen.
            </p>
          </details>
        )}
      </div>
      <details className="year-instructions">
        <summary>
          <Info aria-hidden="true" size={16} /> Grundlage und Grenzen der Planung
        </summary>
        <p className="year-note">
          <ScenarioLabel kind="available" />
        </p>
        <p className="year-note">
          Zu verteilen mit Ereignissen = „Zu verteilen“ laut gespeichertem Monatsplan plus
          kumulierte ausgewählte Ereignisse nach {longDay(asOf)}. Keine zusätzlichen
          Gehaltsannahmen. Wiederholungen gelten ab ihrem Beginn. Bereits gebuchte Zahlungen werden
          nicht automatisch mit Ereignissen abgeglichen.
        </p>
        <p className="year-note">
          Einnahmen und Konsum oben beziehen sich wie im Jahresreport auf abgeschlossene Monate.
          Erstattungen mindern Konsum; Kapitalerträge, Umbuchungen und Eröffnungssalden sind keine
          Haushaltseinnahmen. Die Ereignisauswahl wird nicht gespeichert.
        </p>
      </details>
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
