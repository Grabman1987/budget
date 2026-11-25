import { lazy, Suspense, type ComponentProps } from 'react';
import type { CaptureForm as CaptureFormComponent } from './capture-form';

// One shared load; a failed load (offline) is forgotten so the next attempt can retry.
let loading: Promise<{ CaptureForm: typeof CaptureFormComponent }> | undefined;
function loadCaptureForm() {
  loading ??= import('./capture-form').catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

// Capture must work offline (bookings are queued), so the chunk is fetched soon after start
// while the connection is still there, not only when the dialog first opens.
if (typeof window !== 'undefined') {
  const preload = () => void loadCaptureForm().catch(() => undefined);
  if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 3_000 });
  else setTimeout(preload, 1_500);
}

const Loaded = lazy(() => loadCaptureForm().then((m) => ({ default: m.CaptureForm })));

/** The capture form as its own chunk: loaded right after start and shown when a dialog opens. */
export function CaptureForm(props: ComponentProps<typeof CaptureFormComponent>) {
  return (
    <Suspense fallback={<p role="status">Formular wird geladen …</p>}>
      <Loaded {...props} />
    </Suspense>
  );
}
