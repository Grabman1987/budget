import { FormDialog } from '@budget/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CaptureForm } from './capture-form';
import type { ListedBooking } from './types';
import { AssignmentLearnOffer } from '../assignment/review';
import type { BookingDraft } from './booking-model';

export type BookingPanelState =
  | { mode: 'create'; accountId?: string | undefined; prefill?: Partial<BookingDraft> }
  | { mode: 'edit'; booking: ListedBooking }
  | null;

/** Time the dialog needs to fade out; the form stays mounted for it. */
const FADE_OUT_MS = 260;

/**
 * Buchung erfassen / bearbeiten as a centred dialog (desktop) or bottom sheet (phone). Closing
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
  const [learnBookingId, setLearnBookingId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const focusScope = useRef<HTMLDivElement>(null);
  const resumeFocus = useRef<HTMLElement | null>(null);
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
    const scope = asking
      ? focusScope.current?.querySelector('[role="alertdialog"]')
      : focusScope.current?.querySelector('dialog[open]');
    const controls = Array.from(
      scope?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
      ) ?? [],
    ).filter((el) => el.getClientRects().length > 0);
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
  } | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (key !== seenKey || (state !== null && key !== null && shown === null)) {
    // Opened, or switched to another booking: a new form (also when reopened within the fade).
    setSeenKey(key);
    if (state !== null && key !== null) setShown({ state, key, n: (shown?.n ?? 0) + 1 });
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
  const title = current?.mode === 'edit' ? 'Buchung bearbeiten' : 'Buchung erfassen';
  const close = () => {
    setAsking(false);
    dirty.current = false;
    onClose();
  };
  const beforeClose = () => {
    if (!dirty.current) return true;
    if (!asking) resumeFocus.current = document.activeElement as HTMLElement | null;
    setAsking(true);
    return false;
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Delegates Tab wrapping for the native dialog and its discard question.
    <div ref={focusScope} className="bk-focus-scope" onKeyDown={wrapFocus}>
      {!state && learnBookingId && (
        <aside role="status">
          <AssignmentLearnOffer bookingId={learnBookingId} />
        </aside>
      )}
      <FormDialog open={state !== null} onClose={close} title={title} beforeClose={beforeClose}>
        {current && shown && (
          <CaptureForm
            key={`${shown.n}-${shown.key}`}
            state={current}
            onDone={close}
            onBankCategorized={setLearnBookingId}
            dirtyRef={dirty}
            requestClose={() => beforeClose() && close()}
            discard={{ asking, keep: keepEditing, discard: close }}
          />
        )}
      </FormDialog>
    </div>
  );
}
