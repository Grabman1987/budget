import { AppLink } from '../shell/app-link';
import { canLinkTransfer } from '@budget/domain';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import {
  useAmountPrivacy,
  useIsPhone,
  BottomSheet,
  Button,
  Field,
  Select,
  TextInput,
} from '@budget/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { todayInVienna } from '@budget/domain';
import { useEffect, useMemo, useState } from 'react';
import { budgetQuery } from '../budget/budget-api';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { BookingTable, type Selection } from './booking-table';
import { CategoryCombobox } from './category-picker';
import {
  activeFilterKeys,
  filterFromSearch,
  hasFilter,
  type BookingsSearch,
} from './bookings-search';
import { pickableCategories } from './capture-model';
import { eur, pluralBookings, valuedMovement } from './format';
import { FLAG_LABEL, STATUS_LABEL } from './labels';
import { useLedgerWrites } from './mutations';
import { AccountOptions } from './account-options';
import { accountsQuery, bookingsInfiniteQuery, lookupsQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import {
  BOOKING_FLAGS,
  BOOKING_STATUSES,
  type BookingFlag,
  type BookingSort,
  type AccountRow,
  type Lookups,
} from './types';

/** Alle Buchungen: filters in the URL, search, day groups, multi-select with bulk edit and undo. */
export function BookingsPage() {
  useAmountPrivacy();
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
  const write = useBudgetWrite();
  const [linking, setLinking] = useState(false);
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** Bulk delete asks once more; any change of the selection withdraws the question. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seenSelected, setSeenSelected] = useState(selected);
  if (seenSelected !== selected) {
    setSeenSelected(selected);
    setConfirmDelete(false);
  }

  // A new filter shows another list: the selection would point at rows that are gone.
  const filterKey = JSON.stringify(filter);
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (filterKey !== seenFilter) {
    setSeenFilter(filterKey);
    setSelected(new Set());
  }

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const first = list.data?.pages[0];
  const filteredAccount = accounts.data?.accounts.find((a) => a.id === filter.accountId);
  const onlyEurAccounts = accounts.data?.accounts.every((a) => a.currency === 'EUR');
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
  const pair = items.filter((b) => selected.has(b.id));
  const canLink =
    selected.size === 2 &&
    pair.length === 2 &&
    canLinkTransfer(pair[0]!, pair[1]!) &&
    pair.every(
      (b) =>
        !b.transferId &&
        b.status !== 'reconciled' &&
        !b.originalCurrency &&
        b.splits.every((s) => !s.transferId && !s.contactId),
    );
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
        {search.ruecksprung && (
          <AppLink className="btn btn-ghost" to={search.ruecksprung}>
            Zurück zur Report-Zelle
          </AppLink>
        )}
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
              {canLink && (
                <Button
                  className="bank-link-action"
                  size="sm"
                  variant="ghost"
                  disabled={linking}
                  onClick={() => {
                    setLinking(true);
                    void write(
                      () =>
                        request<{ groupId: string }>('POST', '/api/bookings/link-transfer', {
                          ids,
                        }),
                      () => 'Als Umbuchung verbunden; Kategorien entfernt.',
                    )
                      .then((result) => {
                        if (result) bulkDone();
                      })
                      .finally(() => setLinking(false));
                  }}
                >
                  Als Umbuchung verbinden
                </Button>
              )}
              {canLink && (
                <span className="kmeta">
                  Kategorien werden entfernt. Beide Buchungstage bleiben erhalten.
                </span>
              )}
              {confirmDelete ? (
                <span className="kbulk-confirm" role="group" aria-label="Löschen bestätigen">
                  <span>{pluralBookings(ids.length)} löschen?</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      writes.bulk.mutate({ ids, remove: true });
                      bulkDone();
                    }}
                  >
                    Ja, löschen
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    Abbrechen
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                  Löschen
                </Button>
              )}
            </div>
          )}
          {first && (
            <p className="ksum" aria-live="polite">
              {pluralBookings(first.total)} ·{' '}
              {first.categorySpendingCents !== undefined
                ? `Kategorie netto ${eur(first.categorySpendingCents)} (Ausgaben − Erstattungen)`
                : filteredAccount
                  ? `Summe ${valuedMovement(first.sumCents, filteredAccount.currency, first.sumEurCents)}`
                  : onlyEurAccounts
                    ? `Summe ${eur(first.sumCents, { sign: true })}`
                    : 'Summe: einzelnes Konto auswählen'}
              {filteredAccount?.currency !== 'EUR' && filteredAccount && (
                <> · EUR je Buchungstag, Kurse in der Tabelle</>
              )}
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
                      buchung: undefined,
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
  accounts: ReadonlyArray<AccountRow>;
  lookups: Lookups | undefined;
}) {
  useAmountPrivacy();
  const phone = useIsPhone();
  const [draft, setDraft] = useState<BookingsSearch | null>(null);
  const keys = activeFilterKeys(search);
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
  const searchField = (
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
  );
  if (!phone)
    return (
      <div className="kfilter">
        {searchField}
        <FilterControls {...{ search, setSearch, accounts, lookups, sortValue, onSortValue }} />
      </div>
    );
  const chips = (value: BookingsSearch, remove: (patch: Partial<BookingsSearch>) => void) =>
    activeFilterKeys(value).map((key) => {
      const label = filterChipLabel(key, value[key]!, accounts, lookups);
      return (
        <Button
          key={key}
          variant="ghost"
          className="kfilter-chip"
          aria-label={`${label} entfernen`}
          onClick={() => remove({ [key]: undefined })}
        >
          {label}
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      );
    });
  const draftSort = draft?.sortierung ?? 'date';
  return (
    <>
      <div className="kfilter-phone">
        <div className="kfilter-search-row">
          {searchField}
          <Button
            variant="ghost"
            aria-haspopup="dialog"
            aria-expanded={draft !== null}
            onClick={() => setDraft({ ...search })}
          >
            Filter ({keys.length})
          </Button>
        </div>
        {keys.length > 0 && (
          <div className="kfilter-chips" role="group" aria-label="Aktive Filter">
            {chips(search, setSearch)}
          </div>
        )}
      </div>
      <BottomSheet open={draft !== null} onClose={() => setDraft(null)} title="Buchungen filtern">
        {draft && (
          <div className="kfilter-sheet">
            <div className="kfilter">
              <FilterControls
                phone
                search={draft}
                setSearch={(patch) => setDraft({ ...draft, ...patch })}
                accounts={accounts}
                lookups={lookups}
                sortValue={`${draftSort}-${draft.richtung ?? (draftSort === 'date' ? 'desc' : 'asc')}`}
                onSortValue={(value) => {
                  const [sortierung, richtung] = value.split('-');
                  setDraft({ ...draft, sortierung, richtung });
                }}
              />
            </div>
            {(draft.buchung || draft.empfaenger) && (
              <div className="kfilter-chips">
                {chips({ buchung: draft.buchung, empfaenger: draft.empfaenger }, (patch) =>
                  setDraft({ ...draft, ...patch }),
                )}
              </div>
            )}
            <div className="kfilter-actions">
              <Button variant="ghost" onClick={() => setDraft({ q: draft.q })}>
                Zurücksetzen
              </Button>
              <Button
                onClick={() => {
                  const patch: Partial<BookingsSearch> = {
                    sortierung: draft.sortierung,
                    richtung: draft.richtung,
                  };
                  for (const key of activeFilterKeys(search)) patch[key] = undefined;
                  for (const key of activeFilterKeys(draft)) patch[key] = draft[key];
                  setSearch(patch);
                  setDraft(null);
                }}
              >
                Anwenden
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

function filterChipLabel(
  key: ReturnType<typeof activeFilterKeys>[number],
  value: string,
  accounts: ReadonlyArray<AccountRow>,
  lookups: Lookups | undefined,
): string {
  switch (key) {
    case 'buchung':
      return 'Einzelne Buchung';
    case 'konto':
      return `Konto: ${accounts.find((a) => a.id === value)?.name ?? 'ausgewählt'}`;
    case 'kategorie':
      return `Kategorie: ${value === 'none' ? 'ohne Kategorie' : (lookups?.categories.find((c) => c.id === value)?.name ?? 'ausgewählt')}`;
    case 'empfaenger':
      return 'Ausgewählter Empfänger';
    case 'status':
      return `Status: ${STATUS_LABEL[value as keyof typeof STATUS_LABEL]}`;
    case 'markierung':
      return `Markierung: ${value === 'none' ? 'keine' : FLAG_LABEL[value as BookingFlag]}`;
    case 'von':
      return `Von: ${value.split('-').reverse().join('.')}`;
    case 'bis':
      return `Bis: ${value.split('-').reverse().join('.')}`;
  }
}

function FilterControls({
  search,
  setSearch,
  accounts,
  lookups,
  sortValue,
  onSortValue,
  phone = false,
}: {
  search: BookingsSearch;
  setSearch: (patch: Partial<BookingsSearch>) => void;
  accounts: ReadonlyArray<AccountRow>;
  lookups: Lookups | undefined;
  sortValue: string;
  onSortValue: (value: string) => void;
  phone?: boolean;
}) {
  const [showClosed, setShowClosed] = useState(false);
  return (
    <>
      <div className="kf kf-sort">
        <Field label="Sortieren">
          {({ id }) => (
            <Select
              id={id}
              className="select-sm"
              value={sortValue}
              onChange={(e) => onSortValue(e.target.value)}
            >
              <option value="date-desc">
                {phone ? 'Neueste zuerst' : 'Datum, neueste zuerst'}
              </option>
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
              <AccountOptions accounts={accounts} withClosed={showClosed} keepId={search.konto} />
            </Select>
          )}
        </Field>
        {accounts.some((a) => a.closedAt) && (
          <label className="kf-closed">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            Geschlossene Konten zeigen
          </label>
        )}
      </div>
      <div className="kf kf-cat">
        <CategoryFilter
          value={search.kategorie ?? ''}
          lookups={lookups}
          onChange={(kategorie) => setSearch({ kategorie })}
        />
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
    </>
  );
}

const ALL = '__all';
const FILTER_LEADING = [
  { id: ALL, label: 'Alle Kategorien' },
  { id: 'none', label: 'ohne Kategorie' },
];

/**
 * Category filter: the same grouped list as in the booking dialog (archived categories left out,
 * Verfügbar of the current month on each option). A category that is archived but still in the
 * URL keeps its name in the field.
 */
function CategoryFilter({
  value,
  lookups,
  onChange,
}: {
  value: string;
  lookups: Lookups | undefined;
  onChange: (categoryId: string) => void;
}) {
  useAmountPrivacy();
  const month = useMemo(() => todayInVienna().slice(0, 7), []);
  const budget = useQuery(budgetQuery(month));
  const categories = useMemo(
    () => pickableCategories(budget.data, lookups, { withAdvance: true }).filter((c) => !c.hidden),
    [budget.data, lookups],
  );
  const name =
    value === ''
      ? 'Alle Kategorien'
      : value === 'none'
        ? 'ohne Kategorie'
        : (lookups?.categories.find((c) => c.id === value)?.name ?? '');
  return (
    <CategoryCombobox
      label="Kategorie"
      categories={categories}
      leading={FILTER_LEADING}
      selectedName={name}
      placeholder="Alle Kategorien"
      pickFirst={false}
      onSelect={(id) => onChange(id === ALL ? '' : id)}
    />
  );
}
