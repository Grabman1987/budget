import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/** Downward travel before the FAB hides, so small or programmatic scrolls keep it in place. */
const HIDE_AFTER_PX = 48;
/** Within this distance of the page end the FAB shows again; pages reserve room for it there. */
const END_SLACK_PX = 24;

/**
 * Phone FAB: hides after a deliberate scroll down, shows on any scroll up, at the page end and
 * after a route change. Native show/hide also respects reduced motion: there is no slide.
 */
export function useFabVisible(): boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    let previous = Math.max(0, window.scrollY);
    let travelled = 0;
    const onScroll = () => {
      // Clamp rubber-band overscroll at the top; stationary events keep the current state.
      const next = Math.max(0, window.scrollY);
      const atEnd =
        window.innerHeight + next >= document.documentElement.scrollHeight - END_SLACK_PX;
      if (next < previous || next === 0 || atEnd) {
        travelled = 0;
        setVisible(true);
      } else if (next > previous) {
        travelled += next - previous;
        if (travelled >= HIDE_AFTER_PX) setVisible(false);
      }
      previous = next;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);
  return visible;
}
