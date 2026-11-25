import { lazy, Suspense, useState } from 'react';
import type { BookingPanelState } from './booking-panel';

const loadBookingPanel = () => import('./booking-panel');
const Loaded = lazy(() => loadBookingPanel().then((m) => ({ default: m.BookingPanel })));

/** Fetches the capture panel's chunk in the background (idle time). */
export const preloadBookingPanel = () => void loadBookingPanel().catch(() => undefined);

/**
 * The capture panel as its own chunk: neither mounted nor loaded before the first opening, then
 * kept mounted so closing can still animate.
 */
export function LazyBookingPanel({
  state,
  onClose,
}: {
  state: BookingPanelState;
  onClose: () => void;
}) {
  const [opened, setOpened] = useState(false);
  if (state && !opened) setOpened(true);
  return opened ? (
    <Suspense fallback={null}>
      <Loaded state={state} onClose={onClose} />
    </Suspense>
  ) : null;
}
