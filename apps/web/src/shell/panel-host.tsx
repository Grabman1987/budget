import { DetailPanel } from '@budget/ui';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { consumePanelOpenedInApp, resetPanelOpenedInApp, type PanelSearch } from './panel-state';
import { PANELS, type PanelId } from './panels';

/**
 * Side panel (desktop) or bottom sheet (phone), driven by `?panel=`. The state lives in the URL,
 * so panels are linkable and the browser back button closes them. Esc closes; the native dialog
 * returns focus to the trigger.
 */
export function PanelHost() {
  const router = useRouter();
  const navigate = useNavigate();
  const { panel } = useSearch({ strict: false }) as PanelSearch;
  // Keep the last panel while it animates out.
  const [shown, setShown] = useState<PanelId>('beispiel');
  if (panel && panel !== shown) setShown(panel);
  const def = PANELS[shown];

  useEffect(() => {
    if (!panel) resetPanelOpenedInApp();
  }, [panel]);

  const close = () => {
    if (panel === undefined) return; // already closed (e.g. by the back button)
    if (consumePanelOpenedInApp()) {
      router.history.back();
    } else {
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, panel: undefined })) as never,
        replace: true,
      });
    }
  };

  return (
    <DetailPanel open={panel !== undefined} onClose={close} title={def.title}>
      <p>{def.body}</p>
      <p className="text-muted">Wird gefüllt in {def.fills}.</p>
    </DetailPanel>
  );
}
