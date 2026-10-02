import { FormDialog } from '@budget/ui';
import { useEffect, useRef, useState } from 'react';
import { CaptureForm } from './capture-form';
import type { ListedBooking } from './types';
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
  const [asking, setAsking] = useState(false);
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
    setAsking(true);
    return false;
  };
  return (
    <FormDialog open={state !== null} onClose={close} title={title} beforeClose={beforeClose}>
      {current && shown && (
        <CaptureForm
          key={`${shown.n}-${shown.key}`}
          state={current}
          onDone={close}
          dirtyRef={dirty}
          requestClose={() => beforeClose() && close()}
          discard={{ asking, keep: () => setAsking(false), discard: close }}
        />
      )}
    </FormDialog>
  );
}
