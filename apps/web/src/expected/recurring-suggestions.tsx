import { Button } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur } from '../ledger/format';
import { lookupsQuery } from '../ledger/queries';
import {
  acceptRecurringSuggestion,
  dismissRecurringSuggestion,
  recurringSuggestionsQuery,
  type RecurringSuggestion,
} from './api';
import { cadenceText } from './expected-model';

const dayText = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function RecurringSuggestionList({
  items,
  categoryName,
  busy = false,
  defaultOpen = false,
  onAccept,
  onDismiss,
}: {
  items: readonly RecurringSuggestion[];
  categoryName: (id: string | null) => string | null;
  busy?: boolean;
  defaultOpen?: boolean;
  onAccept: (item: RecurringSuggestion) => void;
  onDismiss: (item: RecurringSuggestion) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items.length) return null;
  // Collapsed by default and no heading: the page keeps its single title and its height.
  return (
    <section className="xp-suggest" aria-label="Erkannte wiederkehrende Zahlungen">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {`Erkannte Zahlungen (${items.length})`}
      </Button>
      <ul hidden={!open}>
        {items.map((item) => {
          const category = categoryName(item.categoryId);
          return (
            <li key={item.id} className="xp-suggest-row">
              <span className="xp-suggest-text">
                <span className="xp-name">{item.name}</span>
                <span className="xp-sub">
                  {cadenceText({ ...item, dateShift: 'none' })}
                  {category ? ` · ${category}` : ''}
                  {` · ${item.count} Buchungen, zuletzt ${dayText(item.lastDate)}`}
                </span>
              </span>
              <span className="xp-suggest-amount">
                {eur(item.kind === 'outflow' ? -item.amountCents : item.amountCents, {
                  sign: true,
                })}
              </span>
              <Button size="sm" disabled={busy} onClick={() => onAccept(item)}>
                Übernehmen
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(item)}>
                Verwerfen
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Suggestions never block the page: no note while loading, nothing on an error. */
export function RecurringSuggestions() {
  const suggestions = useQuery(recurringSuggestionsQuery());
  const lookups = useQuery(lookupsQuery());
  const write = useBudgetWrite();
  return (
    <RecurringSuggestionList
      items={suggestions.data ?? []}
      categoryName={(id) => lookups.data?.categories.find((c) => c.id === id)?.name ?? null}
      onAccept={(item) =>
        void write(
          () => acceptRecurringSuggestion(item.id),
          () => `${item.name} übernommen.`,
          { awaitRefresh: false },
        )
      }
      onDismiss={(item) =>
        void write(
          () => dismissRecurringSuggestion(item.id),
          () => `${item.name} verworfen.`,
          { awaitRefresh: false },
        )
      }
    />
  );
}
