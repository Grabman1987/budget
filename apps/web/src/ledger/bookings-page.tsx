import { AppLink } from '../shell/app-link';
import { canLinkTransfer } from '@budget/domain';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import {
  useAmountPrivacy,
  useIsPhone,
  BottomSheet,
  FormDialog,
  Button,
  Field,
  Select,
  TextInput,
} from '@budget/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronDown, MoreHorizontal, Plus, X, ListChecks } from 'lucide-react';
import { todayInVienna } from '@budget/domain';
import { useEffect, useMemo, useState } from 'react';
import { budgetQuery } from '../budget/budget-api';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { KontenFrame } from './konten-frame';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { BookingTable, type Selection } from './booking-table';
import { BookingSelectionBar, type BulkOutcome } from './booking-selection-bar';
import { BookingDeleteConfirmation } from './booking-delete-confirmation';
import { filteredBookingsCsvUrl, type BulkSelection } from './api';
import type { BulkSet } from './cache';
import { BookingStatusChips } from './booking-status-chips';
import { useRegisterToday, useUpcomingRegister } from './upcoming-register';
import { CategoryCombobox } from './category-picker';
import {
  activeFilterKeys,
  filterFromSearch,
  hasFilter,
  type BookingsSearch,
} from './bookings-search';
import { pickableCategories } from './capture-model';
import { eur, longDay, nativeCurrency, pluralBookings } from './format';
import { FLAG_LABEL, STATUS_LABEL } from './labels';
import { useLedgerWrites } from './mutations';
import { AccountOptions } from './account-options';
import { accountsQuery, bookingsInfiniteQuery, lookupsQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import { LoadOlder } from './load-older';
import { BookingViews } from './booking-views';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './bookings-redesign.css';
import { RegisterSummary, categoryNetLabel } from './register-summary';
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
  const setSearch = (patch: Partial<BookingsSearch>) => {
    if (writes.bulk.isPending || linking) return;
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
  };

  const filter = useMemo(() => filterFromSearch(search), [search]);
  const today = useRegisterToday();
  const list = useInfiniteQuery(
    bookingsInfiniteQuery({ ...filter, to: filter.to && filter.to < today ? filter.to : today }),
  );
  const upcoming = useUpcomingRegister(filter, today, 'all');
  const hasUpcoming = (upcoming.model?.count ?? 0) > 0;
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const writes = useLedgerWrites();
  const write = useBudgetWrite();
  const [linking, setLinking] = useState(false);
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = useState(false),
    [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const isPhone = useIsPhone(),
    pending = writes.bulk.isPending || linking;
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
  const selection: Selection = {
    selected,
    disabled: pending,
    mode: isPhone && selecting,
    toggle: (id) => {
      if (pending) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    toggleAll: (ids) => {
      if (pending || !ids.length) return;
      setSelected((prev) => {
        const next = new Set(prev),
          all = ids.every((id) => prev.has(id));
        for (const id of ids) {
          if (all) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    },
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
  const bulkDone = (completed = ids) =>
    setSelected((prev) => new Set([...prev].filter((id) => !completed.includes(id))));
  const runBulk = async (
    vars:
      | { ids: string[]; set: BulkSet; previewRevision?: string }
      | { ids: string[]; remove: true; previewRevision: string },
    submitted?: BulkSelection,
  ) => {
    if (pending) return;
    setOutcome(null);
    try {
      const result = await writes.bulk.mutateAsync(vars);
      setOutcome({
        action: 'remove' in vars ? 'delete' : 'update',
        result,
        ...(submitted ? { submitted } : {}),
      });
      bulkDone(result.changed);
    } catch (error) {
      if ('remove' in vars || vars.previewRevision) throw error;
      /* The mutation reports failure; the selection and its context stay intact. */
    }
  };

  const sortKey: BookingSort = filter.sort ?? 'date';
  const direction = filter.direction ?? (sortKey === 'date' ? 'desc' : 'asc');
  const onSort = (key: BookingSort) =>
    setSearch(
      key === sortKey
        ? { richtung: direction === 'asc' ? 'desc' : 'asc' }
        : { sortierung: key, richtung: key === 'date' ? 'desc' : 'asc' },
    );

  const filters = (
    <section aria-labelledby="filter-title">
      <h2 className="sr-only" id="filter-title">
        Filter
      </h2>
      <fieldset className="kbulk-readonly-surface" disabled={pending}>
        <legend className="sr-only">Buchungsfilter</legend>
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
        {!REDESIGN_ENABLED && (
          <BookingStatusChips value={filter.status} onChange={(status) => setSearch({ status })} />
        )}
      </fieldset>

      {first && (
        <p className="ksum" aria-live="polite">
          {first.nativeTotalsPending ? 'Anzahl wird aktualisiert …' : pluralBookings(first.total)} ·{' '}
          {first.nativeTotalsPending
            ? 'Summe wird aktualisiert …'
            : first.categorySpendingCents !== undefined
              ? `${categoryNetLabel(!!search.kategoriegruppe, first.categorySpendingCents)} (Ausgaben − Erstattungen)`
              : first.nativeTotals
                ? `${REDESIGN_ENABLED ? 'Kontobewegungen (ganze Buchungen)' : 'Summe'} ${first.nativeTotals.length ? first.nativeTotals.map((total) => (total.cents === null ? `${total.currency}: nicht darstellbar` : nativeCurrency(total.cents, total.currency, true))).join(' · ') : eur(0)}`
                : 'Summe nicht verfügbar'}
          {!first.nativeTotalsPending && filteredAccount && filteredAccount.currency !== 'EUR' && (
            <>
              {' '}
              ·{' '}
              {first.sumEurCents == null
                ? 'EUR: Kurs fehlt'
                : Number.isSafeInteger(first.sumEurCents)
                  ? eur(first.sumEurCents, { sign: true })
                  : 'EUR: nicht darstellbar'}{' '}
              · EUR je Buchungstag, Kurse in der Tabelle
            </>
          )}
        </p>
      )}
    </section>
  );

  const headerTools = (
    <div className="kbar kbookings-bar">
      {REDESIGN_ENABLED && (
        <div className="bookings-redesign-heading">
          <span className="kmeta">Stand {longDay(today)}</span>
        </div>
      )}
      {isPhone && (
        <Button
          variant="ghost"
          disabled={pending}
          aria-pressed={selecting}
          onClick={() => {
            setSelecting((value) => !value);
            setSelected(new Set());
          }}
        >
          {REDESIGN_ENABLED && <ListChecks size={16} aria-hidden="true" />}
          <span className={REDESIGN_ENABLED ? 'sr-only' : undefined}>
            {selecting ? 'Auswahl beenden' : 'Auswählen'}
          </span>
        </Button>
      )}
      {!REDESIGN_ENABLED && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => setPanel({ mode: 'create', accountId: search.konto })}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className={REDESIGN_ENABLED ? 'sr-only' : undefined}>Buchung erfassen</span>
        </Button>
      )}
      <details className="kregister-actions">
        <summary aria-label="Weitere Buchungsaktionen">
          <MoreHorizontal size={20} strokeWidth={1.5} aria-hidden="true" />
        </summary>
        <div className="kregister-menu">
          <BookingViews
            search={search}
            disabled={pending}
            onOpen={(next) => {
              if (!pending) void navigate({ to: '/konten/buchungen', search: next as never });
            }}
          />
          <a
            className="btn btn-ghost"
            href={filteredBookingsCsvUrl({
              ...filter,
              to: filter.to && filter.to < today ? filter.to : today,
            })}
            download
          >
            Aktuellen Filter als CSV exportieren
          </a>
        </div>
      </details>
    </div>
  );
  return (
    <KontenFrame
      meta={KONTEN_BUCHUNGEN_META}
      view="bookings"
      sourceDay={today}
      headerTools={
        <>
          {REDESIGN_ENABLED && filters}
          {headerTools}
        </>
      }
      headerSummary={
        REDESIGN_ENABLED ? (
          <RegisterSummary
            months={first?.monthlyTotals}
            kind={first?.monthlyKind}
            today={today}
            pending={list.isFetching || !!first?.nativeTotalsPending}
          />
        ) : undefined
      }
    >
      <div
        className={REDESIGN_ENABLED ? 'kview bookings-redesign' : 'kview'}
        data-redesign={REDESIGN_ENABLED ? 'bookings' : undefined}
      >
        {search.ruecksprung && (
          <AppLink className="btn btn-ghost" to={search.ruecksprung}>
            Zurück zur Report-Zelle
          </AppLink>
        )}
        {!REDESIGN_ENABLED && headerTools}
        {!REDESIGN_ENABLED && filters}
        {list.isPending && <LoadingNote what="Buchungen" />}
        {list.isError && (
          <ErrorNote what="Buchungen" error={list.error} onRetry={() => void list.refetch()} />
        )}
        {upcoming.notes}
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
                      kategoriegruppe: undefined,
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
              ? `Keine ${hasUpcoming ? 'bisherigen ' : ''}Buchungen für diese Filter.`
              : hasUpcoming
                ? 'Noch keine Buchungen bis heute. Erfasse eine mit „Buchung erfassen“.'
                : 'Noch keine Buchungen. Erfasse die erste mit „Buchung erfassen“.'}
          </EmptyNote>
        )}
        {(items.length > 0 || hasUpcoming) && (
          <>
            <fieldset className="kbulk-readonly-surface" disabled={pending}>
              <legend className="sr-only">Buchungen</legend>
              <BookingTable
                items={items}
                monthlyTotals={first?.monthlyTotals}
                monthlyKind={first?.monthlyKind}
                monthlyTotalsPending={list.isFetching || first?.nativeTotalsPending}
                caption="Alle Buchungen nach Tag"
                variant="all"
                showRunningBalance={!!filteredAccount}
                upcoming={upcoming.model}
                {...(!isPhone || selecting ? { selection } : {})}
                sort={{ key: sortKey, direction, onSort }}
                onOpen={(booking) => {
                  if (pending) return;
                  if (isPhone && selecting) selection.toggle(booking.id);
                  else setPanel({ mode: 'edit', booking });
                }}
              />
            </fieldset>
            {list.hasNextPage && (
              <LoadOlder
                fetching={list.isFetching}
                failed={list.isError}
                load={list.fetchNextPage}
              />
            )}
          </>
        )}
        <FormDialog
          open={confirmDelete}
          title="Löschen bestätigen"
          onClose={() => setConfirmDelete(false)}
          beforeClose={() => !pending}
        >
          {confirmDelete && (
            <BookingDeleteConfirmation
              key={ids.slice().sort().join('|')}
              ids={ids}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={(preview) =>
                runBulk(
                  { ids: preview.ids, remove: true, previewRevision: preview.revision },
                  preview.selection,
                )
              }
            />
          )}
        </FormDialog>
        <BookingSelectionBar
          ids={ids}
          pending={pending}
          categories={lookups.data?.categories ?? []}
          projects={lookups.data?.projects ?? []}
          onApply={(set, facts, previewRevision) =>
            runBulk({ ids: [...ids], set, ...(previewRevision ? { previewRevision } : {}) }, facts)
          }
          onClear={() => {
            if (!pending) setSelected(new Set());
          }}
          outcome={outcome}
          extra={(facts) => (
            <>
              {canLink && (
                <Button
                  className="bank-link-action"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
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
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || !facts}
                onClick={() => setConfirmDelete(true)}
              >
                Löschen
              </Button>
            </>
          )}
        />
      </div>
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </KontenFrame>
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
  const [open, setOpen] = useState(false);
  const keys = activeFilterKeys(search);
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
  const chips = keys.map((key) => {
    const label = filterChipLabel(key, search[key]!, accounts, lookups);
    return (
      <Button
        key={key}
        variant="ghost"
        className="kfilter-chip"
        aria-label={`${label} entfernen`}
        onClick={() => setSearch({ [key]: undefined })}
      >
        {label}
        <X size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    );
  });
  return (
    <>
      <div className="kfilter-phone">
        <div className="kfilter-search-row">
          <div className="kf kf-search">
            <Field label="In Buchungen suchen">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="search"
                  value={q}
                  placeholder="Empfänger, Notiz, Kategorie"
                  autoComplete="off"
                  onChange={(event) => setQ(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Button
            variant="ghost"
            aria-label={`Filter (${keys.length})`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            {REDESIGN_ENABLED ? 'Filter' : `Filter (${keys.length})`}{' '}
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
        {REDESIGN_ENABLED && (
          <BookingStatusChips
            value={filterFromSearch(search).status}
            onChange={(status) => setSearch({ status })}
          />
        )}
        {chips.length > 0 && (
          <div className="kfilter-chips" role="group" aria-label="Aktive Filter">
            {chips}
          </div>
        )}
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Buchungen filtern">
        <div className="kfilter-sheet">
          <p>Änderungen wirken sofort. Der aktuelle Filter steht in der URL.</p>
          <div className="kfilter">
            <FilterControls
              phone
              {...{ search, setSearch, accounts, lookups, sortValue, onSortValue }}
            />
          </div>
          <div className="kfilter-actions">
            <Button
              variant="ghost"
              onClick={() => {
                const patch: Partial<BookingsSearch> = {};
                for (const key of keys) patch[key] = undefined;
                setSearch(patch);
              }}
            >
              Zurücksetzen
            </Button>
            <Button onClick={() => setOpen(false)}>Fertig</Button>
          </div>
        </div>
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
    case 'kategoriegruppe':
      return `Gruppe: ${lookups?.groups.find((g) => g.id === value)?.name ?? 'ausgewählt'} · Bedarf und Wunsch`;
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
