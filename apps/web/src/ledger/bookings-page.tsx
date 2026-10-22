import './ledger-batch.css';
import { AppLink } from '../shell/app-link';
import { canLinkTransfer } from '@budget/domain';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import {
  useAmountPrivacy,
  useIsPhone,
  FormDialog,
  Button,
  Field,
  Select,
  TextInput,
} from '@budget/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { todayInVienna } from '@budget/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { budgetQuery } from '../budget/budget-api';
import { KONTEN_BUCHUNGEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { BookingTable, type Selection } from './booking-table';
import { BookingSelectionBar, type BulkOutcome } from './booking-selection-bar';
import { BookingBulkEditPanel } from './booking-bulk-edit';
import { BookingDeletePreviewPanel } from './booking-delete-preview';
import { downloadBookingsCsv, type BulkSelection } from './api';
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
import { eur, nativeCurrency, pluralBookings } from './format';
import { errorText, FLAG_LABEL, STATUS_LABEL } from './labels';
import { useLedgerWrites } from './mutations';
import { AccountOptions } from './account-options';
import { accountsQuery, bookingsInfiniteQuery, lookupsQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import { LoadOlder } from './load-older';
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
    if (writes.bulk.isPending || writes.protectedBulk.isPending || editPreviewBusy || linking) return;
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
  const historyFilter = useMemo(() => ({ ...filter, to: filter.to && filter.to < today ? filter.to : today }), [filter, today]);
  const list = useInfiniteQuery(bookingsInfiniteQuery(historyFilter, undefined, true));
  const upcoming = useUpcomingRegister(filter, today, 'all');
  const hasUpcoming = (upcoming.model?.count ?? 0) > 0;
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const writes = useLedgerWrites();
  const write = useBudgetWrite();
  const [linking, setLinking] = useState(false);
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = useState(false), [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [editIds, setEditIds] = useState<string[] | null>(null);
  const [editPreviewBusy, setEditPreviewBusy] = useState(false);
  const isPhone = useIsPhone(), pending = writes.bulk.isPending || writes.protectedBulk.isPending || editPreviewBusy || linking;
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [seenSelected, setSeenSelected] = useState(selected);
  if (seenSelected !== selected) {
    setSeenSelected(selected);
    setDeleteIds(null);
    setEditIds(null);
  }

  // A new filter shows another list: the selection would point at rows that are gone.
  const filterKey = JSON.stringify(filter);
  const [seenFilter, setSeenFilter] = useState(filterKey);
  if (filterKey !== seenFilter) {
    setSeenFilter(filterKey);
    setSelected(new Set());
    setDeleteIds(null);
    setEditIds(null);
  }

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const first = list.data?.pages[0];
  const [searchDraft, setSearchDraft] = useState(search.q ?? '');
  const [csvBusy, setCsvBusy] = useState(false), [csvError, setCsvError] = useState('');
  const csvAbort = useRef<AbortController | null>(null);
  const historyKey = JSON.stringify(historyFilter);
  useEffect(() => { csvAbort.current?.abort(); setCsvBusy(false); setCsvError(''); }, [historyKey]);
  useEffect(() => () => { csvAbort.current?.abort(); }, []);
  const csvDisabled = pending || csvBusy || !list.data || list.isFetching || list.isError || searchDraft.trim() !== (search.q ?? '');
  const exportCsv = async () => {
    if (csvDisabled || csvAbort.current) return;
    const controller = new AbortController(); csvAbort.current = controller;
    const fixedFilter = { ...historyFilter };
    setCsvBusy(true); setCsvError('');
    try {
      const blob = await downloadBookingsCsv(fixedFilter, controller.signal);
      if (controller.signal.aborted || csvAbort.current !== controller) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url; link.download = `budget-bookings-${today}.csv`;
        document.body.appendChild(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
    } catch (error) { if (!controller.signal.aborted) setCsvError(errorText(error)); }
    finally { if (csvAbort.current === controller) { csvAbort.current = null; setCsvBusy(false); } }
  };
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
        const next = new Set(prev), all = ids.every((id) => prev.has(id));
        for (const id of ids) { if (all) next.delete(id); else next.add(id); }
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
  const bulkDone = (completed = ids) => setSelected((prev) => new Set([...prev].filter((id) => !completed.includes(id))));
  const runBulk = async (vars: { ids: string[]; set: BulkSet } | { ids: string[]; remove: true; previewRevision: string }, submitted?: BulkSelection, propagateError = false) => {
    if (pending) return;
    setOutcome(null);
    try {
      const result = await writes.bulk.mutateAsync(vars);
      setOutcome({ action: 'remove' in vars ? 'delete' : 'update', result, ...(submitted ? { submitted } : {}) });
      bulkDone(result.changed);
    } catch (error) { if (propagateError) throw error; /* Preserve the selection and operation context. */ }
  };

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
          {isPhone && <Button variant="ghost" disabled={pending} aria-pressed={selecting} onClick={() => {
            setSelecting((value) => !value); setSelected(new Set());
          }}>{selecting ? 'Auswahl beenden' : 'Auswählen'}</Button>}
          <Button size="sm" disabled={pending} onClick={() => setPanel({ mode: 'create', accountId: search.konto })}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Buchung erfassen
          </Button>
        </div>
        <section aria-labelledby="filter-title">
          <h2 className="sr-only" id="filter-title">
            Filter
          </h2>
          <fieldset className="kbulk-readonly-surface" disabled={pending}>
          <legend className="sr-only">Buchungsfilter</legend>
          <FilterRow
            pending={pending}
            onSearchDraft={setSearchDraft}
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
          <BookingStatusChips value={filter.status} onChange={(status) => setSearch({ status })} />
          </fieldset>

          {first && (
            <p className="ksum" aria-live="polite">
              {pluralBookings(first.total)} im Filter · Summe: {first.nativeTotals?.length
                ? first.nativeTotals.map((total) => total.cents === null ? `${total.currency}: nicht darstellbar` : nativeCurrency(total.cents, total.currency, true)).join(' · ')
                : first.total === 0 ? 'keine Buchungen' : 'nicht verfügbar'}
              {first.categorySpendingCents !== undefined && <> · {search.kategoriegruppe ? 'Gruppe' : 'Kategorie'} netto {eur(first.categorySpendingCents)} (Ausgaben − Erstattungen)</>}
            </p>
          )}
        </section>
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
              caption="Alle Buchungen nach Tag"
              variant="all"
              singleAccountBalance={!!filter.accountId}
              showTodayBalance={!!filter.accountId}
              upcoming={upcoming.model}
              {...(!isPhone || selecting ? { selection } : {})}
              sort={{ key: sortKey, direction, onSort }}
              onOpen={(booking) => { if (pending) return; if (isPhone && selecting) selection.toggle(booking.id); else setPanel({ mode: 'edit', booking }); }}
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
        <details className="kcsv-menu">
          <summary aria-label="Weitere Buchungsaktionen">⋯</summary>
          <Button variant="ghost" disabled={csvDisabled} onClick={() => void exportCsv()}>
            {csvBusy ? 'CSV wird vorbereitet …' : `Buchungen bis ${historyFilter.to.split('-').reverse().join('.')} als CSV`}
          </Button>
        </details>
        {csvError && <p role="alert">{csvError}</p>}
        <BookingSelectionBar ids={ids} pending={pending}
          categories={lookups.data?.categories ?? []} projects={lookups.data?.projects ?? []}
          onApply={(set, facts) => void runBulk({ ids: [...ids], set }, facts)}
          onClear={() => { if (!pending) setSelected(new Set()); }} outcome={outcome}
          extra={(facts) => <>
              <Button variant="ghost" disabled={pending || ids.length > 100} onClick={() => setEditIds([...ids])}>Mehrere bearbeiten</Button>
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
              <Button variant="ghost" size="sm" disabled={pending || !facts} onClick={() => setDeleteIds([...ids])}>
                Löschen …
              </Button>
          </>} />
      </div>
      {editIds && <FormDialog open title="Mehrere Buchungen bearbeiten" onClose={() => setEditIds(null)} beforeClose={() => !pending}>
        <BookingBulkEditPanel ids={editIds} pending={pending} onBusy={setEditPreviewBusy}
          onCancel={() => setEditIds(null)}
          onConfirm={async (preview) => {
            const result = await writes.protectedBulk.mutateAsync({ ids: preview.ids, set: preview.set, previewRevision: preview.revision });
            setOutcome({ action: 'update', result, submitted: preview.selection });
            bulkDone(result.changed); setEditIds(null);
          }} />
      </FormDialog>}
      {deleteIds && <FormDialog open title="Sammellöschen prüfen" onClose={() => { if (!pending) setDeleteIds(null); }} beforeClose={() => !pending}>
        <BookingDeletePreviewPanel ids={deleteIds} pending={pending} onCancel={() => setDeleteIds(null)} onConfirm={async (preview) => {
          await runBulk({ ids: [...preview.ids], remove: true, previewRevision: preview.revision }, preview.selection, true);
          setDeleteIds(null);
        }} />
      </FormDialog>}
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </PageFrame>
  );
}

function FilterRow({ search, setSearch, accounts, lookups, sortValue, onSortValue, pending, onSearchDraft }: {
  sortValue: string;
  onSortValue: (value: string) => void;
  search: BookingsSearch;
  setSearch: (patch: Partial<BookingsSearch>) => void;
  accounts: ReadonlyArray<AccountRow>;
  lookups: Lookups | undefined;
  pending: boolean;
  onSearchDraft: (value: string) => void;
}) {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const keys = activeFilterKeys(search);
  const [q, setQ] = useState(search.q ?? '');
  const [seenQ, setSeenQ] = useState(search.q);
  if (search.q !== seenQ) { setSeenQ(search.q); setQ(search.q ?? ''); }
  useEffect(() => { onSearchDraft(q); }, [q, onSearchDraft]);
  useEffect(() => {
    if (pending || q.trim() === (search.q ?? '')) return;
    const timer = setTimeout(() => setSearch({ q: q.trim() || undefined }), 250);
    return () => clearTimeout(timer);
    // URL updates use the latest write guard; a pending write cancels a queued search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, search.q, pending]);
  const reset = () => {
    const patch: Partial<BookingsSearch> = { basis: undefined };
    for (const key of keys) patch[key] = undefined;
    setSearch(patch);
  };
  return <>
    <div className="kfilter-search-row">
      <div className="kf kf-search"><Field label="In Buchungen suchen">{({ id }) => <TextInput
        id={id} type="search" value={q} placeholder="Empfänger, Notiz, Kategorie" autoComplete="off"
        disabled={pending} onChange={(event) => setQ(event.target.value)}
      />}</Field></div>
      <Button variant="ghost" disabled={pending} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Filter ▾{keys.length ? ` (${keys.length})` : ''}
      </Button>
    </div>
    {keys.length > 0 && <div className="kfilter-chips" role="group" aria-label="Aktive Filter">{keys.map((key) => {
      const label = filterChipLabel(key, search[key]!, accounts, lookups);
      return <Button key={key} variant="ghost" className="kfilter-chip" disabled={pending}
        aria-label={`${label} entfernen`} onClick={() => setSearch({ [key]: undefined })}>
        {label}<X size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>;
    })}</div>}
    <FormDialog open={open} title="Buchungen filtern" onClose={() => setOpen(false)}>
      <form className="bkform kfilter-live" onSubmit={(event) => event.preventDefault()}>
        <div className="bk-head"><h2>Buchungen filtern</h2></div>
        <div className="bk-body"><fieldset className="kbulk-readonly-surface kfilter" disabled={pending}>
          <legend className="sr-only">Sofort angewendete Filter</legend>
          <FilterControls {...{ search, setSearch, accounts, lookups, sortValue, onSortValue }} />
        </fieldset></div>
        <div className="bk-foot">
          <Button variant="ghost" disabled={pending || !keys.length} onClick={reset}>Filter zurücksetzen</Button>
          <Button onClick={() => setOpen(false)}>Schließen</Button>
        </div>
      </form>
    </FormDialog>
  </>;
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
          onChange={(kategorie) => setSearch({ kategorie, kategoriegruppe: undefined })}
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
