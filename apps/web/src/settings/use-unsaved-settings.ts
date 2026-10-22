import { useBlocker } from '@tanstack/react-router';

/** Relocation retains explicit form saves; navigation must not silently discard a draft. */
export function useUnsavedSettings(dirty: boolean, busy: boolean) {
  useBlocker({
    shouldBlockFn: () => busy || (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen und die Seite verlassen?')),
    enableBeforeUnload: () => dirty || busy,
  });
}
