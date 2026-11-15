/** Keeps keyboard focus on the same page control when it moves between header and body. */
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const ROOTS = '.page-header-controls, .page-controls-row';
let pending: number | undefined;

/** Remembers which control (by order inside its container) holds focus, if any. */
export function captureControlsFocus(): void {
  const active = document.activeElement;
  const root = active?.closest(ROOTS);
  if (!active || !root) return;
  const index = Array.from(root.querySelectorAll(FOCUSABLE)).indexOf(active);
  if (index >= 0) pending = index;
}

/** Restores the remembered control inside `root` once the controls have re-rendered there. */
export function restoreControlsFocus(root: Element | null): void {
  if (pending === undefined || !root) return;
  const target = root.querySelectorAll<HTMLElement>(FOCUSABLE)[pending];
  if (!target) return;
  pending = undefined;
  target.focus({ preventScroll: true });
}
