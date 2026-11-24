import { lazy, Suspense, type ComponentProps } from 'react';
import type { CaptureForm as CaptureFormComponent } from './capture-form';

const Loaded = lazy(() => import('./capture-form').then((m) => ({ default: m.CaptureForm })));

/** The capture form as its own chunk: only loaded when a dialog actually shows it. */
export function CaptureForm(props: ComponentProps<typeof CaptureFormComponent>) {
  return (
    <Suspense fallback={<p role="status">Formular wird geladen …</p>}>
      <Loaded {...props} />
    </Suspense>
  );
}
