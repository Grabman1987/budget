import { useEffect } from 'react';
import { todayInVienna } from '@budget/domain';
import { onApiRead, type ApiRead } from '../api/http';
import { saveReadSnapshot, type OfflineView } from './read-snapshot-store';
import { captureTodaySection, isTodaySections } from './read-snapshot-today-sections';

/** Only completed, authorized HTTP responses qualify; query-cache/optimistic values never do. */
export function useOfflineSnapshotCapture(view: OfflineView) {
  useEffect(() => onApiRead((read) => {
    if (view === 'today' && captureTodaySection(read)) return;
    const selected = selectRead(view, read);
    if (!selected) return;
    void read.token.then((token) => {
      const snapshot = {
        view,
        params: '',
        fetchedAt: read.fetchedAt,
        data: { source: read.path, payload: structuredClone(selected) },
      };
      if (view !== 'today') return saveReadSnapshot(token, snapshot);
      return saveReadSnapshot(token, snapshot, (previous) => {
        // A section success supersedes the legacy aggregate. A late aggregate must not
        // replace it, even when the aggregate request began on a different page.
        if (previous && (isTodaySections(previous.data.payload) ||
            previous.fetchedAt >= read.fetchedAt)) return;
        return snapshot;
      });
    }).catch(() => undefined);
  }), [view]);
}

function selectRead(view: OfflineView, read: ApiRead): unknown {
  const url = new URL(read.path, window.location.origin);
  if (view === 'today' && url.pathname === '/api/heute') return read.data;
  if (view === 'accounts' && url.pathname === '/api/accounts') return read.data;
  if (view === 'bookings' && url.pathname === '/api/bookings') {
    // First page of the unfiltered latest register only. Background upcoming reads are excluded.
    const allowed = new Set(['to', 'sort', 'direction', 'limit']);
    if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return;
    if (url.searchParams.get('sort') && url.searchParams.get('sort') !== 'date') return;
    if (url.searchParams.get('direction') === 'asc') return;
    const to = url.searchParams.get('to');
    if (to && to !== todayInVienna()) return;
    return read.data;
  }
  if (view === 'plan') {
    const month = todayInVienna().slice(0, 7);
    if (url.pathname === `/api/budget/${month}`) return read.data;
    if (url.pathname === '/api/budget/months' && typeof read.data === 'object' && read.data !== null && 'months' in read.data) {
      const months = read.data.months;
      if (typeof months === 'object' && months !== null && month in months)
        return (months as Record<string, unknown>)[month];
    }
  }
}
