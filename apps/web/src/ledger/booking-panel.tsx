import { DetailPanel } from '@budget/ui';
import { useRef, useState } from 'react';
import { CaptureForm } from './capture-form';
import type { ListedBooking } from './types';

export type BookingPanelState =
  | { mode: 'create'; accountId?: string | undefined }
  | { mode: 'edit'; booking: ListedBooking }
  | null;

/**
 * Buchung erfassen / bearbeiten in the side panel (desktop) or bottom sheet (phone). Closing with
 * Esc, the close button or the backdrop asks first when there is unsaved input.
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
  const title = state?.mode === 'edit' ? 'Buchung bearbeiten' : 'Buchung erfassen';
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
    <DetailPanel open={state !== null} onClose={close} title={title} beforeClose={beforeClose}>
      {state && (
        <CaptureForm
          key={state.mode === 'edit' ? state.booking.id : 'new'}
          state={state}
          onDone={close}
          dirtyRef={dirty}
          requestClose={() => beforeClose() && close()}
          discard={{ asking, keep: () => setAsking(false), discard: close }}
        />
      )}
    </DetailPanel>
  );
}
