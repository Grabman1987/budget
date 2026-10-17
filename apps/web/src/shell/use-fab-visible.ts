import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/** Downward travel before the FAB hides, so small or programmatic scrolls keep it in place. */
const HIDE_AFTER_PX = 48;

/**
 * Phone FAB: hides after a deliberate scroll down, shows on any scroll up and after a route
 * change; pages reserve room for it at their end. Native show/hide also respects reduced motion:
 * there is no slide.
 */
export function useFabVisible(): boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Keyed by path so a new page renders the FAB at once, without a state reset in the effect.
  const [hiddenOn, setHiddenOn] = useState<string | null>(null);
  useEffect(() => {
    let previous = Math.max(0, window.scrollY);
    let travelled = 0;
    const onScroll = () => {
      // Clamp rubber-band overscroll at the top; stationary events keep the current state.
      const next = Math.max(0, window.scrollY);
      if (next < previous || next === 0) {
        travelled = 0;
        setHiddenOn(null);
      } else if (next > previous) {
        travelled += next - previous;
        if (travelled >= HIDE_AFTER_PX) setHiddenOn(pathname);
      }
      previous = next;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      setHiddenOn(null);
    };
  }, [pathname]);
  return hiddenOn !== pathname;
}
