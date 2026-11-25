import { useEffect, useRef, useState } from 'react';

/** Does the element scroll sideways? A 1px tolerance absorbs sub-pixel rounding. */
export const overflowsHorizontally = (el: Pick<HTMLElement, 'scrollWidth' | 'clientWidth'>) =>
  el.scrollWidth - el.clientWidth > 1;

/**
 * Swipe hint for a horizontally scrolling table. It measures its own scroll container (the parent
 * element) and is hidden unless the content really overflows, e.g. not when the phone layout
 * hides the extra columns or the table fits.
 */
export function ScrollHint() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const container = ref.current?.parentElement;
    if (!container) return;
    const measure = () => setOverflows(overflowsHorizontally(container));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of Array.from(container.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return (
    <p ref={ref} className="table-scroll-hint" hidden={!overflows}>
      Seitlich wischen für weitere Spalten
    </p>
  );
}
