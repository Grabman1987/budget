import { useLocation, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { BookingPanel } from '../ledger/booking-panel';
import type { PanelSearch } from './panel-state';
import { type PanelId } from './panels';
import { AssetClassSettingsPanel } from '../pages/asset-classes-settings';

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
  // Looking at an account: a new booking starts on it.
  const { id } = useParams({ strict: false }) as { id?: string };
  const pathname = useLocation({ select: (location) => location.pathname });
  const accountId = id && pathname === `/konten/${id}` ? id : undefined;

  const openedInApp = useLocation({
    select: (location) => location.state.panelOpenedInApp === true,
  });

  const close = () => {
    if (panel === undefined) return; // already closed (e.g. by the back button)
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
      <BookingPanel
        state={panel === 'buchung' ? { mode: 'create', accountId } : null}
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
    return <AssetClassSettingsPanel open={panel === shown} onClose={close} mode={shown} />;
  return null;
}
