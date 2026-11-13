import { SpritmonitorReview } from '../pages/spritmonitor-source';
import { TaskSourceSummary } from './task-source-summary';
import { Check, CircleHelp, CircleCheck, Filter, MoreHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { KontenMenu } from '../ledger/konten-menu';
import { AccountReminderRows } from '../heute/account-reminders';
import {
  BankBookingMerge,
  BankCandidate,
  BankReview,
  type PreparedBankSuggestion,
} from './bank-candidate';
import { BankBulkActions, isBankInboxRow } from './bank-bulk-actions';
import { BankSyncRecap } from './bank-sync-recap';
import { GuidedReview } from './guided-review';
import { AssignmentLearnOffer, BookingAssignmentReview } from '../assignment/review';
import {
  PayslipIntakeDetail,
  PayslipDocumentCaption,
  payslipDocumentTypeLabel,
} from '../reports/payslip-intake';
import { InboxTypeIcon } from './type-icon';
import { ReadSourceDetail, sourceWarningReason } from './read-source-detail';
import { ReadSourceSummaries } from './read-source-summaries';
import { inboxCause, type InboxSegment } from '@budget/domain';
import { useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { InboxBack, type InboxSearch } from './navigation';
import {
  useAmountPrivacy,
  maskMoneyText,
  Button,
  Segmented,
  SectionHead,
  useToast,
  useIsPhone,
} from '@budget/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { BookingPanel } from '../ledger/booking-panel';
import { longDay, shortDay, nativeCurrency } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { useLedgerWrites } from '../ledger/mutations';
import { LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { PAGES } from '../nav/pages';
import { KontenFrame, useKontenSlot } from '../ledger/konten-frame';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import {
  inboxPagesQuery,
  inboxDetailQuery,
  inboxQuery,
  INBOX_PAGE_SIZE,
  resolveInbox,
  readSourceMovementsQuery,
  useInboxRefreshing,
  type InboxEntry,
  type InboxEnvelope,
  type InboxKind,
  type InboxStored,
} from './api';
import './inbox.css';
import './inbox-redesign.css';
import { ReceiptSection } from '../receipts/receipt-section';
import { DocumentUploadButton } from '../document-intake/document-upload';
import { TradePanel } from '../wealth/trade-panel';
import type { SavingsExecutionProposal } from '../wealth/savings-api';
const META = PAGES.find((p) => p.path === '/konten/pruefen')!;

function InboxHeaderItem({ slot, children }: { slot: string; children: ReactNode }) {
  const target = useKontenSlot(slot);
  return REDESIGN_ENABLED && target ? createPortal(children, target) : children;
}

function InboxSourceLine({ children }: { children: ReactNode }) {
  return REDESIGN_ENABLED ? <div className="inbox-source-line">{children}</div> : children;
}
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
  const isPhone = useIsPhone();
  const search = useSearch({ strict: false }) as InboxSearch;
  const sourceStatus = (
    <InboxSourceLine>
      <BankStatusBlock />
      {search.bankSource && (
        <p className={REDESIGN_ENABLED ? 'inbox-source-scope' : undefined}>
          {!REDESIGN_ENABLED && 'Aufgaben dieser Bankquelle. '}
          <AppLink
            to="/konten/pruefen"
            search={{
              ...(search.aufgaben && { aufgaben: search.aufgaben }),
              ...(search.von && { von: search.von }),
            }}
          >
            {REDESIGN_ENABLED ? 'Alle Quellen' : 'Alle Aufgaben anzeigen'}
          </AppLink>
        </p>
      )}
    </InboxSourceLine>
  );
  return (
    <KontenFrame meta={META} view="inbox">
      {search.von && <InboxBack to={search.von} label="Zurück zur vorherigen Ansicht" />}
      {(!REDESIGN_ENABLED || isPhone) && sourceStatus}
      {REDESIGN_ENABLED && !search.bankRecap && <BankSyncRecap />}
      {REDESIGN_ENABLED && search.bankRecap && search.bankSource && (
        <div className="inbox-source-line">
          <p>
            Neue Umsätze aus dem Abruf vom{' '}
            {new Date(search.bankRecap).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}.
            Bereits geprüfte Umsätze sind ausgeblendet.
          </p>
          <AppLink
            className="btn btn-ghost"
            to="/konten/pruefen"
            search={{ bankSource: search.bankSource }}
          >
            Alle Aufgaben dieser Quelle
          </AppLink>
        </div>
      )}
      {REDESIGN_ENABLED && search.modus === 'gefuehrt' && !search.bankSource ? (
        <GuidedReview />
      ) : (
        <>
          {REDESIGN_ENABLED && !search.bankSource && (
            <div className="inbox-guided-entry">
              <AppLink
                className="btn"
                to="/konten/pruefen"
                search={{ ...search, modus: 'gefuehrt' }}
              >
                Prüfen durchgehen
              </AppLink>
            </div>
          )}
          <InboxWorkflow bankSource={search.bankSource} />
        </>
      )}
      {REDESIGN_ENABLED && !isPhone && sourceStatus}
    </KontenFrame>
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
    <KontenFrame
      meta={META}
      view="inbox"
      title={query.data?.entry.title ?? 'Datenwarnung'}
      phoneTitle="Datenwarnung"
    >
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
    </KontenFrame>
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
      {REDESIGN_ENABLED ? (
        <div className="inbox-redesign" data-redesign="inbox">
          <DocumentUploadButton />
          {body}
        </div>
      ) : (
        body
      )}
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

function PaginatedInboxBody(props: InboxBodyProps & { bankSource?: string | undefined }) {
  const hash = useLocation({ select: (location) => location.hash });
  const accountAnchor = !props.bankSource && hash === 'account-reminder-title';
  // A new anchor landing initializes its source once; later user selections keep this lifecycle.
  return (
    <PaginatedInboxBodyContent
      key={accountAnchor ? 'account-anchor' : 'queue'}
      {...props}
      accountAnchor={accountAnchor}
    />
  );
}

function PaginatedInboxBodyContent({
  bankSource,
  accountAnchor,
  ...props
}: InboxBodyProps & { bankSource?: string | undefined; accountAnchor: boolean }) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as InboxSearch;
  const navigate = useNavigate();
  // `auto` lets the server open on the part with open work; the part then stays put while the
  // user works through it, even when it empties.
  const [pinned, setPinned] = useState<InboxSegment>();
  const [taskSource, setTaskSource] = useState<
    'accounts' | 'plan' | 'receipts' | 'payslips' | 'other' | undefined
  >(() => (accountAnchor ? 'accounts' : undefined));
  const queue = useInfiniteQuery(
    inboxPagesQuery(
      search.aufgaben,
      bankSource,
      bankSource ? (search.dateSort ?? 'newest') : undefined,
      bankSource ? search.fromDate : undefined,
      search.teil ?? (accountAnchor ? 'aufgaben' : 'auto'),
      pinned,
      undefined,
      !bankSource &&
        (search.teil === 'aufgaben' || (!search.teil && pinned === 'aufgaben')) &&
        (taskSource === 'plan' || taskSource === 'payslips' || taskSource === 'other')
        ? taskSource
        : undefined,
      REDESIGN_ENABLED && bankSource ? search.bankRecap : undefined,
    ),
  );
  // The source queue does not carry segment totals. Reuse the canonical global query for
  // the area's tabs, without changing the source queue or treating missing totals as zero.
  const segmentOverview = useInfiniteQuery({
    ...inboxPagesQuery(search.aufgaben),
    enabled: REDESIGN_ENABLED && Boolean(bankSource),
  });
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
  // Numbers from before a write stay visible but are marked as not final until the queue is re-read.
  const refreshing = useInboxRefreshing();
  const pages = queue.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const firstPage = pages[0];
  const shown = REDESIGN_ENABLED && bankSource ? 'umsaetze' : (search.teil ?? firstPage?.segment);
  const resolved = firstPage?.segment;
  if (!search.teil && !pinned && resolved) setPinned(resolved);
  const totals =
    REDESIGN_ENABLED && bankSource ? segmentOverview.data?.pages[0]?.segments : firstPage?.segments;
  const segmentCounts =
    (REDESIGN_ENABLED || !bankSource) && totals && shown ? { shown, counts: totals } : undefined;
  const fatalError = queue.isError && !queue.isFetchNextPageError ? queue.error : null;
  useEffect(() => {
    if (accountAnchor && shown === 'aufgaben' && taskSource === 'accounts' && !fatalError)
      document.getElementById('account-reminder-title')?.scrollIntoView?.({ block: 'start' });
  }, [accountAnchor, shown, taskSource, fatalError, firstPage]);
  const entrySourceSelected =
    taskSource === 'plan' || taskSource === 'payslips' || taskSource === 'other';
  const isPhone = useIsPhone();
  const sortControl = bankSource ? (
    <label>
      <span className={REDESIGN_ENABLED ? 'sr-only' : undefined}>Datumssortierung</span>
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
  ) : null;
  const filterControls = (
    <div className="inbox-filters">
      {bankSource && (
        <>
          {(!REDESIGN_ENABLED || isPhone) && sortControl}
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
  );
  return (
    <>
      {segmentCounts && (
        <InboxHeaderItem slot="inbox-segments">
          <Segmented<InboxSegment>
            className={`inbox-segments${refreshing ? ' inbox-counts-stale' : ''}`}
            label="Teil von Prüfen"
            stretch
            value={segmentCounts.shown}
            options={[
              {
                value: 'umsaetze',
                label: `Umsätze${REDESIGN_ENABLED ? '' : ' ·'} ${segmentCounts.counts.umsaetze}`,
              },
              {
                value: 'aufgaben',
                label: `Aufgaben${REDESIGN_ENABLED ? '' : ' ·'} ${segmentCounts.counts.aufgaben}`,
              },
            ]}
            onChange={(teil) =>
              void navigate({
                to: '/konten/pruefen',
                search: {
                  ...search,
                  teil,
                  gruppe: undefined,
                  ...(REDESIGN_ENABLED && teil === 'aufgaben'
                    ? { bankSource: undefined, bankRecap: undefined }
                    : {}),
                },
              } as never)
            }
          />
        </InboxHeaderItem>
      )}
      {segmentCounts && <InboxCountRule refreshing={refreshing} />}
      {REDESIGN_ENABLED ? (
        <>
          {!isPhone && <InboxHeaderItem slot="inbox-sort">{sortControl}</InboxHeaderItem>}
          <InboxHeaderItem slot="inbox-filters">
            <KontenMenu
              label="Filter"
              icon={<Filter size={16} aria-hidden="true" />}
              iconOnly={isPhone}
            >
              {filterControls}
            </KontenMenu>
          </InboxHeaderItem>
          {(search.aufgaben || search.fromDate) && (
            <div className="inbox-period-chip">
              {search.aufgaben === 'current'
                ? 'Aktueller Monat'
                : search.aufgaben === 'historical'
                  ? 'Historische Nacharbeit'
                  : `Ab ${longDay(search.fromDate!)}`}
            </div>
          )}
        </>
      ) : (
        filterControls
      )}
      {segmentCounts?.shown === 'aufgaben' && firstPage?.taskSources && (
        <section aria-label="Aufgaben nach Quelle">
          {fatalError && !entrySourceSelected && (
            <ErrorNote what="Aufgaben" error={fatalError} onRetry={() => void queue.refetch()} />
          )}
          {!queue.isPending && !fatalError && (
            <>
              {firstPage.readSourceSummaries && (
                <ReadSourceSummaries summaries={firstPage.readSourceSummaries} />
              )}
              <h2 className={REDESIGN_ENABLED ? 'sr-only' : undefined}>
                Offene Aufgaben · {segmentCounts.counts.aufgaben}
                {refreshing && <span aria-hidden="true"> (wird aktualisiert …)</span>}
              </h2>
              <p className={REDESIGN_ENABLED ? 'sr-only' : undefined}>
                Der Zeitraum gilt für Plan, Gehaltszettel und Weitere Aufgaben. Kontoprüfungen und
                Belege bleiben unabhängig davon sichtbar.
              </p>
              <TaskSourceSummary
                counts={firstPage.taskSources}
                selected={taskSource}
                onSelect={setTaskSource}
              />
              {taskSource === 'accounts' && (
                <section aria-labelledby="account-reminder-title">
                  <h3 id="account-reminder-title">Konten prüfen</h3>
                  <AccountReminderRows items={firstPage.accountReminders ?? []} />
                </section>
              )}
              {taskSource === 'receipts' && <ReceiptSection />}
            </>
          )}
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
          bankProgress={firstPage?.bankProgress}
          segmentCounts={segmentCounts}
          countsRefreshing={refreshing}
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
      {REDESIGN_ENABLED && firstPage && (
        <p className="inbox-source-date">Stand {longDay(firstPage.asOf)}</p>
      )}
    </>
  );
}

/**
 * What the Prüfen number contains. Crypto movements are listed separately (Aufgaben, "Bewegungen in
 * Datenquellen", from the same queue response) and are not part of it.
 */
function InboxCountRule({ refreshing }: { refreshing: boolean }) {
  return (
    <div className="inbox-count-rule" aria-busy={refreshing}>
      <p className="inbox-counts-status" aria-hidden="true">
        {refreshing ? 'Zahlen werden aktualisiert …' : ''}
      </p>
      <details>
        <summary>Was zählt bei Prüfen?</summary>
        <p>
          Die Zahl bei „Prüfen“ ist die Summe aus Umsätzen und Aufgaben. „Bewegungen zu prüfen“ aus
          Datenquellen, etwa der Krypto-Lesequelle, stehen getrennt unter Aufgaben mit eigener
          Anzahl und sind in dieser Zahl nicht enthalten.
        </p>
      </details>
    </div>
  );
}

/** Overspent categories are no Prüfen work, even if an old or mocked response still carries them. */
type TaskEntry = Exclude<InboxEntry, InboxEnvelope>;

function InboxBodyContent({
  entries: received,
  count,
  bankProgress,
  totalEntries,
  countsByKind,
  countsByCause,
  segmentCounts,
  countsRefreshing = false,
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
  bankProgress?: { reviewed: number; total: number } | undefined;
  totalEntries: number | undefined;
  countsByKind: Partial<Record<InboxKind, number>> | undefined;
  countsByCause?: Record<string, number> | undefined;
  /** Konten › Prüfen: open work per part and the part shown. */
  segmentCounts?: { shown: InboxSegment; counts: Record<InboxSegment, number> } | undefined;
  /** The numbers shown belong to the state before a write; they are marked as not final. */
  countsRefreshing?: boolean;
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
  const [preparedBank, setPreparedBank] = useState(
    new Map<string, PreparedBankSuggestion | undefined>(),
  );
  const prepareBank = useCallback((id: string, suggestion: PreparedBankSuggestion | undefined) => {
    setPreparedBank((previous) => {
      if (JSON.stringify(previous.get(id)) === JSON.stringify(suggestion)) return previous;
      const next = new Map(previous);
      next.set(id, suggestion);
      return next;
    });
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
  const bankLayout = REDESIGN_ENABLED && entries.some(isBankInboxRow);
  const groups: (Exclude<InboxKind, 'overspent'> | null)[] =
    bankLayout || accountScoped || search.bankSource || groupByTitle
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
    !bankProgress?.total &&
    entries.length === 0 &&
    !learnBookingId
  )
    return null;
  const reviewProgress = (segmentCounts?.shown === 'umsaetze' || search.bankSource) &&
    bankProgress &&
    bankProgress.total > 0 && (
      <div className="bank-review-progress">
        <p>
          {bankProgress.total - bankProgress.reviewed} offen · {bankProgress.reviewed} von{' '}
          {bankProgress.total} geprüft
        </p>
        <progress
          value={bankProgress.reviewed}
          max={bankProgress.total}
          aria-label="Geprüfte Bankumsätze"
        />
      </div>
    );
  return (
    <section
      className={`kinbox${REDESIGN_ENABLED ? ' kinbox-v1' : ''}${bankLayout ? ' kinbox-bank-v1' : ''}`}
      aria-labelledby={headingId}
    >
      <SectionHead
        id={headingId}
        title={
          accountScoped
            ? 'Bankumsätze prüfen'
            : groupByTitle
              ? 'Bewegungen zu prüfen'
              : 'Offene Entscheidungen'
        }
        aside={(() => {
          const open =
            REDESIGN_ENABLED && search.bankRecap && count !== undefined
              ? count
              : segmentCounts
                ? segmentCounts.counts[segmentCounts.shown]
                : count;
          if (open === undefined) return undefined;
          return (
            <>
              {open} offen
              {countsRefreshing && <span aria-hidden="true"> · wird aktualisiert …</span>}
            </>
          );
        })()}
      />
      {!REDESIGN_ENABLED && reviewProgress}
      {pending && <LoadingNote what="Aufgaben" />}
      {learnBookingId && <AssignmentLearnOffer bookingId={learnBookingId} />}
      {error && <ErrorNote what="Aufgaben" error={error} onRetry={onRetry} />}
      {!pending && !error && readSourceSummaries && (
        <ReadSourceSummaries summaries={readSourceSummaries} />
      )}
      {count === 0 &&
      REDESIGN_ENABLED &&
      !pending &&
      !error &&
      !accountScoped &&
      !readSourceSummaries?.length &&
      entries.length === 0 ? (
        <div className="inbox-empty-v1">
          <CircleCheck size={64} strokeWidth={1.2} aria-hidden="true" />
          <h2>{search.bankRecap ? 'Alle neuen Umsätze dieses Abrufs geprüft' : 'Alles geprüft'}</h2>
          <p>
            {search.bankRecap
              ? 'Frühere offene Aufgaben bleiben unter „Alle Aufgaben dieser Quelle“ verfügbar.'
              : 'Neue Buchungen aus dem Bank-Sync erscheinen hier.'}
          </p>
        </div>
      ) : (
        count === 0 && (
          <EmptyNote>
            {accountScoped
              ? 'Keine offenen Bankumsätze für dieses Konto.'
              : groupByTitle
                ? 'Keine offenen Bewegungen vorhanden.'
                : readSourceSummaries?.length
                  ? 'Keine offenen Entscheidungen vorhanden.'
                  : 'Prüfen leer. Es sind keine offenen Aufgaben vorhanden.'}
          </EmptyNote>
        )
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
              prepared={(id) => preparedBank.get(id)}
              sourceId={search.bankSource}
            />
          )}
          <table className={`rev-table kinbox-table${bankLayout ? ' bank-v1-table' : ''}`}>
            <caption className="sr-only">
              {accountScoped
                ? 'Offene Bankumsätze dieses Kontos'
                : 'Offene Entscheidungen nach Typ'}
            </caption>
            {!bankLayout && REDESIGN_ENABLED && (
              <colgroup>
                <col className="inbox-col-mark" />
                <col />
                <col className="inbox-col-action" />
              </colgroup>
            )}
            {bankLayout ? (
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Auswahl</span>
                  </th>
                  <th scope="col">Empfänger</th>
                  <th scope="col">Konto · Quelle</th>
                  <th scope="col">Vorschlag</th>
                  <th scope="col" className="num">
                    Betrag
                  </th>
                  <th scope="col">Aktion</th>
                  <th scope="col">
                    <span className="sr-only">Weitere Aktionen</span>
                  </th>
                </tr>
              </thead>
            ) : (
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
            )}
            <tbody>
              {groups.flatMap((kind) => {
                const all = kind ? entries.filter((item) => item.kind === kind) : entries;
                if (!all.length || (!serverPaginated && room <= 0)) return [];
                const items = all.slice(0, room);
                room -= items.length;
                return [
                  <tr
                    className={`kgroup${bankLayout ? ' sr-only' : ''}`}
                    key={kind ?? 'bank-source'}
                  >
                    <td className="rev-mark" />
                    <th scope="rowgroup" colSpan={bankLayout ? 6 : 2}>
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
                          <td colSpan={bankLayout ? 6 : 2}>
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
                              bankLayout={bankLayout}
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
      {REDESIGN_ENABLED && reviewProgress}
      {showReceipts && (
        <>
          <ReceiptSection />
        </>
      )}
    </section>
  );
}

function InboxRow({
  bankLayout = false,
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
  bankLayout?: boolean;
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
  if (item.type === 'stored' && item.refType === 'spritmonitor' && item.refId)
    return (
      <tr className="rev-row" data-testid="inbox-row">
        <td className="rev-mark">
          <InboxTypeIcon entry={item} />
        </td>
        <td className="rev-what" colSpan={bankLayout ? 4 : undefined}>
          <strong>{item.title}</strong>
          {detailView ? <SpritmonitorReview rowKey={item.refId} /> : <span>{item.detail}</span>}
        </td>
        <td className="rev-act kact" colSpan={bankLayout ? 2 : undefined}>
          <div className="inbox-row-actions">
            {!detailView && (
              <AppLink
                className="btn btn-ghost btn-sm"
                to={`/konten/pruefen/${encodeURIComponent(item.id)}`}
                search={search}
                state={{ inboxOpenedInApp: true }}
              >
                Tankung prüfen
              </AppLink>
            )}
            <AppLink
              className="btn btn-ghost btn-sm"
              to="/einstellungen/datenquellen"
              hash="spritmonitor-source-title"
            >
              Datenquelle prüfen
            </AppLink>
          </div>
        </td>
      </tr>
    );
  if (isBankInboxRow(item))
    return (
      <BankInboxRow
        item={item}
        bankLayout={bankLayout}
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
        <div className="inbox-row-mark">
          <InboxTypeIcon entry={item} />
        </div>
      </td>
      <td className="rev-what" colSpan={bankLayout ? 4 : undefined}>
        <strong>
          {item.type === 'booking'
            ? `${item.payeeName ?? 'Buchung ohne Empfänger'} · ${nativeCurrency(item.amountCents, item.currency)}`
            : item.type === 'savings'
              ? `Sparplan: ${item.securityName} · ${nativeCurrency(item.amountCents, item.currency)}`
              : item.payslipDocument
                ? payslipDocumentTypeLabel(item.payslipDocument.documentType)
                : item.title}
        </strong>
        {item.type === 'stored' && item.payslipDocument ? (
          <PayslipDocumentCaption document={item.payslipDocument} />
        ) : item.type === 'stored' && item.kind === 'import' && !detailView ? (
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
      <td className="rev-act kact" colSpan={bankLayout ? 2 : undefined}>
        <div className="inbox-row-actions">
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
                <BankCandidate
                  id={item.refId}
                  disabled={busy}
                  description={item.title}
                  onConfirmed={onBankConfirmed}
                />
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
        </div>
      </td>
    </tr>
  );
}

function BankInboxRow({
  bankLayout,
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
  bankLayout: boolean;
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
  const isPhone = useIsPhone();
  const [candidate, setCandidate] = useState<PreparedBankSuggestion>();
  const [merge, setMerge] = useState<PreparedBankSuggestion>();
  const [rule, setRule] = useState<PreparedBankSuggestion>();
  const prepared = merge ?? rule;
  const prepareCandidate = useCallback(
    (suggestion: PreparedBankSuggestion | undefined) => {
      setCandidate(suggestion);
      onPrepared(item.id, suggestion);
    },
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
  const suggestion = item.type === 'stored' ? item.bankCandidate?.suggestion : undefined;
  const rowPrepared = item.type === 'booking' ? prepared : candidate;
  const actions = (
    <div className="inbox-row-actions">
      {item.type === 'stored' && item.refId ? (
        <>
          <BankCandidate
            id={item.refId}
            triggerLabel={bankLayout ? (candidate?.bulkSafe ? 'Bestätigen' : 'Prüfen') : undefined}
            disabled={busy}
            description={
              data
                ? `${data.payeeName || data.memo || 'Bankumsatz'} · ${nativeCurrency(data.amountCents, data.currency)} · ${longDay(data.date)} · ${data.accountName}`
                : item.title
            }
            onConfirmed={onConfirmed}
            onPrepared={prepareCandidate}
          />
          {!bankLayout && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onResolve}>
              Nicht übernehmen
            </Button>
          )}
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
    </div>
  );
  if (bankLayout)
    return (
      <tr className="rev-row bank-inbox-row bank-v1-row" data-testid="inbox-row">
        <td className="bank-v1-select">
          {onSelect && !isPhone && (
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
        <td className="bank-v1-payee">
          <strong>
            {data?.payeeName || data?.memo || (item.type === 'stored' ? item.title : 'Bankumsatz')}
          </strong>
          <span>{data ? shortDay(data.date) : 'Datum nicht verfügbar'}</span>
          <small className="bank-v1-phone-source">
            {data?.accountName} · {item.type === 'stored' ? 'Bank-Sync' : 'Bankbuchung'}
          </small>
        </td>
        <td className="bank-v1-source">
          <span>{data?.accountName ?? 'Konto nicht verfügbar'}</span>
          <small>{item.type === 'stored' ? 'Bank-Sync' : 'Bankbuchung'}</small>
        </td>
        <td className="bank-v1-suggestion">
          <span
            title={suggestion?.label}
            className={`bank-suggestion-pill${rowPrepared?.bulkSafe ? ' is-safe' : ''}`}
          >
            {rowPrepared?.bulkSafe ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <CircleHelp size={14} aria-hidden="true" />
            )}
            {rowPrepared?.label ??
              (suggestion?.needsReview ? 'Unbekannt' : suggestion?.label) ??
              'Unbekannt'}
          </span>
        </td>
        <td className="bank-v1-amount num">
          {data ? nativeCurrency(data.amountCents, data.currency) : '—'}
        </td>
        <td className="bank-v1-action">{actions}</td>
        <td className="bank-v1-more">
          {(item.type === 'stored' || onSelect) && (
            <KontenMenu
              label="Weitere Aktionen"
              icon={<MoreHorizontal size={16} aria-hidden="true" />}
              iconOnly
            >
              {onSelect && isPhone && (
                <label className="bank-select">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={busy}
                    aria-label={`Bankzeile auswählen: ${data?.payeeName ?? data?.memo ?? item.id}`}
                    onChange={(event) => onSelect(event.target.checked)}
                  />
                  Auswählen
                </label>
              )}
              {item.type === 'stored' && (
                <Button variant="ghost" disabled={busy} onClick={onResolve}>
                  Nicht übernehmen
                </Button>
              )}
            </KontenMenu>
          )}
        </td>
      </tr>
    );
  return (
    <tr className="rev-row bank-inbox-row" data-testid="inbox-row">
      <td className="rev-mark">
        <div className="inbox-row-mark">
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
        </div>
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
        {suggestion && <span>{suggestion.label}</span>}
      </td>
      <td className="rev-act kact">{actions}</td>
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
