import { useEffect, useState } from 'react';

/** Native show/hide also respects reduced motion: there is no slide or animation. */
export function useFabVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    let previous = Math.max(0, window.scrollY);
    const onScroll = () => {
      // Clamp rubber-band overscroll at the top; stationary events keep the current state.
      const next = Math.max(0, window.scrollY);
      if (next !== previous) setVisible(next < previous || next === 0);
      previous = next;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return visible;
}
