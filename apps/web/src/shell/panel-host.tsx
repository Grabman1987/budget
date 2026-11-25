import { useLocation, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { LazyBookingPanel, preloadBookingPanel } from '../ledger/booking-panel-lazy';
import type { PanelSearch } from './panel-state';
import { type PanelId } from './panels';

// The capture form (the largest editor) and the settings panels load when a panel is first
// opened; `preloadPanels` fetches them when the browser is idle so opening stays instant.
const loadAssetClassPanel = () => import('../pages/asset-classes-settings');
const AssetClassSettingsPanel = lazy(() =>
  loadAssetClassPanel().then((m) => ({ default: m.AssetClassSettingsPanel })),
);

/** Loads the panel chunks in the background (idle time), never on the start page's critical path. */
export function preloadPanels(): () => void {
  const run = () => {
    preloadBookingPanel();
    void loadAssetClassPanel().catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: 5000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 2000);
  return () => clearTimeout(handle);
}

/**
 * Existing input editors driven by `?panel=`. The state lives in the URL,
 * so panels are linkable and the browser back button closes them. Esc closes; the native dialog
 * returns focus to the trigger.
 */
export function PanelHost() {
  const router = useRouter();
  const navigate = useNavigate();
  const { panel } = useSearch({ strict: false }) as PanelSearch;
  // Keep the last panel while it animates out.
  const [shown, setShown] = useState<PanelId>('buchung');
  if (panel && panel !== shown) setShown(panel);
  // Closing a confirmed form must not wait for the navigation's session/read guards.
  const [closing, setClosing] = useState<PanelId>();
  // The closed capture dialog is not mounted (nor its chunk loaded) before the first opening.
  const [opened, setOpened] = useState(false);
  if (panel && !opened) setOpened(true);
  if (closing && panel !== closing) setClosing(undefined);
  // Looking at an account: a new booking starts on it.
  const { id } = useParams({ strict: false }) as { id?: string };
  const pathname = useLocation({ select: (location) => location.pathname });
  const accountId = id && pathname === `/konten/${id}` ? id : undefined;

  const openedInApp = useLocation({
    select: (location) => location.state.panelOpenedInApp === true,
  });

  const close = () => {
    if (panel === undefined || closing === panel) return; // already closing or closed
    setClosing(panel);
    if (openedInApp) {
      router.history.back();
    } else {
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, panel: undefined })) as never,
        replace: true,
      });
    }
  };

  // "+ Buchung": the capture panel (P2b), with its own URL (`?panel=buchung`).
  if (shown === 'buchung') {
    return (
      <LazyBookingPanel
        state={panel === 'buchung' && closing !== panel ? { mode: 'create', accountId } : null}
        onClose={close}
      />
    );
  }

  if (shown === 'posteingang') return null;
  if (
    [
      'anlageklasse',
      'anlagegruppe',
      'sollquoten',
      'anlageklasse-archivieren',
      'instrument',
    ].includes(shown)
  )
    return opened ? (
      <Suspense fallback={null}>
        <AssetClassSettingsPanel open={panel === shown} onClose={close} mode={shown} />
      </Suspense>
    ) : null;
  return null;
}
