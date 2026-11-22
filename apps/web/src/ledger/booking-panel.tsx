import './booking-edit.css';
import { FormDialog } from '@budget/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CaptureForm } from './capture-form';
import type { ListedBooking } from './types';
import { AssignmentLearnOffer } from '../assignment/review';
import type { BookingDraft } from './booking-model';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import {
  BOOKING_RELEASE_TITLE,
  LINKED_RELEASE_TITLE,
  BookingReleaseQuestion,
} from './booking-release-question';
import { readBookingEditProtection } from './api';

export type BookingPanelState =
  | { mode: 'create'; accountId?: string | undefined; prefill?: Partial<BookingDraft> }
  | { mode: 'edit'; booking: ListedBooking }
  | null;

/** Time the dialog needs to fade out; the form stays mounted for it. */
const FADE_OUT_MS = 260;

/**
 * Buchung erfassen / bearbeiten as a centred dialog (desktop) or full-screen sheet (phone). Closing
 * with Esc, the close button or the scrim asks first when there is unsaved input.
 */
export function BookingPanel({
  state,
  onClose,
}: {
  state: BookingPanelState;
  onClose: () => void;
}) {
  const dirty = useRef(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  useEffect(() => {
    const ended = () => setSessionEnded(true);
    window.addEventListener('budget-session-expired', ended);
    return () => window.removeEventListener('budget-session-expired', ended);
  }, []);
  const [learnBookingId, setLearnBookingId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const focusScope = useRef<HTMLDivElement>(null);
  const resumeFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (state === null) return;
    // Mobile keyboards shrink/pan the visual viewport without resizing 100dvh on iOS.
    // Scope the visible bounds to this capture sheet; other dialogs keep their own geometry.
    const viewport = window.visualViewport;
    let frame = 0;
    const revealActiveField = () => {
      const active = document.activeElement;
      if (
        !REDESIGN_ENABLED ||
        !window.matchMedia('(max-width: 767px)').matches ||
        !(active instanceof HTMLElement) ||
        !focusScope.current?.contains(active)
      )
        return;
      const body = active.closest<HTMLElement>('.bk-body');
      if (!body) return;
      const form = body.closest<HTMLElement>('.bkform-redesign');
      const scroller = form && getComputedStyle(form).overflowY === 'auto' ? form : body;
      const clip = scroller.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      // Compact sheets scroll the whole form, so actions follow all fields in normal flow.
      if (box.top < clip.top) scroller.scrollTop += Math.floor(box.top - clip.top);
      else if (box.bottom > clip.bottom) scroller.scrollTop += Math.ceil(box.bottom - clip.bottom);
    };
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      focusScope.current?.style.setProperty('--bk-viewport-height', `${height}px`);
      focusScope.current?.style.setProperty('--bk-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      // Tall phones can still have more than 500px left above an open keyboard.
      const active = document.activeElement;
      const keyboardOpen =
        active instanceof HTMLElement &&
        focusScope.current?.contains(active) &&
        active.matches('input:not([type="file"]), textarea, [contenteditable="true"]') &&
        window.innerHeight - height > 150;
      focusScope.current?.toggleAttribute('data-compact-viewport', height <= 500 || keyboardOpen);
      // Compact padding/handle changes and native scroll anchoring can clip the focused row.
      // Measure after the new geometry is applied, without fighting deliberate body scrolling.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealActiveField);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const scope = focusScope.current;
    scope?.addEventListener('focusin', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      scope?.removeEventListener('focusin', update);
    };
  }, [state]);
  useEffect(() => {
    if (asking)
      focusScope.current?.querySelector<HTMLElement>('[role="alertdialog"] button')?.focus();
  }, [asking]);
  const keepEditing = () => {
    setAsking(false);
    resumeFocus.current?.focus();
  };
  // Native dialogs make the page inert, but Tab at the boundary can reach browser chrome.
  const wrapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const scope =
      focusScope.current?.querySelector('[role="alertdialog"]') ??
      focusScope.current?.querySelector('dialog[open]');
    const controls = Array.from(
      scope?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
      ) ?? [],
    ).filter((el) => el.getClientRects().length > 0 && el.tabIndex !== -1);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  // The last state is kept while the dialog fades out, then dropped so the next one starts fresh.
  const key = state === null ? null : state.mode === 'edit' ? `edit-${state.booking.id}` : 'new';
  const [shown, setShown] = useState<{
    state: NonNullable<BookingPanelState>;
    key: string;
    n: number;
    opening: symbol;
    released?: boolean;
  } | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (key !== seenKey || (state !== null && key !== null && shown === null)) {
    // Opened, or switched to another booking: a new form (also when reopened within the fade).
    setSeenKey(key);
    if (state !== null && key !== null)
      setShown({ state, key, n: (shown?.n ?? 0) + 1, opening: Symbol() });
  }
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
    if (state !== null) return;
    // Dropped after the fade, unless the dialog was opened again meanwhile.
    const timer = setTimeout(() => {
      if (latest.current === null) setShown(null);
    }, FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const current = state ?? shown?.state ?? null;
  const booking = shown?.state.mode === 'edit' ? shown.state.booking : null;
  const protectionId = booking?.id;
  const opening = shown?.opening;
  const [check, setCheck] = useState<{
    opening: symbol | undefined;
    protection: Awaited<ReturnType<typeof readBookingEditProtection>> | null;
  }>();
  const isOpen = state !== null;
  useEffect(() => {
    if (!isOpen || !protectionId) return;
    let active = true;
    void readBookingEditProtection(protectionId).then(
      (protection) => {
        if (active) setCheck({ opening, protection });
      },
      () => {
        if (active) setCheck({ opening, protection: null });
      },
    );
    return () => {
      active = false;
    };
  }, [isOpen, opening, protectionId]);
  const checking = !!protectionId && check?.opening !== opening;
  const protection = check?.opening === opening ? check?.protection : null;
  const reconciled =
    REDESIGN_ENABLED && (booking?.status === 'reconciled' || !!protection?.reconciled);
  const linkedDates = protection?.settlementDates?.length ? protection.settlementDates : undefined;
  const reviewedOn = protection?.reviewedOn ?? [];
  const needsRelease =
    !checking && (reconciled || !!linkedDates || reviewedOn.length > 0) && !shown?.released;
  useEffect(() => {
    if (needsRelease && state !== null)
      focusScope.current?.querySelector<HTMLElement>('[role="alertdialog"] button')?.focus();
  }, [needsRelease, shown?.n, state]);
  const [lastMode, setLastMode] = useState<'create' | 'edit' | null>(state?.mode ?? null);
  if (state !== null && lastMode !== state.mode) setLastMode(state.mode);
  const title = checking
    ? 'Buchung wird geprüft'
    : needsRelease
      ? linkedDates
        ? LINKED_RELEASE_TITLE
        : BOOKING_RELEASE_TITLE
      : current?.mode === 'edit'
        ? 'Buchung bearbeiten'
        : 'Buchung erfassen';
  const close = () => {
    setAsking(false);
    dirty.current = false;
    onClose();
  };
  const beforeClose = () => {
    if (needsRelease) return true;
    if (!dirty.current) return true;
    if (!asking) resumeFocus.current = document.activeElement as HTMLElement | null;
    setAsking(true);
    return false;
  };
  const dialog = (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Delegates Tab wrapping for the native dialog and its discard question.
    <div
      ref={focusScope}
      className={`bk-focus-scope${current?.mode === 'edit' ? ' bk-edit-scope' : ''}`}
      onKeyDown={wrapFocus}
    >
      <FormDialog open={state !== null} onClose={close} title={title} beforeClose={beforeClose}>
        {current &&
          shown &&
          (checking ? (
            <div className="bkform">
              <div className="bk-body" role="status">
                Buchung wird geprüft …
              </div>
            </div>
          ) : needsRelease ? (
            <div className="bkform">
              <div className="bk-body">
                <BookingReleaseQuestion
                  className="kdiff kdelete-question bk-release-opening"
                  onCancel={close}
                  onConfirm={() => setShown({ ...shown, released: true })}
                  {...(linkedDates ? { linkedDates } : {})}
                  reconciled={reconciled}
                  relatedReconciliation={reconciled && booking?.status !== 'reconciled'}
                  reconciliationDates={protection?.reconciliationDates ?? []}
                  reconciledRepayment={!!protection?.reconciledRepayment}
                  reviewedOn={reviewedOn}
                />
              </div>
            </div>
          ) : (
            <CaptureForm
              key={`${shown.n}-${shown.key}`}
              state={current}
              initialUnlockReconciled={
                (reconciled || reviewedOn.length > 0) && Boolean(shown.released)
              }
              initialUnlockContactLinked={!!linkedDates && Boolean(shown.released)}
              initialUnlockLinkedRepayment={
                !!protection?.reconciledRepayment && Boolean(shown.released)
              }
              onDone={close}
              onBankCategorized={setLearnBookingId}
              dirtyRef={dirty}
              requestClose={() => beforeClose() && close()}
              discard={{ asking, keep: keepEditing, discard: close }}
            />
          ))}
      </FormDialog>
    </div>
  );
  // Keep a closed capture's portal and toast host in place after the form's fade. A toast raised
  // there can return to that same host when capture reopens; edits remain inside live pages.
  if (sessionEnded) return null;
  return (
    <>
      {!state && learnBookingId && (
        <aside role="status">
          <AssignmentLearnOffer bookingId={learnBookingId} />
        </aside>
      )}
      {(current?.mode ?? lastMode) === 'create' ? createPortal(dialog, document.body) : dialog}
    </>
  );
}
