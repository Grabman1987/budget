import { Button } from '@budget/ui';
import { useEffect, useRef } from 'react';

export function LoadOlder({
  fetching,
  failed,
  load,
}: {
  fetching: boolean;
  failed: boolean;
  load: () => Promise<unknown>;
}) {
  const sentinel = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (fetching || failed || !sentinel.current || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [fetching, failed, load]);
  return (
    <p ref={sentinel}>
      <Button variant="ghost" disabled={fetching} onClick={() => void load()}>
        Weitere Buchungen laden
      </Button>
    </p>
  );
}
