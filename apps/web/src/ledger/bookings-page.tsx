import { Button, Field, Select, TextInput } from '@budget/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { BookingTable, type Selection } from './booking-table';
import { filterFromSearch, hasFilter, type BookingsSearch } from './bookings-search';
import { eur, pluralBookings } from './format';
import { FLAG_LABEL, STATUS_LABEL } from './labels';
import { useLedgerWrites } from './mutations';
import { accountsQuery, bookingsInfiniteQuery, lookupsQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import {
  BOOKING_FLAGS,
  BOOKING_STATUSES,
  type BookingFlag,
  type BookingSort,
  type Lookups,
} from './types';

/** Alle Buchungen: filters in the URL, search, day groups, multi-select with bulk edit and undo. */
export function BookingsPage() {
  const search = useSearch({ strict: false }) as BookingsSearch;
  const navigate = useNavigate();
  const setSearch = (patch: Partial<BookingsSearch>) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        for (const key of Object.keys(next))
          if (next[key] === '' || next[key] === undefined) delete next[key];
        return next;
      }) as never,
      replace: true,
    });

  const filter = useMemo(() => filterFromSearch(search), [search]);
  const list = useInfiniteQuery(bookingsInfiniteQuery(filter));
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const writes = useLedgerWrites();
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // A new filter shows another list: the selection would point at rows that are gone.
  const filterKey = JSON.stringify(filter);
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (filterKey !== seenFilter) {
    setSeenFilter(filterKey);
    setSelected(new Set());
  }

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const first = list.data?.pages[0];
  const selection: Selection = {
    selected,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: (ids) =>
      setSelected((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids))),
  };
  const ids = [...selected];
  const bulkDone = () => setSelected(new Set());

  const sortKey: BookingSort = filter.sort ?? 'date';
  const direction = filter.direction ?? (sortKey === 'date' ? 'desc' : 'asc');
  const onSort = (key: BookingSort) =>
    setSearch(
      key === sortKey
        ? { richtung: direction === 'asc' ? 'desc' : 'asc' }
        : { sortierung: key, richtung: key === 'date' ? 'desc' : 'asc' },
    );

  return (
    <PageFrame meta={KONTEN_BUCHUNGEN_META}>
      <div className="kview">
        <div className="kbar">
          <Button size="sm" onClick={() => setPanel({ mode: 'create', accountId: search.konto })}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Buchung erfassen
          </Button>
        </div>
        <section aria-labelledby="filter-title">
          <h2 className="sr-only" id="filter-title">
            Filter
          </h2>
          <FilterRow
            sortValue={`${sortKey}-${direction}`}
            onSortValue={(value) => {
              const [key, dir] = value.split('-');
              setSearch({ sortierung: key, richtung: dir });
            }}
            search={search}
            setSearch={setSearch}
            accounts={accounts.data?.accounts ?? []}
            lookups={lookups.data}
          />
          {selected.size > 0 && (
            <div className="kbulk" role="group" aria-label="Auswahl bearbeiten">
              <strong>{selected.size} ausgewählt</strong>
              <Select
                className="select-sm"
                aria-label="Kategorie für die Auswahl setzen"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  writes.bulk.mutate({ ids, set: { categoryId: value === 'none' ? null : value } });
                  bulkDone();
                }}
              >
                <option value="">Kategorie setzen …</option>
                <option value="none">ohne Kategorie</option>
                {(lookups.data?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                className="select-sm"
                aria-label="Markierung für die Auswahl setzen"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  writes.bulk.mutate({
                    ids,
                    set: { flag: value === 'none' ? null : (value as BookingFlag) },
                  });
                  bulkDone();
                }}
              >
                <option value="">Markierung setzen …</option>
                <option value="none">Markierung entfernen</option>
                {BOOKING_FLAGS.map((f) => (
                  <option key={f} value={f}>
                    {FLAG_LABEL[f]}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  writes.bulk.mutate({ ids, set: { status: 'confirmed' } });
                  bulkDone();
                }}
              >
                Als bestätigt markieren
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  writes.bulk.mutate({ ids, remove: true });
                  bulkDone();
                }}
              >
                Löschen
              </Button>
            </div>
          )}
          {first && (
            <p className="ksum" aria-live="polite">
              {pluralBookings(first.total)} · Summe {eur(first.sumCents, { sign: true })}
            </p>
          )}
        </section>
        {list.isPending && <LoadingNote what="Buchungen" />}
        {list.isError && (
          <ErrorNote what="Buchungen" error={list.error} onRetry={() => void list.refetch()} />
        )}
        {list.data && items.length === 0 && (
          <EmptyNote
            action={
              hasFilter(search) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSearch({
                      konto: undefined,
                      kategorie: undefined,
                      empfaenger: undefined,
                      status: undefined,
                      markierung: undefined,
                      von: undefined,
                      bis: undefined,
                      q: undefined,
                    })
                  }
                >
                  Filter zurücksetzen
                </Button>
              ) : undefined
            }
          >
            {hasFilter(search)
              ? 'Keine Buchungen für diese Filter.'
              : 'Noch keine Buchungen. Erfasse die erste mit „Buchung erfassen“.'}
          </EmptyNote>
        )}
        {items.length > 0 && (
          <>
            <BookingTable
              items={items}
              caption="Alle Buchungen nach Tag"
              variant="all"
              selection={selection}
              sort={{ key: sortKey, direction, onSort }}
              onOpen={(booking) => setPanel({ mode: 'edit', booking })}
            />
            {list.hasNextPage && (
              <p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  Weitere Buchungen laden
                </Button>
              </p>
            )}
          </>
        )}
      </div>
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </PageFrame>
  );
}

function FilterRow({
  search,
  setSearch,
  accounts,
  lookups,
  sortValue,
  onSortValue,
}: {
  sortValue: string;
  onSortValue: (value: string) => void;
  search: BookingsSearch;
  setSearch: (patch: Partial<BookingsSearch>) => void;
  accounts: { id: string; name: string }[];
  lookups: Lookups | undefined;
}) {
  // The search box writes to the URL after a short pause so that every key stroke is not a request.
  const [q, setQ] = useState(search.q ?? '');
  const [seenQ, setSeenQ] = useState(search.q);
  if (search.q !== seenQ) {
    setSeenQ(search.q);
    setQ(search.q ?? '');
  }
  useEffect(() => {
    if (q === (search.q ?? '')) return;
    const timer = setTimeout(() => setSearch({ q: q.trim() || undefined }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="kfilter">
      <div className="kf kf-search">
        <Field label="In Buchungen suchen">
          {({ id }) => (
            <TextInput
              id={id}
              type="search"
              value={q}
              placeholder="Empfänger, Notiz, Kategorie"
              autoComplete="off"
              onChange={(e) => setQ(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="kf kf-sort">
        <Field label="Sortieren">
          {({ id }) => (
            <Select
              id={id}
              className="select-sm"
              value={sortValue}
              onChange={(e) => onSortValue(e.target.value)}
            >
              <option value="date-desc">Datum, neueste zuerst</option>
              <option value="date-asc">Datum, älteste zuerst</option>
              <option value="amount-asc">Betrag aufsteigend</option>
              <option value="amount-desc">Betrag absteigend</option>
              <option value="payee-asc">Empfänger A–Z</option>
              <option value="account-asc">Konto A–Z</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="kf">
        <Field label="Konto">
          {({ id }) => (
            <Select
              id={id}
              className="select-sm"
              value={search.konto ?? ''}
              onChange={(e) => setSearch({ konto: e.target.value })}
            >
              <option value="">Alle Konten</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="kf">
        <Field label="Kategorie">
          {({ id }) => (
            <Select
              id={id}
              className="select-sm"
              value={search.kategorie ?? ''}
              onChange={(e) => setSearch({ kategorie: e.target.value })}
            >
              <option value="">Alle Kategorien</option>
              <option value="none">ohne Kategorie</option>
              {(lookups?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="kf">
        <Field label="Status">
          {({ id }) => (
            <Select
              id={id}
              className="select-sm"
              value={search.status ?? ''}
              onChange={(e) => setSearch({ status: e.target.value })}
            >
              <option value="">Alle</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="kf">
        <Field label="Markierung">
          {({ id }) => (
            <Select
              id={id}
              className="select-sm"
              value={search.markierung ?? ''}
              onChange={(e) => setSearch({ markierung: e.target.value })}
            >
              <option value="">Alle</option>
              <option value="none">keine</option>
              {BOOKING_FLAGS.map((f) => (
                <option key={f} value={f}>
                  {FLAG_LABEL[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="kf">
        <Field label="Von">
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              value={search.von ?? ''}
              onChange={(e) => setSearch({ von: e.target.value })}
            />
          )}
        </Field>
      </div>
      <div className="kf">
        <Field label="Bis">
          {({ id }) => (
            <TextInput
              id={id}
              type="date"
              value={search.bis ?? ''}
              onChange={(e) => setSearch({ bis: e.target.value })}
            />
          )}
        </Field>
      </div>
    </div>
  );
}
