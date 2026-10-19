import { useEffect, useRef, useState } from 'react';

/** Track content width; optionally retain a mounted drawing through transient zero measurements. */
export function useElementWidth<T extends HTMLElement>({ retainPositive = false } = {}) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (value: number) => {
      const next = Math.floor(value);
      setWidth((previous) => (retainPositive && next <= 0 ? previous : next));
    };
    measure(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [retainPositive]);
  return [ref, width] as const;
}
