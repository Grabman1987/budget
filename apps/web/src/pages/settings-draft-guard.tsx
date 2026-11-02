import { useBlocker } from '@tanstack/react-router';

/** Mounted only for redesigned forms; reuse the app's navigation and unload guards. */
export function SettingsDraftGuard({ dirty, busy = false }: { dirty: boolean; busy?: boolean }) {
  useBlocker({
    shouldBlockFn: () => busy || (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')),
    enableBeforeUnload: () => dirty || busy,
  });
  return null;
}
