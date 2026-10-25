import { useCallback, useState } from 'react';

export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 360;
export const SIDEBAR_WIDTH_DEFAULT = 236;
const SIDEBAR_WIDTH_KEY = 'budget-sidebar-width';

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

function readSidebarWidth(): number {
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored === null || !/^\d+$/.test(stored)) return SIDEBAR_WIDTH_DEFAULT;
    const width = Number(stored);
    return Number.isSafeInteger(width) ? clampSidebarWidth(width) : SIDEBAR_WIDTH_DEFAULT;
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

export function useSidebarWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(readSidebarWidth);
  const update = useCallback((next: number) => {
    const bounded = clampSidebarWidth(next);
    setWidth(bounded);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(bounded));
    } catch {
      // Not persisted.
    }
  }, []);
  return [width, update];
}
