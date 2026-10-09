import { BankBookingMerge, BankCandidate } from './bank-candidate';
import { AssignmentLearnOffer, BookingAssignmentReview } from '../assignment/review';
import { PayslipUpload, PayslipIntakeDetail } from '../reports/payslip-intake';
import { ReadSourceDetail, sourceWarningReason } from './read-source-detail';
import { inboxCause } from '@budget/domain';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { InboxBack, type InboxSearch } from './navigation';
import {
  useAmountPrivacy,
  maskMoneyText,
  Button,
  RevisionTriangle,
  SectionHead,
  useToast,
} from '@budget/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
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
  type InboxEntry,
  type InboxKind,
  type InboxStored,
} from './api';
import './inbox.css';
import { ReceiptSection } from '../receipts/receipt-section';
import { TradePanel } from '../wealth/trade-panel';
import type { SavingsExecutionProposal } from '../wealth/savings-api';
const META = PAGES.find((p) => p.path === '/konten/posteingang')!;
const LABELS: Record<InboxKind, string> = {
  uncategorized: 'Buchungen ohne Kategorie',
  revision: 'Vorschläge',
  import: 'Datenprüfung',
  stale_value: 'Veraltete Werte',
  consent: 'Einwilligungen',
  overspent: 'Überzogene Kategorien',
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
      {search.bankSource && (
        <p>
          Aufgaben dieser Bankquelle.{' '}
          <AppLink
            to="/konten/posteingang"
            search={{
              ...(search.aufgaben !== 'all' && { aufgaben: search.aufgaben }),
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
          <AppLink to="/konten/posteingang" search={search}>
            Posteingang
          </AppLink>
          {' › '}
          <span aria-current="page">Datenwarnung</span>
        </nav>
        <InboxBack to={`/konten/posteingang?${params}`} label="Zurück zum Posteingang" />
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
}: {
  entryIds?: string[] | undefined;
  detailEntry?: InboxStored | undefined;
  bankSource?: string | undefined;
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
  onEdit,
  loadingId,
  onSavings,
}: {
  entryIds?: string[] | undefined;
  detailEntry?: InboxStored | undefined;
  bankSource?: string | undefined;
  onEdit: (id: string) => void;
  loadingId: string | null;
  onSavings: (proposal: SavingsExecutionProposal) => void;
}) {
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
  const queue = useInfiniteQuery(inboxPagesQuery(search.aufgaben, bankSource));
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
  return (
    <>
      <div className="inbox-filters">
        <label>
          Zeitraum der Aufgaben
          <select
            className="select"
            value={search.aufgaben}
            onChange={(event) =>
              void navigate({
                to: '/konten/posteingang',
                search: { ...search, aufgaben: event.target.value, gruppe: undefined },
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
      <InboxBodyContent
        {...props}
        entries={entries}
        count={firstPage?.count}
        totalEntries={firstPage?.totalEntries}
        countsByKind={firstPage?.countsByKind}
        countsByCause={firstPage?.countsByCause}
        pending={queue.isPending}
        error={queue.isError && !queue.isFetchNextPageError ? queue.error : null}
        nextPageError={queue.isFetchNextPageError ? queue.error : null}
        onRetry={() => void queue.refetch()}
        onRetryNextPage={() => void fetchNextPage()}
        showReceipts={!bankSource}
        serverPaginated
        hasMore={queue.hasNextPage}
        loadingMore={queue.isFetching}
        loadMore={() => void fetchNextPage()}
      />
    </>
  );
}

function InboxBodyContent({
  entries,
  count,
  totalEntries,
  countsByKind,
  countsByCause,
  detailView = false,
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
  detailView?: boolean;
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
  const headingId = useId();
  const search = useSearch({ strict: false }) as InboxSearch;
  const navigate = useNavigate();
  const writes = useLedgerWrites();
  const write = useBudgetWrite();
  const [busy, setBusy] = useState<string | null>(null);
  const [learnBookingId, setLearnBookingId] = useState<string | null>(null);
  const [shown, setShown] = useState(INBOX_PAGE_SIZE);
  const resolve = async (item: InboxStored) => {
    if (busy) return;
    setBusy(item.id);
    await write(
      () => resolveInbox(item.id),
      () => 'Aufgabe als erledigt markiert.',
    );
    setBusy(null);
  };
  const groups = Object.keys(LABELS) as InboxKind[];
  let index = 0;
  let room = serverPaginated ? entries.length : shown;
  const canLoadMore = serverPaginated ? Boolean(hasMore) : entries.length > shown;
  const remaining = serverPaginated
    ? Math.max((totalEntries ?? entries.length) - entries.length, 0)
    : entries.length - shown;
  return (
    <section className="kinbox" aria-labelledby={headingId}>
      <SectionHead
        id={headingId}
        title="Offene Entscheidungen"
        aside={count !== undefined ? `${count} offen` : undefined}
      />
      {pending && <LoadingNote what="Aufgaben" />}
      {learnBookingId && <AssignmentLearnOffer bookingId={learnBookingId} />}
      {error && <ErrorNote what="Aufgaben" error={error} onRetry={onRetry} />}
      {count === 0 && (
        <EmptyNote>Posteingang leer. Es sind keine offenen Aufgaben vorhanden.</EmptyNote>
      )}
      {!pending && !error && count !== 0 && entries.length === 0 && (
        <EmptyNote>Keine offenen Aufgaben in diesem Zeitraum.</EmptyNote>
      )}
      {entries.length > 0 && (
        <>
          <table className="rev-table kinbox-table">
            <caption className="sr-only">Offene Entscheidungen nach Typ</caption>
            <thead>
              <tr>
                <th className="tech rev-mark" scope="col">
                  Rev.
                </th>
                <th className="tech" scope="col">
                  Änderung
                </th>
                <th className="tech rev-act" scope="col">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((kind) => {
                const all = entries.filter((item) => item.kind === kind);
                if (!all.length || (!serverPaginated && room <= 0)) return [];
                const items = all.slice(0, room);
                room -= items.length;
                return [
                  <tr className="kgroup" key={kind}>
                    <td className="rev-mark" />
                    <th scope="rowgroup" colSpan={2}>
                      {LABELS[kind]}{' '}
                      <span className="kgcount">{countsByKind?.[kind] ?? all.length}</span>
                    </th>
                  </tr>,
                  ...items.flatMap((item) => {
                    const cause = !serverPaginated || detailView ? null : inboxCause(item);
                    const members = cause
                      ? items.filter((member) => inboxCause(member) === cause)
                      : [item];
                    const total = cause ? (countsByCause?.[cause] ?? members.length) : 1;
                    if (total > 1 && members[0]?.id !== item.id) return [];
                    const expanded = search.gruppe === item.id;
                    const group =
                      total > 1 ? (
                        <tr className="inbox-cause" key={`cause-${item.id}`}>
                          <td />
                          <td colSpan={2}>
                            <Button
                              variant="ghost"
                              aria-expanded={expanded}
                              onClick={() =>
                                void navigate({
                                  to: '.',
                                  search: { ...search, gruppe: expanded ? undefined : item.id },
                                  replace: true,
                                } as never)
                              }
                            >
                              {item.type === 'stored'
                                ? `${item.title} · ${maskMoneyText(sourceWarningReason(item.detail))}`
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
                      ...(total > 1 && !expanded
                        ? []
                        : members.map((item) => (
                            <InboxRow
                              key={item.id}
                              item={item}
                              detailView={detailView}
                              onBankConfirmed={setLearnBookingId}
                              letter={String.fromCharCode(65 + (index++ % 26))}
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
          <PayslipUpload />
          <ReceiptSection />
        </>
      )}
    </section>
  );
}

function InboxRow({
  detailView = false,
  onBankConfirmed,
  item,
  letter,
  busy,
  onEdit,
  onSavings,
  onResolve,
  onConfirm,
  confirming,
}: {
  detailView?: boolean;
  onBankConfirmed: (id: string) => void;
  item: InboxEntry;
  letter: string;
  busy: boolean;
  onEdit: (id: string) => void;
  onSavings: (proposal: SavingsExecutionProposal) => void;
  onResolve: () => void;
  onConfirm: (id: string) => void;
  confirming: boolean;
}) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as InboxSearch;
  return (
    <tr className={`rev-row${item.urgent ? ' is-urgent' : ''}`} data-testid="inbox-row">
      <td className="rev-mark">
        <RevisionTriangle letter={letter} urgent={item.urgent} />
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
        ) : item.type === 'envelope' ? (
          <AppLink
            className="btn btn-alert btn-sm"
            to="/plan/monat"
            search={{ monat: item.month, kategorie: item.categoryId }}
          >
            Decken
          </AppLink>
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
                to={`/konten/posteingang/${encodeURIComponent(item.id)}`}
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

/** Offer only connected repair views; unknown/legacy references stay readable without inert links. */
function SourceLink({ item }: { item: InboxStored }) {
  useAmountPrivacy();
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
