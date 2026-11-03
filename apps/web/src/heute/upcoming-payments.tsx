import { useState } from 'react';
import type { PlannedEventOccurrence } from '@budget/domain';
import { Button, useAmountPrivacy, SectionHead } from '@budget/ui';
import { ChevronRight, CircleCheck, Clock } from 'lucide-react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { skipOccurrence } from '../expected/api';
import { eur, shortDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import type { Heute, HeuteOccurrence } from './api';
import { readLiquiditySelection } from '../reports/liquidity-selection';

export function Upcoming({
  items,
  events = [],
  id,
  title,
  standToday,
  compact = false,
}: {
  items: HeuteOccurrence[];
  events?: PlannedEventOccurrence[];
  id: string;
  title: string;
  standToday?: string | undefined;
  compact?: boolean;
}) {
  useAmountPrivacy();
  const selection = readLiquiditySelection();
  const [expanded, setExpanded] = useState(false);
  const upcoming = [
    ...items.map((item) => ({ date: item.dueDate, item })),
    ...events.map((event) => ({ date: event.date, event })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) return null;
  return (
    <section className={`heute-section${compact ? ' heute-due-compact' : ''}`} aria-labelledby={id}>
      <SectionHead
        id={id}
        title={title}
        aside={
          <AppLink to="/plan/erwartet">
            Alle <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </AppLink>
        }
      />
      {standToday && <p className="heute-note">Stand heute · {standToday}</p>}
      <>
        <p className="heute-note">
          Die Budgetrücklage vergleicht nur das Verfügbar im Envelope mit der Zahlung. Kontostand
          und Überziehungsrahmen werden nicht geprüft.
        </p>
        <ul className="heute-list">
          {(compact && !expanded ? upcoming.slice(0, 4) : upcoming).map((row) => {
            if ('event' in row) {
              const event = row.event;
              return (
                <li className="heute-upcoming" key={event.eventId}>
                  <time dateTime={event.date}>{shortDay(event.date)}</time>
                  <div>
                    <strong>{event.name}</strong>
                    <span>Geplantes Einmalereignis</span>
                  </div>
                  <div className="heute-amount-status">
                    <AppLink
                      className="heute-account-preview"
                      to="/plan/jahr"
                      search={{ ereignis: event.eventId }}
                    >
                      {eur(event.amountCents, { sign: true })}
                    </AppLink>
                    <span>Nur geplant</span>
                  </div>
                </li>
              );
            }
            const item = row.item;
            const sourceDetail =
              [!item.accountId ? item.accountName : null, item.contactName, item.categoryName]
                .filter(Boolean)
                .join(' · ') || 'Ohne weitere Angabe';
            return (
              <li className="heute-upcoming" key={`${item.paymentId}-${item.dueDate}`}>
                <time dateTime={item.dueDate}>{shortDay(item.dueDate)}</time>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.accountId && item.accountName && (
                      <AppLink
                        className="heute-account-preview"
                        to={`/konten/${encodeURIComponent(item.accountId)}`}
                        search={{
                          faellig: item.dueDate,
                          vorschau: 'liquiditaet',
                          horizon: selection.horizon,
                          levers: selection.levers.join(','),
                        }}
                      >
                        {item.accountName} · Kontovorschau
                      </AppLink>
                    )}
                    {compact ? (
                      <span className="heute-upcoming-meta">{sourceDetail}</span>
                    ) : (
                      sourceDetail
                    )}
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
                        <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />{' '}
                        Budgetrücklage reicht
                      </>
                    ) : item.covered === false ? (
                      <>
                        <Clock size={16} strokeWidth={1.75} aria-hidden="true" /> Budgetrücklage
                        reicht nicht
                      </>
                    ) : (
                      statusText(item.status)
                    )}
                  </span>
                  {item.kind === 'inflow' && item.status === 'expected' && (
                    <StrikeButton item={item} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {compact && upcoming.length > 4 && (
          <Button variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Weniger Fälligkeiten' : `Weitere ${upcoming.length - 4} Fälligkeiten`}
          </Button>
        )}
      </>
    </section>
  );
}

/** Take this one income out of the plan; the rule stays, "Rückgängig" brings it back. */
function StrikeButton({ item }: { item: HeuteOccurrence }) {
  const write = useBudgetWrite();
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Diesen Monat streichen: ${item.name}, ${shortDay(item.dueDate)}`}
      onClick={() =>
        void write(
          () => skipOccurrence(item.paymentId, item.dueDate),
          () => `${item.name}: ${shortDay(item.dueDate)} gestrichen`,
        )
      }
    >
      Diesen Monat streichen
    </Button>
  );
}

function statusText(status: Heute['upcoming14'][number]['status']) {
  return status === 'expected'
    ? 'erwartet'
    : status === 'received'
      ? 'erhalten'
      : status === 'deviating'
        ? 'abweichend'
        : status === 'skipped'
          ? 'gestrichen'
          : 'versäumt';
}
