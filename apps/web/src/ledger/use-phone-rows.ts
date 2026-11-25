import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';
const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Phone layout (below 768 px) for register rows; false where matchMedia is missing (unit tests). */
export function usePhoneRows(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (!supported()) return () => undefined;
      const list = window.matchMedia(QUERY);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => (supported() ? window.matchMedia(QUERY).matches : false),
    () => false,
  );
}
