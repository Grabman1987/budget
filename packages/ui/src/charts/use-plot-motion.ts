import { useEffect, type RefObject } from 'react';

/** Claim the first chart once per page and tab session. Storage denial means no animation. */
export function usePlotMotion(ref: RefObject<SVGSVGElement | null>, enabled = true) {
  useEffect(() => {
    const chart = ref.current;
    if (!enabled) chart?.classList.remove('plot-first');
    if (
      !enabled ||
      !chart ||
      chart !== document.querySelector('svg.chart, .chain-drawing.is-open .chain-svg')
    )
      return;
    try {
      const key = `budget:plot-visited:${window.location.pathname}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      chart.classList.add('plot-first');
    } catch {
      // Charts remain immediately visible when storage is blocked.
    }
  }, [ref, enabled]);
}
