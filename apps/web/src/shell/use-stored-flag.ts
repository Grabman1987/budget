import { useCallback, useState } from 'react';

/** Boolean flag remembered in localStorage (failures are ignored: private mode, blocked storage). */
export function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        if (next) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      } catch {
        // Not persisted.
      }
    },
    [key],
  );
  return [value, set];
}
