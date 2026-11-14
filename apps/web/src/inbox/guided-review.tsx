import { Button, useAmountPrivacy } from '@budget/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Check, CircleHelp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { candidateAssignmentQuery } from '../assignment/api';
import { AssignmentLearnOffer } from '../assignment/review';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { BookingPanel } from '../ledger/booking-panel';
import { nativeCurrency, shortDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { useLedgerWrites } from '../ledger/mutations';
import { LEDGER_KEY, lookupsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { ListedBooking } from '../ledger/types';
import { AppLink } from '../shell/app-link';
import { inboxPagesQuery } from './api';
import { BankCandidate } from './bank-candidate';
import {
  DEFER_REASONS,
  candidateReadiness,
  clearProgress,
  loadProgress,
  nextOpenIndex,
  saveProgress,
  toGuidedItem,
  usableRules,
  type GuidedItem,
} from './guided-review-model';
import type { InboxSearch } from './navigation';
import './guided-review.css';

type Matches = { merge: unknown[]; link?: unknown[]; transfers: unknown[] };
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
const isControl = (target: EventTarget | null) =>
  target instanceof HTMLElement && ['BUTTON', 'A', 'SUMMARY'].includes(target.tagName);

/**
 * Guided pass through the open Umsätze of Konten › Prüfen (#1054): one line at a time, oldest
 * first. Confirming, editing and learning reuse the list's operations; "Später" only hides a line
 * for this browser session (nothing is stored server-side).
 */
export function GuidedReview() {
  useAmountPrivacy();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as InboxSearch;
  const write = useBudgetWrite();
  const writes = useLedgerWrites();
  const [initial] = useState(loadProgress);
  const [currentId, setCurrentId] = useState(initial.currentId);
  const [deferred, setDeferred] = useState(initial.deferred);
  // Resolved ids are counted once each, whichever path notices first (confirm or refetch).
  const [resolvedBase, setResolvedBase] = useState(initial.resolved);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const resolved = resolvedBase + resolvedIds.size;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const [deferring, setDeferring] = useState(false);
  const [reason, setReason] = useState<string>(DEFER_REASONS[0]);
  const [acting, setActing] = useState(false);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [editing, setEditing] = useState<ListedBooking | null>(null);
  const [learnBookingId, setLearnBookingId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Enter confirms only on a fresh keydown for an item that has been on screen with its checks
  // resolved; `inFlight` is set synchronously so two rapid presses send one request.
  const inFlight = useRef(false);
  const armed = useRef(false);
  const dialogAtKeydown = useRef(false);
  const [validated, setValidated] = useState(false);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const editTrigger = useRef<HTMLElement | null>(null);

  // Oldest first, Umsätze only; the cache entry is separate from the list view.
  const queue = useInfiniteQuery(
    inboxPagesQuery('all', undefined, 'oldest', undefined, 'umsaetze'),
  );
  const pages = queue.data?.pages ?? [];
  const firstPage = pages[0];
  const received = useMemo(
    () =>
      pages
        .flatMap((page) => page.entries)
        .map(toGuidedItem)
        .filter((item): item is GuidedItem => item !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue.data],
  );
  const items = received.filter((item) => !hidden.has(item.id));
  const ids = items.map((item) => item.id);
  const fatal = queue.isError && !queue.isFetchNextPageError ? queue.error : null;
  const hasMore = Boolean(queue.hasNextPage);

  // Items that leave the server queue (confirmed in the dialog, elsewhere or by the nightly run).
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!queue.isSuccess || queue.isFetching) return;
    const now = new Set(received.map((item) => item.id));
    const before = known.current;
    known.current = now;
    if (!before) return;
    const gone = [...before].filter((id) => !now.has(id));
    if (gone.length) setResolvedIds((set) => new Set([...set, ...gone]));
  }, [queue.isSuccess, queue.isFetching, received]);

  // A stored position that is gone (other session, queue worked off elsewhere) is stale: start
  // fresh so old counts never leak into "n von m".
  if (!validated && queue.isSuccess && !queue.isFetching) {
    setValidated(true);
    if (!hasMore && !(initial.currentId && ids.includes(initial.currentId))) {
      setResolvedBase(0);
      setDeferred({});
      setCurrentId(null);
    }
  }
  const [lastIndex, setLastIndex] = useState(0);
  let index = currentId ? ids.indexOf(currentId) : -1;
  if (index < 0) index = nextOpenIndex(ids, deferred, currentId ? lastIndex : 0);
  const current = index >= 0 ? items[index] : undefined;
  // The vanished item's slot is where the next one now sits.
  if (index >= 0 && index !== lastIndex) setLastIndex(index);
  const deferredHere = items.filter((item) => item.id in deferred);
  // After a confirm `items` drops the line while `received`/`totalEntries` still hold it, so m
  // stays constant until the refetch removes it from both.
  const totalOpen =
    items.length + (hasMore ? Math.max((firstPage?.totalEntries ?? 0) - received.length, 0) : 0);
  const total = resolved + totalOpen;
  const position = resolved + index + 1;
  const tasksOpen = firstPage?.segments?.aufgaben ?? 0;

  // Fetch ahead so "n von m" and the end of the pass never rest on a partial page.
  const nearEnd = index < 0 || items.length - index <= 5;
  useEffect(() => {
    if (hasMore && nearEnd && !queue.isFetching && !queue.isFetchNextPageError)
      void queue.fetchNextPage();
  }, [hasMore, nearEnd, queue]);

  const loading = queue.isPending || (index < 0 && hasMore && !queue.isFetchNextPageError);
  const summary = !loading && !fatal && (finished || index < 0);

  useEffect(() => {
    if (!queue.isSuccess) return;
    saveProgress({ currentId: current?.id ?? null, deferred, resolved });
  }, [queue.isSuccess, current?.id, deferred, resolved]);

  // Move focus to the new item after the first render; the live region announces it.
  const shownId = summary ? 'summary' : (current?.id ?? '');
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [shownId]);

  const review = useQuery({
    ...candidateAssignmentQuery(current?.refId ?? ''),
    enabled: current?.kind === 'candidate',
  });
  const matches = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-matches', current?.refId ?? ''],
    queryFn: () =>
      request<Matches>(
        'GET',
        '/api/bank-sync/candidates/' + encodeURIComponent(current?.refId ?? '') + '/matches',
      ),
    enabled: current?.kind === 'candidate',
  });
  const lookups = useQuery(lookupsQuery());
  const categoryNames = useMemo(
    () => new Map((lookups.data?.categories ?? []).map((c) => [c.id, c.name])),
    [lookups.data],
  );
  const facts =
    current?.kind === 'candidate'
      ? candidateReadiness({
          review: review.data as never,
          reviewFailed: review.isError,
          matches: matches.data,
          matchesFailed: matches.isError,
          categoryNames,
          serverLabel: current.serverLabel,
        })
      : undefined;
  const bookingConfirmable = current?.kind === 'booking' && current.pending;
  const canConfirm = Boolean(current && !acting && (facts ? facts.canConfirm : bookingConfirmable));

  // Arm Enter 250 ms after the shown item's checks have resolved; changing items disarms it.
  const checking = facts?.loading ?? false;
  const shownItemId = current?.id;
  useEffect(() => {
    armed.current = false;
    if (!shownItemId || checking || summary) return;
    const timer = setTimeout(() => {
      armed.current = true;
    }, 250);
    return () => clearTimeout(timer);
  }, [shownItemId, checking, summary]);

  const go = (target: number) => {
    setDeferring(false);
    setLearnBookingId(null);
    if (target < 0) return;
    if (target >= items.length) {
      if (!hasMore) setFinished(true);
      return;
    }
    setFinished(false);
    setCurrentId(items[target]!.id);
  };
  const confirm = async () => {
    if (!current || !canConfirm || inFlight.current) return;
    inFlight.current = true;
    armed.current = false;
    const item = current;
    setLearnBookingId(null);
    setActing(true);
    setFailure(null);
    let problem: unknown;
    try {
      if (item.kind === 'booking') {
        await writes.patch.mutateAsync({ id: item.refId, patch: { status: 'confirmed' } });
      } else {
        const rule = usableRules(review.data?.suggestions ?? [])[0];
        const done = await write(
          () =>
            request<{ groupId: string; bookingId: string }>(
              'POST',
              '/api/bank-sync/candidates/' + encodeURIComponent(item.refId) + '/confirm',
              {
                categoryId: null,
                ruleId: rule?.id,
                revision: rule?.revision,
                candidateRevision: review.data?.candidateRevision,
              },
            ).catch((error: unknown) => {
              problem = error;
              throw error;
            }),
          () => 'Bankumsatz als Buchung bestätigt.',
        );
        if (!done) throw problem ?? new Error('failed');
        if (rule?.actions.categoryId || rule?.actions.splits) setLearnBookingId(done.bookingId);
      }
      setHidden((set) => new Set(set).add(item.id));
      setResolvedIds((set) => new Set(set).add(item.id));
    } catch (error) {
      // The item stays on screen and actionable; nothing was confirmed.
      setFailure({ id: item.id, message: errorText(error, 'Das Bestätigen hat nicht geklappt.') });
    } finally {
      inFlight.current = false;
      setActing(false);
    }
  };
  const defer = () => {
    if (!current) return;
    const next = { ...deferred, [current.id]: reason };
    setLearnBookingId(null);
    setDeferred(next);
    setDeferring(false);
    const target = nextOpenIndex(ids, next, index + 1);
    if (target < 0) setFinished(true);
    else setCurrentId(ids[target]!);
  };
  const leave = () =>
    void navigate({
      to: '/konten/pruefen',
      search: { ...search, modus: undefined },
    } as never);
  const edit = async (item: GuidedItem) => {
    editTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const { booking } = await request<{ booking: ListedBooking }>(
        'GET',
        `/api/bookings/${encodeURIComponent(item.refId)}`,
      );
      setEditing(booking);
    } catch (error) {
      setFailure({ id: item.id, message: errorText(error) });
    }
  };

  // Keys act on the pass only while no dialog is open and focus is not on a field.
  const cancelDefer = () => {
    setDeferring(false);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-guided-later]')?.focus(),
    );
  };
  const latest = useRef({ confirm, go, leave, index, deferring, cancelDefer });
  useEffect(() => {
    latest.current = { confirm, go, leave, index, deferring, cancelDefer };
  });
  useEffect(() => {
    // Capture phase runs before a dialog closes itself, so Esc that closes a dialog is never
    // taken for "leave" by the bubble-phase handler below.
    const onCapture = () => {
      dialogAtKeydown.current = Boolean(document.querySelector('[role="dialog"], dialog[open]'));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (dialogAtKeydown.current || isTyping(event.target)) {
        // A select in the defer panel: Esc still only cancels the defer.
        if (event.key === 'Escape' && !dialogAtKeydown.current && latest.current.deferring) {
          event.preventDefault();
          latest.current.cancelDefer();
        }
        return;
      }
      const now = latest.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (now.deferring) now.cancelDefer();
        else now.leave();
      } else if (event.key === 'Enter') {
        if (event.repeat) {
          event.preventDefault();
          return;
        }
        if (isControl(event.target) || now.deferring || !armed.current || inFlight.current) return;
        event.preventDefault();
        void now.confirm();
      } else if (['ArrowRight', 'ArrowDown', 'j', 'J'].includes(event.key)) {
        event.preventDefault();
        now.go(now.index + 1);
      } else if (['ArrowLeft', 'ArrowUp', 'k', 'K'].includes(event.key)) {
        event.preventDefault();
        now.go(now.index - 1);
      }
    };
    document.addEventListener('keydown', onCapture, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onCapture, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const label = summary
    ? 'Zusammenfassung'
    : current
      ? `Umsatz ${position} von ${total}: ${current.payee}, ${nativeCurrency(current.amountCents, current.currency)}`
      : '';
  return (
    <section className="guided" aria-labelledby="guided-title" data-redesign="guided-review">
      <header className="guided-head">
        <h2 id="guided-title">Prüfen durchgehen</h2>
        <Button variant="ghost" size="sm" onClick={leave}>
          Zur Liste
        </Button>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {label}
      </p>
      {fatal && <ErrorNote what="Umsätze" error={fatal} onRetry={() => void queue.refetch()} />}
      {loading && !fatal && <LoadingNote what="Umsätze" />}
      {!fatal && !loading && !summary && current && (
        <>
          <div className="guided-progress" aria-hidden="true">
            <p>
              <strong>{position}</strong> von {total}
              <small>
                {' '}
                · {resolved} erledigt · {deferredHere.length} zurückgestellt
              </small>
            </p>
            <progress max={total} value={Math.min(position, total)} />
          </div>
          <GuidedCard
            item={current}
            facts={facts}
            deferredReason={deferred[current.id]}
            canConfirm={canConfirm}
            acting={acting}
            failure={failure?.id === current.id ? failure.message : null}
            deferring={deferring}
            reason={reason}
            reasonRef={reasonRef}
            headingRef={headingRef}
            isFirst={index === 0}
            onReason={setReason}
            onConfirm={() => void confirm()}
            onEdit={() => void edit(current)}
            onLearn={setLearnBookingId}
            onStartDefer={() => {
              setDeferring(true);
              requestAnimationFrame(() => reasonRef.current?.focus());
            }}
            onCancelDefer={cancelDefer}
            onDefer={defer}
            onBack={() => go(index - 1)}
          />
          {nearEnd && queue.isFetchNextPageError && (
            <ErrorNote
              what="Weitere Umsätze"
              error={queue.error}
              onRetry={() => void queue.fetchNextPage()}
            />
          )}
          <p className="guided-keys">
            Enter bestätigt · Pfeile oder J/K wechseln den Umsatz · Esc zur Liste
          </p>
          {learnBookingId && <AssignmentLearnOffer bookingId={learnBookingId} />}
        </>
      )}
      {!fatal && summary && (
        <GuidedSummary
          resolved={resolved}
          deferred={deferredHere.map((item) => ({ item, reason: deferred[item.id]! }))}
          remaining={Math.max(totalOpen - deferredHere.length, 0)}
          tasksOpen={tasksOpen}
          headingRef={headingRef}
          onReview={(id) => {
            setFinished(false);
            setCurrentId(id);
          }}
          onDone={() => {
            if (!deferredHere.length) clearProgress();
            leave();
          }}
        />
      )}
      {learnBookingId && (summary || !current) && (
        <AssignmentLearnOffer bookingId={learnBookingId} />
      )}
      <BookingPanel
        state={editing ? { mode: 'edit', booking: editing } : null}
        onClose={() => {
          setEditing(null);
          requestAnimationFrame(() => editTrigger.current?.focus());
        }}
      />
    </section>
  );
}

function GuidedCard({
  item,
  facts,
  deferredReason,
  canConfirm,
  acting,
  failure,
  deferring,
  reason,
  reasonRef,
  headingRef,
  isFirst,
  onReason,
  onConfirm,
  onEdit,
  onLearn,
  onStartDefer,
  onCancelDefer,
  onDefer,
  onBack,
}: {
  item: GuidedItem;
  facts: ReturnType<typeof candidateReadiness> | undefined;
  deferredReason: string | undefined;
  canConfirm: boolean;
  acting: boolean;
  failure: string | null;
  deferring: boolean;
  reason: string;
  reasonRef: React.RefObject<HTMLSelectElement | null>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  isFirst: boolean;
  onReason: (reason: string) => void;
  onConfirm: () => void;
  onEdit: () => void;
  onLearn: (bookingId: string) => void;
  onStartDefer: () => void;
  onCancelDefer: () => void;
  onDefer: () => void;
  onBack: () => void;
}) {
  const label = facts ? (facts.categoryName ?? facts.ruleName) : null;
  const unknown = !label;
  const why =
    facts?.reason ??
    (item.kind === 'booking'
      ? item.pending
        ? 'Gebucht ohne Kategorie. Ordne sie unter Bearbeiten zu.'
        : 'Gebucht ohne Kategorie. Ordne sie unter Bearbeiten zu; Bestätigen ist hier nicht nötig.'
      : null);
  const reasonId = `guided-reason-${item.id}`;
  return (
    <article className="guided-card" aria-labelledby="guided-payee">
      <h3 id="guided-payee" ref={headingRef} tabIndex={-1} className="guided-payee">
        {item.payee}
      </h3>
      <p className="guided-amount num">{nativeCurrency(item.amountCents, item.currency)}</p>
      <dl className="guided-facts">
        <div>
          <dt>Datum</dt>
          <dd>{shortDay(item.date)}</dd>
        </div>
        <div>
          <dt>Konto</dt>
          <dd>{item.accountName}</dd>
        </div>
        <div>
          <dt>Vorschlag</dt>
          <dd>
            <span className={`bank-suggestion-pill${canConfirm ? ' is-safe' : ''}`}>
              {canConfirm ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <CircleHelp size={14} aria-hidden="true" />
              )}
              {facts?.loading ? 'Wird geprüft …' : (label ?? 'Unbekannt')}
            </span>
          </dd>
        </div>
      </dl>
      {(unknown || facts?.reason) && !facts?.loading && why && (
        <p id={reasonId} className="guided-reason">
          {why}
        </p>
      )}
      {deferredReason && <p className="guided-deferred">Zurückgestellt: {deferredReason}</p>}
      {failure && (
        <p className="guided-error" role="alert">
          {failure} Der Umsatz bleibt offen; du kannst es erneut versuchen.
        </p>
      )}
      {deferring ? (
        <fieldset className="guided-defer">
          <legend>Warum später?</legend>
          <select
            ref={reasonRef}
            className="select"
            aria-label="Grund für später"
            value={reason}
            onChange={(event) => onReason(event.target.value)}
          >
            {DEFER_REASONS.map((text) => (
              <option key={text}>{text}</option>
            ))}
          </select>
          <p>Gilt nur für diese Sitzung. Der Umsatz bleibt unter Prüfen offen.</p>
          <div className="guided-actions">
            <Button variant="ghost" onClick={onCancelDefer}>
              Abbrechen
            </Button>
            <Button onClick={onDefer}>Zurückstellen</Button>
          </div>
        </fieldset>
      ) : (
        <div className="guided-actions">
          <Button
            className="guided-confirm"
            disabled={!canConfirm}
            aria-describedby={!canConfirm && why ? reasonId : undefined}
            onClick={onConfirm}
          >
            {acting ? 'Wird bestätigt …' : 'Bestätigen'}
          </Button>
          {item.kind === 'candidate' ? (
            <BankCandidate
              key={item.id}
              id={item.refId}
              triggerLabel="Bearbeiten"
              disabled={acting}
              description={`${item.payee} · ${nativeCurrency(item.amountCents, item.currency)} · ${shortDay(item.date)} · ${item.accountName}`}
              onConfirmed={onLearn}
            />
          ) : (
            <Button variant="ghost" disabled={acting} onClick={onEdit}>
              Bearbeiten
            </Button>
          )}
          <Button data-guided-later="" variant="ghost" disabled={acting} onClick={onStartDefer}>
            Später
          </Button>
          <Button variant="ghost" disabled={acting || isFirst} onClick={onBack}>
            Zurück
          </Button>
        </div>
      )}
    </article>
  );
}

function GuidedSummary({
  resolved,
  deferred,
  remaining,
  tasksOpen,
  headingRef,
  onReview,
  onDone,
}: {
  resolved: number;
  deferred: { item: GuidedItem; reason: string }[];
  remaining: number;
  tasksOpen: number;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onReview: (id: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="guided-card guided-summary">
      <h3 ref={headingRef} tabIndex={-1} className="guided-payee">
        {remaining === 0 && deferred.length === 0 ? 'Alle Umsätze geprüft' : 'Zusammenfassung'}
      </h3>
      <dl className="guided-counts">
        <div>
          <dt>Erledigt</dt>
          <dd>{resolved}</dd>
        </div>
        <div>
          <dt>Zurückgestellt</dt>
          <dd>{deferred.length}</dd>
        </div>
        <div>
          <dt>Noch offen</dt>
          <dd>{remaining}</dd>
        </div>
      </dl>
      {deferred.length > 0 && (
        <>
          <p>Zurückgestellte Umsätze bleiben offen und sind nur in dieser Sitzung ausgeblendet.</p>
          <ul className="guided-deferred-list">
            {deferred.map(({ item, reason }) => (
              <li key={item.id}>
                <span>
                  {item.payee} · {nativeCurrency(item.amountCents, item.currency)} · {reason}
                </span>
                <Button variant="ghost" size="sm" onClick={() => onReview(item.id)}>
                  Ansehen
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="guided-actions">
        <AppLink className="btn btn-ghost" to="/konten/pruefen" search={{ teil: 'aufgaben' }}>
          Zu den Aufgaben{tasksOpen > 0 ? ` (${tasksOpen})` : ''}
        </AppLink>
        <AppLink className="btn btn-ghost" to="/">
          Zu Heute
        </AppLink>
        <Button onClick={onDone}>Fertig</Button>
      </div>
    </div>
  );
}
