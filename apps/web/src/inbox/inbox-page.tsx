import { TaskSourceSummary } from './task-source-summary';
import { AccountReminderRows } from '../heute/account-reminders';
import {
  BankBookingMerge,
  BankCandidate,
  BankReview,
  type PreparedBankSuggestion,
} from './bank-candidate';
import { BankBulkActions, isBankInboxRow } from './bank-bulk-actions';
import { AssignmentLearnOffer, BookingAssignmentReview } from '../assignment/review';
import { PayslipIntakeDetail } from '../reports/payslip-intake';
import { InboxTypeIcon } from './type-icon';
import { ReadSourceDetail, sourceWarningReason } from './read-source-detail';
import { ReadSourceSummaries } from './read-source-summaries';
import { inboxCause, type InboxSegment } from '@budget/domain';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { InboxBack, type InboxSearch } from './navigation';
import {
  useAmountPrivacy,
  maskMoneyText,
  Button,
  Segmented,
  SectionHead,
  useToast,
} from '@budget/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { BookingPanel } from '../ledger/booking-panel';
import { longDay, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { useLedgerWrites } from '../ledger/mutations';
import { LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { PAGES } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  inboxPagesQuery,
  inboxDetailQuery,
  inboxQuery,
  INBOX_PAGE_SIZE,
  resolveInbox,
  readSourceMovementsQuery,
  type InboxEntry,
  type InboxEnvelope,
  type InboxKind,
  type InboxStored,
} from './api';
import './inbox.css';
import { ReceiptSection } from '../receipts/receipt-section';
import { TradePanel } from '../wealth/trade-panel';
import type { SavingsExecutionProposal } from '../wealth/savings-api';
const META = PAGES.find((p) => p.path === '/konten/pruefen')!;
// Overspent categories are not part of Prüfen (Heute › Zu tun and Plan show them).
const LABELS: Record<Exclude<InboxKind, 'overspent'>, string> = {
  uncategorized: 'Buchungen ohne Kategorie',
  revision: 'Vorschläge',
  import: 'Datenprüfung',
  stale_value: 'Veraltete Werte',
  consent: 'Einwilligungen',
  expected_payment: 'Wiederkehrende Zahlungen',
  receivable: 'Kontakte',
  reconciliation: 'Kontoprüfung',
  backup: 'Sicherung',
  other: 'Weitere Aufgaben',
};

export function InboxPage() {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as InboxSearch;
  return (
    <PageFrame meta={META}>
      {search.von && <InboxBack to={search.von} label="Zurück zur vorherigen Ansicht" />}
      <BankStatusBlock />
      {search.bankSource && (
        <p>
          Aufgaben dieser Bankquelle.{' '}
          <AppLink
            to="/konten/pruefen"
            search={{
              ...(search.aufgaben && { aufgaben: search.aufgaben }),
              ...(search.von && { von: search.von }),
            }}
          >
            Alle Aufgaben anzeigen
          </AppLink>
        </p>
      )}
      <InboxWorkflow bankSource={search.bankSource} />
    </PageFrame>
  );
}

type BankStatus = {
  configured: boolean;
  connections: { status: string; lastSuccessAt: string | null }[];
};

function BankStatusBlock() {
  const query = useQuery({
    queryKey: ['bank-sync'],
    queryFn: () => request<BankStatus>('GET', '/api/bank-sync'),
    refetchInterval: 30_000,
  });
  const connected = query.data?.connections.some((connection) => connection.status === 'active');
  const lastSuccessAt = query.data?.connections
    .filter((connection) => connection.status === 'active' && connection.lastSuccessAt)
    .reduce<string | null>(
      (latest, connection) =>
        connection.lastSuccessAt && (!latest || connection.lastSuccessAt > latest)
          ? connection.lastSuccessAt
          : latest,
      null,
    );
  const lastSuccess = lastSuccessAt
    ? new Intl.DateTimeFormat('de-AT', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Vienna',
      }).format(new Date(lastSuccessAt))
    : null;

  return (
    <section className="inbox-bank-status" aria-label="Bankstatus" aria-busy={query.isPending}>
      {query.isPending ? (
        <LoadingNote what="Bankstatus" />
      ) : query.isError ? (
        <ErrorNote what="Bankstatus" error={query.error} onRetry={() => void query.refetch()} />
      ) : connected ? (
        <p>Bank: verbunden · zuletzt {lastSuccess ?? 'noch kein erfolgreicher Abruf'}</p>
      ) : (
        <>
          <p>Bank: nicht verbunden</p>
          <AppLink className="btn btn-ghost" to="/einstellungen/datenquellen" search={{}}>
            Einrichten
          </AppLink>
        </>
      )}
    </section>
  );
}
export function InboxDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as InboxSearch;
  const query = useQuery(inboxDetailQuery(id));
  const params = new URLSearchParams(
    Object.entries(search).filter((p): p is [string, string] => p[1] !== undefined),
  );
  return (
    <PageFrame meta={META} title={query.data?.entry.title ?? 'Datenwarnung'}>
      <section className="kinbox">
        <nav aria-label="Brotkrumen">
          <AppLink to="/konten" search={{}}>
            Konten
          </AppLink>
          {' › '}
          <AppLink to="/konten/pruefen" search={search}>
            Prüfen
          </AppLink>
          {' › '}
          <span aria-current="page">Datenwarnung</span>
        </nav>
        <InboxBack to={`/konten/pruefen?${params}`} label="Zurück zu Prüfen" />
        {query.isPending && <LoadingNote what="Datenwarnung" />}
        {query.isError && (
          <ErrorNote
            what="Datenwarnung (möglicherweise bereits erledigt)"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {query.data && !query.isError && <InboxWorkflow detailEntry={query.data.entry} />}
      </section>
    </PageFrame>
  );
}
/** Shared queue/actions on the inbox page, warning detail and month close. */
export function InboxWorkflow({
  entryIds,
  detailEntry,
  bankSource,
  bankAccountId,
  readSource,
}: {
  entryIds?: string[] | undefined;
  detailEntry?: InboxStored | undefined;
  bankSource?: string | undefined;
  bankAccountId?: string | undefined;
  readSource?: string | undefined;
}) {
  useAmountPrivacy();
  const [editing, setEditing] = useState<ListedBooking | null>(null);
  const [proposal, setProposal] = useState<SavingsExecutionProposal | null>(null);
  const proposalTrigger = useRef<HTMLElement | null>(null);
  const closeProposal = () => {
    setProposal(null);
    requestAnimationFrame(() => proposalTrigger.current?.focus());
  };
  const trigger = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const edit = async (id: string) => {
    if (loading) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLoading(id);
    try {
      const { booking } = await request<{ booking: ListedBooking }>(
        'GET',
        `/api/bookings/${encodeURIComponent(id)}`,
      );
      setEditing(booking);
    } catch (error) {
      toast.show({ message: errorText(error) });
      void qc.invalidateQueries({ queryKey: LEDGER_KEY });
    } finally {
      setLoading(null);
    }
  };
  const body = (
    <InboxBody
      entryIds={entryIds}
      detailEntry={detailEntry}
      bankSource={bankSource}
      bankAccountId={bankAccountId}
      readSource={readSource}
      onEdit={(id) => void edit(id)}
      loadingId={loading}
      onSavings={(item) => {
        proposalTrigger.current = document.activeElement as HTMLElement;
        setProposal(item);
      }}
    />
  );
  return (
    <>
      {body}
      <BookingPanel
        state={editing ? { mode: 'edit', booking: editing } : null}
        onClose={() => {
          setEditing(null);
          requestAnimationFrame(() => trigger.current?.focus());
        }}
      />
      {proposal && (
        <TradePanel id="neu" proposal={proposal} onClose={closeProposal} onSaved={closeProposal} />
      )}
    </>
  );
}

function InboxBody({
  entryIds,
  detailEntry,
  bankSource,
  bankAccountId,
  readSource,
  onEdit,
  loadingId,
  onSavings,
}: {
  entryIds?: string[] | undefined;
  detailEntry?: InboxStored | undefined;
  bankSource?: string | undefined;
  bankAccountId?: string | undefined;
  readSource?: string | undefined;
  onEdit: (id: string) => void;
  loadingId: string | null;
  onSavings: (proposal: SavingsExecutionProposal) => void;
}) {
  if (bankAccountId)
    return (
      <AccountBankInboxBody
        accountId={bankAccountId}
        onEdit={onEdit}
        loadingId={loadingId}
        onSavings={onSavings}
      />
    );
  if (readSource)
    return (
      <ReadSourceMovementsBody
        sourceId={readSource}
        onEdit={onEdit}
        loadingId={loadingId}
        onSavings={onSavings}
      />
    );
  if (detailEntry)
    return (
      <InboxBodyContent
        entries={[detailEntry]}
        count={undefined}
        totalEntries={1}
        countsByKind={undefined}
        pending={false}
        error={null}
        onRetry={() => undefined}
        showReceipts={false}
        serverPaginated={false}
        hasMore={false}
        loadingMore={false}
        loadMore={() => undefined}
        onEdit={onEdit}
        loadingId={loadingId}
        onSavings={onSavings}
        detailView
      />
    );
  if (entryIds)
    return (
      <FilteredInboxBody
        entryIds={entryIds}
        bankSource={bankSource}
        onEdit={onEdit}
        loadingId={loadingId}
        onSavings={onSavings}
      />
    );
  return (
    <PaginatedInboxBody
      bankSource={bankSource}
      onEdit={onEdit}
      loadingId={loadingId}
      onSavings={onSavings}
    />
  );
}

type InboxBodyProps = {
  onEdit: (id: string) => void;
  loadingId: string | null;
  onSavings: (proposal: SavingsExecutionProposal) => void;
};

/** A separate account-keyed queue; account navigation never changes global Prüfen filters. */
function AccountBankInboxBody({ accountId, ...props }: InboxBodyProps & { accountId: string }) {
  const queue = useInfiniteQuery(
    inboxPagesQuery('all', undefined, 'newest', undefined, 'umsaetze', undefined, accountId),
  );
  const loadingMore = useRef(false);
  const loadMore = async () => {
    if (loadingMore.current || queue.isFetching || !queue.hasNextPage) return;
    loadingMore.current = true;
    try {
      await queue.fetchNextPage();
    } finally {
      loadingMore.current = false;
    }
  };
  const failed = queue.isError && !queue.isFetchNextPageError;
  const pages = failed ? [] : (queue.data?.pages ?? []);
  const firstPage = pages[0];
  return (
    <InboxBodyContent
      {...props}
      entries={pages.flatMap((page) => page.entries)}
      count={firstPage?.count}
      totalEntries={firstPage?.totalEntries}
      countsByKind={firstPage?.countsByKind}
      countsByCause={firstPage?.countsByCause}
      pending={queue.isPending}
      error={failed ? queue.error : null}
      nextPageError={queue.isFetchNextPageError ? queue.error : null}
      onRetry={() => void queue.refetch()}
      onRetryNextPage={() => void loadMore()}
      showReceipts={false}
      serverPaginated
      accountScoped
      hasMore={queue.hasNextPage}
      loadingMore={queue.isFetching}
      loadMore={() => void loadMore()}
    />
  );
}

function ReadSourceMovementsBody({ sourceId, ...props }: InboxBodyProps & { sourceId: string }) {
  const [title, setTitle] = useState('');
  const queue = useInfiniteQuery(readSourceMovementsQuery(sourceId, title));
  const firstPage = queue.data?.pages[0];
  const entries = queue.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <>
      <div className="inbox-filters">
        <label>
          Bewegungen nach Titel
          <select className="select" value={title} onChange={(e) => setTitle(e.target.value)}>
            <option value="">Alle Titel</option>
            {Object.entries(firstPage?.countsByTitle ?? {}).map(([name, count]) => (
              <option key={name} value={name}>
                {name} · {count}
              </option>
            ))}
          </select>
        </label>
      </div>
      <InboxBodyContent
        {...props}
        entries={entries}
        count={firstPage?.count}
        totalEntries={firstPage?.totalEntries}
        countsByKind={undefined}
        countsByCause={firstPage?.countsByTitle}
        groupByTitle
        pending={queue.isPending}
        error={queue.isError && !queue.isFetchNextPageError ? queue.error : null}
        nextPageError={queue.isFetchNextPageError ? queue.error : null}
        onRetry={() => void queue.refetch()}
        onRetryNextPage={() => void queue.fetchNextPage()}
        showReceipts={false}
        serverPaginated
        hasMore={queue.hasNextPage}
        loadingMore={queue.isFetching}
        loadMore={() => {
          if (!queue.isFetching) void queue.fetchNextPage();
        }}
      />
    </>
  );
}

function FilteredInboxBody({
  entryIds,
  bankSource,
  ...props
}: InboxBodyProps & { entryIds?: string[] | undefined; bankSource?: string | undefined }) {
  useAmountPrivacy();
  const queue = useQuery(inboxQuery(bankSource));
  const entries =
    queue.data?.entries.filter((item) => !entryIds || entryIds.includes(item.id)) ?? [];
  const countsByKind = entries.reduce<Partial<Record<InboxKind, number>>>((counts, item) => {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
    return counts;
  }, {});
  return (
    <InboxBodyContent
      {...props}
      entries={entries}
      count={queue.data ? entries.length : undefined}
      totalEntries={entries.length}
      countsByKind={countsByKind}
      pending={queue.isPending}
      error={queue.isError ? queue.error : null}
      onRetry={() => void queue.refetch()}
      showReceipts={false}
      serverPaginated={false}
      hasMore={false}
      loadingMore={false}
      loadMore={() => undefined}
    />
  );
}

function PaginatedInboxBody({
  bankSource,
  ...props
}: InboxBodyProps & { bankSource?: string | undefined }) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as InboxSearch;
  const navigate = useNavigate();
  // `auto` lets the server open on the part with open work; the part then stays put while the
  // user works through it, even when it empties.
  const [pinned, setPinned] = useState<InboxSegment>();
  const [taskSource, setTaskSource] = useState<
    'accounts' | 'plan' | 'receipts' | 'payslips' | 'other'
  >();
  const queue = useInfiniteQuery(
    inboxPagesQuery(
      search.aufgaben,
      bankSource,
      bankSource ? (search.dateSort ?? 'newest') : undefined,
      bankSource ? search.fromDate : undefined,
      search.teil ?? 'auto',
      pinned,
      undefined,
      !bankSource &&
        (search.teil === 'aufgaben' || (!search.teil && pinned === 'aufgaben')) &&
        (taskSource === 'plan' || taskSource === 'payslips' || taskSource === 'other')
        ? taskSource
        : undefined,
    ),
  );
  const loadingNextPage = useRef(false);
  const fetchNextPage = async () => {
    if (loadingNextPage.current || queue.isFetching || !queue.hasNextPage) return;
    loadingNextPage.current = true;
    try {
      await queue.fetchNextPage();
    } finally {
      loadingNextPage.current = false;
    }
  };
  const pages = queue.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const firstPage = pages[0];
  const shown = search.teil ?? firstPage?.segment;
  const resolved = firstPage?.segment;
  if (!search.teil && !pinned && resolved) setPinned(resolved);
  const segmentCounts =
    !bankSource && firstPage?.segments && shown ? { shown, counts: firstPage.segments } : undefined;
  return (
    <>
      {segmentCounts && (
        <Segmented<InboxSegment>
          className="inbox-segments"
          label="Teil von Prüfen"
          stretch
          value={segmentCounts.shown}
          options={[
            { value: 'umsaetze', label: `Umsätze · ${segmentCounts.counts.umsaetze}` },
            { value: 'aufgaben', label: `Aufgaben · ${segmentCounts.counts.aufgaben}` },
          ]}
          onChange={(teil) =>
            void navigate({
              to: '/konten/pruefen',
              search: { ...search, teil, gruppe: undefined },
            } as never)
          }
        />
      )}
      <div className="inbox-filters">
        {bankSource && (
          <>
            <label>
              Datumssortierung
              <select
                className="select"
                value={search.dateSort ?? 'newest'}
                onChange={(event) =>
                  void navigate({
                    to: '.',
                    search: { ...search, dateSort: event.target.value, gruppe: undefined },
                    replace: true,
                  } as never)
                }
              >
                <option value="newest">Neueste zuerst</option>
                <option value="oldest">Älteste zuerst</option>
              </select>
            </label>
            <label>
              Ab Datum
              <input
                className="input"
                type="date"
                value={search.fromDate ?? ''}
                onChange={(event) =>
                  void navigate({
                    to: '.',
                    search: {
                      ...search,
                      fromDate: event.target.value || undefined,
                      gruppe: undefined,
                    },
                    replace: true,
                  } as never)
                }
              />
            </label>
          </>
        )}
        <label>
          Zeitraum der Aufgaben
          <select
            className="select"
            value={search.aufgaben ?? 'all'}
            onChange={(event) =>
              void navigate({
                to: '/konten/pruefen',
                search: {
                  ...search,
                  aufgaben: event.target.value === 'all' ? undefined : event.target.value,
                  gruppe: undefined,
                },
              } as never)
            }
          >
            <option value="all">Alle</option>
            <option value="current">Aktueller Monat</option>
            <option value="historical">Historische Nacharbeit</option>
          </select>
        </label>
        <p>
          {firstPage
            ? `Aktuell: ab ${longDay(`${firstPage.asOf.slice(0, 7)}-01`)} · Historisch: davor`
            : 'Zeitraum wird geladen.'}
        </p>
      </div>
      {segmentCounts?.shown === 'aufgaben' && firstPage?.taskSources && (
        <section aria-label="Aufgaben nach Quelle">
          {queue.isError && (
            <ErrorNote what="Aufgaben" error={queue.error} onRetry={() => void queue.refetch()} />
          )}
          {firstPage.readSourceSummaries && (
            <ReadSourceSummaries summaries={firstPage.readSourceSummaries} />
          )}
          <h2>Offene Aufgaben · {segmentCounts.counts.aufgaben}</h2>
          <p>
            Die Zahlen zählen alle offenen Aufgaben, nicht die Gruppenzeilen. Der Zeitraum filtert
            die Einträge in Plan, Gehaltszettel und Weitere Aufgaben; fällige Kontoprüfungen und
            offene Belege bleiben sichtbar.
          </p>
          <TaskSourceSummary
            counts={firstPage.taskSources}
            selected={taskSource}
            onSelect={setTaskSource}
          />
          {taskSource === 'accounts' && (
            <AccountReminderRows items={firstPage.accountReminders ?? []} />
          )}
          {taskSource === 'receipts' && <ReceiptSection />}
        </section>
      )}
      {(segmentCounts?.shown !== 'aufgaben' ||
        !firstPage?.taskSources ||
        taskSource === 'plan' ||
        taskSource === 'payslips' ||
        taskSource === 'other') && (
        <InboxBodyContent
          {...props}
          entries={entries}
          count={firstPage?.count}
          segmentCounts={segmentCounts}
          readSourceSummaries={
            segmentCounts?.shown === 'umsaetze' || firstPage?.taskSources
              ? undefined
              : firstPage?.readSourceSummaries
          }
          totalEntries={firstPage?.totalEntries}
          countsByKind={firstPage?.countsByKind}
          countsByCause={firstPage?.countsByCause}
          pending={queue.isPending}
          error={queue.isError && !queue.isFetchNextPageError ? queue.error : null}
          nextPageError={queue.isFetchNextPageError ? queue.error : null}
          onRetry={() => void queue.refetch()}
          onRetryNextPage={() => void fetchNextPage()}
          showReceipts={
            !bankSource && segmentCounts?.shown !== 'umsaetze' && !firstPage?.taskSources
          }
          serverPaginated
          hasMore={queue.hasNextPage}
          loadingMore={queue.isFetching}
          loadMore={() => void fetchNextPage()}
        />
      )}
    </>
  );
}

/** Overspent categories are no Prüfen work, even if an old or mocked response still carries them. */
type TaskEntry = Exclude<InboxEntry, InboxEnvelope>;

function InboxBodyContent({
  entries: received,
  count,
  totalEntries,
  countsByKind,
  countsByCause,
  segmentCounts,
  detailView = false,
  groupByTitle = false,
  accountScoped = false,
  readSourceSummaries,
  pending,
  error,
  nextPageError,
  onRetry,
  onRetryNextPage,
  showReceipts,
  serverPaginated,
  hasMore,
  loadingMore,
  loadMore,
  onEdit,
  loadingId,
  onSavings,
}: InboxBodyProps & {
  entries: InboxEntry[];
  count: number | undefined;
  totalEntries: number | undefined;
  countsByKind: Partial<Record<InboxKind, number>> | undefined;
  countsByCause?: Record<string, number> | undefined;
  /** Konten › Prüfen: open work per part and the part shown. */
  segmentCounts?: { shown: InboxSegment; counts: Record<InboxSegment, number> } | undefined;
  detailView?: boolean;
  groupByTitle?: boolean;
  accountScoped?: boolean;
  readSourceSummaries?: { sourceId: string | null; name: string; count: number }[] | undefined;
  pending: boolean;
  error: Error | null;
  nextPageError?: Error | null;
  onRetry: () => void;
  onRetryNextPage?: () => void;
  showReceipts: boolean;
  serverPaginated: boolean;
  hasMore: boolean | undefined;
  loadingMore: boolean;
  loadMore: () => void;
}) {
  useAmountPrivacy();
  const entries = received.filter((entry): entry is TaskEntry => entry.type !== 'envelope');
  const headingId = useId();
  const routeSearch = useSearch({ strict: false }) as InboxSearch;
  const search: Partial<InboxSearch> = accountScoped ? {} : routeSearch;
  const navigate = useNavigate();
  const writes = useLedgerWrites();
  const write = useBudgetWrite();
  const [busy, setBusy] = useState<string | null>(null);
  const [learnBookingId, setLearnBookingId] = useState<string | null>(null);
  const [shown, setShown] = useState(INBOX_PAGE_SIZE);
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<Set<string>>(new Set());
  const preparedBank = useRef(new Map<string, PreparedBankSuggestion | undefined>());
  const prepareBank = useCallback((id: string, suggestion: PreparedBankSuggestion | undefined) => {
    preparedBank.current.set(id, suggestion);
  }, []);
  const resolve = async (item: InboxStored) => {
    if (busy) return;
    setBusy(item.id);
    await write(
      () => resolveInbox(item.id),
      () => 'Aufgabe als erledigt markiert.',
    );
    setBusy(null);
  };
  const groups: (Exclude<InboxKind, 'overspent'> | null)[] =
    accountScoped || search.bankSource || groupByTitle
      ? [null]
      : (Object.keys(LABELS) as Exclude<InboxKind, 'overspent'>[]);
  let room = serverPaginated ? entries.length : shown;
  const canLoadMore = serverPaginated ? Boolean(hasMore) : entries.length > shown;
  const remaining = serverPaginated
    ? Math.max((totalEntries ?? entries.length) - entries.length, 0)
    : entries.length - shown;
  if (
    accountScoped &&
    !pending &&
    !error &&
    !nextPageError &&
    count === 0 &&
    entries.length === 0 &&
    !learnBookingId
  )
    return null;
  return (
    <section className="kinbox" aria-labelledby={headingId}>
      <SectionHead
        id={headingId}
        title={
          accountScoped
            ? 'Bankumsätze prüfen'
            : groupByTitle
              ? 'Bewegungen zu prüfen'
              : 'Offene Entscheidungen'
        }
        aside={
          segmentCounts
            ? `${segmentCounts.counts[segmentCounts.shown]} offen`
            : count !== undefined
              ? `${count} offen`
              : undefined
        }
      />
      {pending && <LoadingNote what="Aufgaben" />}
      {learnBookingId && <AssignmentLearnOffer bookingId={learnBookingId} />}
      {error && <ErrorNote what="Aufgaben" error={error} onRetry={onRetry} />}
      {!pending && !error && readSourceSummaries && (
        <ReadSourceSummaries summaries={readSourceSummaries} />
      )}
      {count === 0 && (
        <EmptyNote>
          {accountScoped
            ? 'Keine offenen Bankumsätze für dieses Konto.'
            : groupByTitle
              ? 'Keine offenen Bewegungen vorhanden.'
              : readSourceSummaries?.length
                ? 'Keine offenen Entscheidungen vorhanden.'
                : 'Prüfen leer. Es sind keine offenen Aufgaben vorhanden.'}
        </EmptyNote>
      )}
      {!pending && !error && count !== 0 && entries.length === 0 && (
        <EmptyNote>
          {segmentCounts && segmentCounts.counts[segmentCounts.shown] === 0
            ? segmentCounts.shown === 'umsaetze'
              ? 'Keine offenen Umsätze.'
              : 'Keine offenen Aufgaben.'
            : 'Keine offenen Aufgaben in diesem Zeitraum.'}
        </EmptyNote>
      )}
      {entries.length > 0 && (
        <>
          {search.bankSource && (
            <BankBulkActions
              rows={entries.filter(isBankInboxRow)}
              selected={selectedBank}
              onSelect={setSelectedBank}
              prepared={(id) => preparedBank.current.get(id)}
              sourceId={search.bankSource}
            />
          )}
          <table className="rev-table kinbox-table">
            <caption className="sr-only">
              {accountScoped
                ? 'Offene Bankumsätze dieses Kontos'
                : 'Offene Entscheidungen nach Typ'}
            </caption>
            <thead>
              <tr>
                <th className="tech" scope="col" colSpan={2}>
                  Aufgabe
                </th>
                <th className="tech rev-act" scope="col">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((kind) => {
                const all = kind ? entries.filter((item) => item.kind === kind) : entries;
                if (!all.length || (!serverPaginated && room <= 0)) return [];
                const items = all.slice(0, room);
                room -= items.length;
                return [
                  <tr className="kgroup" key={kind ?? 'bank-source'}>
                    <td className="rev-mark" />
                    <th scope="rowgroup" colSpan={2}>
                      {kind
                        ? LABELS[kind]
                        : accountScoped
                          ? 'Bankumsätze dieses Kontos'
                          : groupByTitle
                            ? 'Quellbewegungen'
                            : 'Aufgaben dieser Bankquelle'}{' '}
                      <span className="kgcount">
                        {kind ? (countsByKind?.[kind] ?? all.length) : (totalEntries ?? all.length)}
                      </span>
                    </th>
                  </tr>,
                  ...items.flatMap((item) => {
                    const causeOf = (entry: InboxEntry) =>
                      groupByTitle && entry.type === 'stored' ? entry.title : inboxCause(entry);
                    const cause = !serverPaginated || detailView ? null : causeOf(item);
                    const members = cause
                      ? items.filter((member) => causeOf(member) === cause)
                      : [item];
                    const total = cause ? (countsByCause?.[cause] ?? members.length) : 1;
                    if ((total > 1 || groupByTitle) && members[0]?.id !== item.id) return [];
                    const expanded =
                      groupByTitle || accountScoped
                        ? expandedTitle === cause
                        : search.gruppe === item.id;
                    const group =
                      total > 1 || groupByTitle ? (
                        <tr className="inbox-cause" key={`cause-${item.id}`}>
                          <td />
                          <td colSpan={2}>
                            <Button
                              variant="ghost"
                              aria-expanded={expanded}
                              onClick={() =>
                                groupByTitle || accountScoped
                                  ? setExpandedTitle(expanded ? null : cause)
                                  : void navigate({
                                      to: '.',
                                      search: { ...search, gruppe: expanded ? undefined : item.id },
                                      replace: true,
                                    } as never)
                              }
                            >
                              {item.type === 'stored'
                                ? groupByTitle
                                  ? item.title
                                  : `${item.title} · ${maskMoneyText(sourceWarningReason(item.detail))}`
                                : 'Datenprüfung'}{' '}
                              · {total} Aufgaben ·{' '}
                              {expanded ? 'Einzelpunkte ausblenden' : 'Einzelpunkte anzeigen'}
                            </Button>
                            {members.length < total && (
                              <p>
                                {members.length} von {total} geladen · Weitere anzeigen lädt die
                                nächsten Einzelpunkte.
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : null;
                    return [
                      group,
                      ...((total > 1 || groupByTitle) && !expanded
                        ? []
                        : members.map((item) => (
                            <InboxRow
                              key={item.id}
                              item={item}
                              bankSelected={selectedBank.has(item.id)}
                              onBankSelect={
                                // Bulk actions need the source whose queue is shown.
                                search.bankSource
                                  ? (checked) =>
                                      setSelectedBank((current) => {
                                        const next = new Set(current);
                                        if (checked && next.size < 100) next.add(item.id);
                                        else next.delete(item.id);
                                        return next;
                                      })
                                  : undefined
                              }
                              onBankPrepare={prepareBank}
                              detailView={detailView || groupByTitle}
                              onBankConfirmed={setLearnBookingId}
                              busy={
                                busy === item.id ||
                                (loadingId !== null &&
                                  item.type === 'booking' &&
                                  loadingId === item.bookingId)
                              }
                              onEdit={onEdit}
                              onSavings={onSavings}
                              onResolve={() => {
                                if (item.type === 'stored') void resolve(item);
                              }}
                              onConfirm={(id) =>
                                writes.patch.mutate({ id, patch: { status: 'confirmed' } })
                              }
                              confirming={writes.patch.isPending}
                            />
                          ))),
                    ];
                  }),
                ];
              })}
            </tbody>
          </table>
          {nextPageError && onRetryNextPage && (
            <ErrorNote what="weitere Aufgaben" error={nextPageError} onRetry={onRetryNextPage} />
          )}
          {canLoadMore && (
            <Button
              variant="ghost"
              className="inbox-more"
              disabled={loadingMore}
              onClick={() => {
                if (loadingMore) return;
                if (serverPaginated) loadMore();
                else setShown((rows) => rows + INBOX_PAGE_SIZE);
              }}
            >
              Weitere anzeigen ({remaining} von {totalEntries ?? entries.length} noch verborgen)
            </Button>
          )}
          <p className="inbox-hint">
            Eine Warnung nur als erledigt markieren, wenn ihre Ursache geklärt ist. Das Markieren
            ändert keine Buchung und repariert keine Datenquelle.
          </p>
        </>
      )}
      {showReceipts && (
        <>
          <ReceiptSection />
        </>
      )}
    </section>
  );
}

function InboxRow({
  bankSelected,
  onBankSelect,
  onBankPrepare,
  detailView = false,
  onBankConfirmed,
  item,
  busy,
  onEdit,
  onSavings,
  onResolve,
  onConfirm,
  confirming,
}: {
  bankSelected: boolean;
  onBankSelect: ((checked: boolean) => void) | undefined;
  onBankPrepare: (id: string, suggestion: PreparedBankSuggestion | undefined) => void;
  detailView?: boolean;
  onBankConfirmed: (id: string) => void;
  item: TaskEntry;
  busy: boolean;
  onEdit: (id: string) => void;
  onSavings: (proposal: SavingsExecutionProposal) => void;
  onResolve: () => void;
  onConfirm: (id: string) => void;
  confirming: boolean;
}) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as InboxSearch;
  if (isBankInboxRow(item))
    return (
      <BankInboxRow
        item={item}
        selected={bankSelected}
        onSelect={onBankSelect}
        onPrepared={onBankPrepare}
        onConfirmed={onBankConfirmed}
        onEdit={onEdit}
        onConfirm={onConfirm}
        onResolve={onResolve}
        busy={busy || confirming}
      />
    );
  return (
    <tr className={`rev-row${item.urgent ? ' is-urgent' : ''}`} data-testid="inbox-row">
      <td className="rev-mark">
        <InboxTypeIcon entry={item} />
      </td>
      <td className="rev-what">
        <strong>
          {item.type === 'booking'
            ? `${item.payeeName ?? 'Buchung ohne Empfänger'} · ${nativeCurrency(item.amountCents, item.currency)}`
            : item.type === 'savings'
              ? `Sparplan: ${item.securityName} · ${nativeCurrency(item.amountCents, item.currency)}`
              : item.title}
        </strong>
        {item.type === 'stored' && item.kind === 'import' && !detailView ? (
          <span>
            {longDay(item.createdAt.slice(0, 10))} ·{' '}
            {maskMoneyText(sourceWarningReason(item.detail))}
          </span>
        ) : item.type === 'stored' && item.refType === 'read_source' ? (
          <ReadSourceDetail detail={item.detail} />
        ) : (
          <span>
            {item.type === 'booking'
              ? `${longDay(item.date)} · ${item.accountName} · ${item.missingSplits} ${item.missingSplits === 1 ? 'Anteil' : 'Anteile'} ohne Kategorie${item.status === 'pending' ? ' · vorgemerkt' : ''}${item.memo ? ` · ${item.memo}` : ''}`
              : item.type === 'savings'
                ? `${longDay(item.date)} · ${item.accountName} · Ausführung anhand der Abrechnung prüfen`
                : maskMoneyText(item.detail ?? '')}
          </span>
        )}
        {item.type === 'booking' && item.status !== 'reconciled' && (
          <BookingAssignmentReview
            id={item.bookingId}
            onApplied={(canLearn) => {
              if (canLearn) onBankConfirmed(item.bookingId);
            }}
          />
        )}
        {item.type === 'stored' && item.refType === 'payslip-intake' && item.refId && (
          <PayslipIntakeDetail id={item.refId} />
        )}
      </td>
      <td className="rev-act kact">
        {item.type === 'booking' ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onEdit(item.bookingId)}
            >
              Zuordnen
            </Button>
            {item.status === 'pending' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={confirming}
                onClick={() => onConfirm(item.bookingId)}
              >
                Bestätigen
              </Button>
            )}
            {item.status === 'pending' && item.source === 'bank' && (
              <BankBookingMerge bookingId={item.bookingId} />
            )}
          </>
        ) : item.type === 'savings' ? (
          <Button variant="ghost" onClick={() => onSavings(item)}>
            Ausführung prüfen
          </Button>
        ) : item.refType === 'payslip-intake' && item.refId ? (
          <AppLink className="btn btn-ghost btn-sm" to="/reports/gehalt">
            Gehaltsreport
          </AppLink>
        ) : (
          <>
            {item.refType === 'bank-sync-candidate' && item.refId && (
              <BankCandidate id={item.refId} onConfirmed={onBankConfirmed} />
            )}
            {item.kind === 'import' && !detailView && (
              <AppLink
                className="btn btn-ghost btn-sm"
                to={`/konten/pruefen/${encodeURIComponent(item.id)}`}
                search={search}
                state={{ inboxOpenedInApp: true }}
              >
                Warnung erklären
              </AppLink>
            )}
            <SourceLink item={item} />
            <Button size="sm" variant="ghost" disabled={busy} onClick={onResolve}>
              {item.refType === 'bank-sync-candidate'
                ? 'Nicht übernehmen'
                : 'Als erledigt markieren'}
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

function BankInboxRow({
  item,
  selected,
  onSelect,
  onPrepared,
  onConfirmed,
  onEdit,
  onConfirm,
  onResolve,
  busy,
}: {
  item: TaskEntry;
  selected: boolean;
  onSelect: ((checked: boolean) => void) | undefined;
  onPrepared: (id: string, suggestion: PreparedBankSuggestion | undefined) => void;
  onConfirmed: (id: string) => void;
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
  onResolve: () => void;
  busy: boolean;
}) {
  useAmountPrivacy();
  const [merge, setMerge] = useState<PreparedBankSuggestion>();
  const [rule, setRule] = useState<PreparedBankSuggestion>();
  const prepared = merge ?? rule;
  const prepareCandidate = useCallback(
    (suggestion: PreparedBankSuggestion | undefined) => onPrepared(item.id, suggestion),
    [onPrepared, item.id],
  );
  const prepareRule = useCallback(
    (
      suggestion: Parameters<
        NonNullable<ComponentProps<typeof BookingAssignmentReview>['onPrepared']>
      >[0],
    ) =>
      setRule(
        suggestion
          ? {
              action: 'rule',
              ruleId: suggestion.id,
              revision: suggestion.revision,
              label: suggestion.name,
            }
          : undefined,
      ),
    [],
  );
  // Candidate preparation is reported by its form; booking preparation combines merge/rule paths.
  useEffect(() => {
    if (item.type === 'booking') onPrepared(item.id, prepared);
  }, [item.type, item.id, onPrepared, prepared]);
  const data =
    item.type === 'booking' ? item : item.type === 'stored' ? item.bankCandidate : undefined;
  return (
    <tr className="rev-row bank-inbox-row" data-testid="inbox-row">
      <td className="rev-mark">
        <InboxTypeIcon entry={item} />
        {onSelect && (
          <label className="bank-select">
            <input
              type="checkbox"
              checked={selected}
              disabled={busy}
              aria-label={`Bankzeile auswählen: ${data?.payeeName ?? data?.memo ?? item.id}`}
              onChange={(event) => onSelect(event.target.checked)}
            />
          </label>
        )}
      </td>
      <td className="rev-what">
        <strong>
          {data
            ? `${data.payeeName || data.memo || 'Bankumsatz'} · ${nativeCurrency(data.amountCents, data.currency)}`
            : item.type === 'stored'
              ? item.title
              : 'Bankumsatz'}
        </strong>
        <span>
          {data
            ? `${longDay(data.date)} · ${data.accountName}${data.memo && data.memo !== data.payeeName ? ` · ${data.memo}` : ''}`
            : item.type === 'stored'
              ? maskMoneyText(item.detail ?? '')
              : ''}
        </span>
      </td>
      <td className="rev-act kact">
        {item.type === 'stored' && item.refId ? (
          <>
            <BankCandidate
              id={item.refId}
              onConfirmed={onConfirmed}
              onPrepared={prepareCandidate}
            />
            <Button size="sm" variant="ghost" disabled={busy} onClick={onResolve}>
              Nicht übernehmen
            </Button>
          </>
        ) : item.type === 'booking' ? (
          <BankReview suggestion={prepared}>
            <BookingAssignmentReview
              id={item.bookingId}
              onPrepared={prepareRule}
              onApplied={(canLearn) => {
                if (canLearn) onConfirmed(item.bookingId);
              }}
            />
            {item.status === 'pending' && (
              <BankBookingMerge bookingId={item.bookingId} onPrepared={setMerge} />
            )}
            <Button variant="ghost" disabled={busy} onClick={() => onEdit(item.bookingId)}>
              Zuordnen
            </Button>
            {item.status === 'pending' && (
              <Button variant="ghost" disabled={busy} onClick={() => onConfirm(item.bookingId)}>
                Bestätigen
              </Button>
            )}
          </BankReview>
        ) : null}
      </td>
    </tr>
  );
}

/** Offer only connected repair views; unknown/legacy references stay readable without inert links. */
function SourceLink({ item }: { item: InboxStored }) {
  useAmountPrivacy();
  if (
    item.refType === 'bank-sync' &&
    item.refId &&
    item.kind === 'reconciliation' &&
    item.id.startsWith('bank-balance:')
  )
    return (
      <AppLink className="btn btn-ghost btn-sm" to={`/konten/${encodeURIComponent(item.refId)}`}>
        Kontostand prüfen
      </AppLink>
    );
  if (
    item.refType === 'read_source' ||
    item.refType === 'bank-sync' ||
    item.refType === 'payslip-source'
  )
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/einstellungen/datenquellen">
        Datenquelle prüfen
      </AppLink>
    );
  if (item.refType === 'category')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/plan/monat">
        Im Plan prüfen
      </AppLink>
    );
  if (item.refType === 'expected_payment')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/plan/erwartet">
        Wiederkehrende Zahlung prüfen
      </AppLink>
    );
  if (item.refType === 'encrypted_backup')
    return (
      <AppLink className="btn btn-ghost btn-sm" to="/einstellungen/sicherheit">
        Sicherheit prüfen
      </AppLink>
    );
  return null;
}
