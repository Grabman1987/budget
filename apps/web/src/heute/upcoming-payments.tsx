import { Button, useAmountPrivacy, SectionHead } from '@budget/ui';
import { ChevronRight, CircleCheck, Clock3 } from 'lucide-react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { skipOccurrence } from '../expected/api';
import { eur, shortDay } from '../ledger/format';
import { EmptyNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import type { Heute, HeuteOccurrence } from './api';
import { readLiquiditySelection } from '../reports/liquidity-selection';

export function Upcoming({
  items,
  id,
  title,
}: {
  items: HeuteOccurrence[];
  id: string;
  title: string;
}) {
  useAmountPrivacy();
  const selection = readLiquiditySelection();
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
        <>
          <p className="heute-note">
            Die Budgetrücklage vergleicht nur das Verfügbar im Envelope mit der Zahlung. Kontostand
            und Überziehungsrahmen werden nicht geprüft.
          </p>
          <ul className="heute-list">
            {items.map((item) => (
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
                    <StrikeButton item={item} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
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
