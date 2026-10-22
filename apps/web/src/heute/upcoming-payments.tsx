import type { PlannedEventOccurrence } from '@budget/domain';
import { Button, useAmountPrivacy, SectionHead } from '@budget/ui';
import { ChevronRight, CircleCheck, Clock3 } from 'lucide-react';
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
  readOnly = false,
}: {
  items: HeuteOccurrence[];
  events?: PlannedEventOccurrence[];
  id: string;
  title: string;
  standToday?: string | undefined;
  readOnly?: boolean;
}) {
  useAmountPrivacy();
  const selection = readLiquiditySelection();
  const upcoming = [
    ...items.map((item) => ({ date: item.dueDate, item })),
    ...events.map((event) => ({ date: event.date, event })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) return null;
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
      {standToday && <p className="heute-note">Stand heute · {standToday}</p>}
      <>
        <p className="heute-note">
          Die Budgetrücklage vergleicht nur das Verfügbar in der Kategorie mit der Zahlung. Kontostand
          und Überziehungsrahmen werden nicht geprüft.
        </p>
        <ul className="heute-list">
          {upcoming.map((row) => {
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
                    {[
                      !item.accountId ? item.accountName : null,
                      item.contactName,
                      item.categoryName,
                    ]
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
                        <CircleCheck size={14} aria-hidden="true" /> Budgetrücklage reicht
                      </>
                    ) : item.covered === false ? (
                      <>
                        <Clock3 size={14} aria-hidden="true" /> Budgetrücklage reicht nicht
                      </>
                    ) : (
                      statusText(item.status)
                    )}
                  </span>
                  {item.kind === 'inflow' && item.status === 'expected' && (
                    <StrikeButton item={item} disabled={readOnly} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </>
    </section>
  );
}

/** Take this one income out of the plan; the rule stays, "Rückgängig" brings it back. */
function StrikeButton({ item, disabled }: { item: HeuteOccurrence; disabled: boolean }) {
  const write = useBudgetWrite();
  return (
    <Button
      size="sm"
      disabled={disabled}
      variant="ghost"
      aria-label={`Diesen Monat streichen: ${item.name}, ${shortDay(item.dueDate)}`}
      onClick={() =>
        !disabled && void write(
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
