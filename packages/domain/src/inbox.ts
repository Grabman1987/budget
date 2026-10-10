export type InboxPeriod = 'all' | 'current' | 'historical';

type DatedTask = { type: string; date?: string; month?: string; createdAt?: string };

/** Open work belongs to its booking/proposal month, or a stored warning's creation month. */
export function inboxMatchesPeriod(item: DatedTask, period: InboxPeriod, asOf: string): boolean {
  if (period === 'all') return true;
  const month = (item.date ?? item.month ?? item.createdAt ?? asOf).slice(0, 7);
  return period === 'historical' ? month < asOf.slice(0, 7) : month >= asOf.slice(0, 7);
}

/** Only data checks share causes. Different sources and unknown raw details stay separate. */
export function inboxCause(item: {
  type: string;
  kind: string;
  title?: string;
  detail?: string | null;
  refType?: string | null;
  refId?: string | null;
}): string | null {
  if (item.type !== 'stored' || item.kind !== 'import') return null;
  let reason: string | undefined;
  try {
    const detail: unknown = JSON.parse(item.detail ?? 'null');
    if (detail && typeof detail === 'object') {
      const value = detail as Record<string, unknown>;
      const code = value['reason'] ?? value['category'];
      if (typeof code === 'string') reason = code;
    }
  } catch {
    /* Legacy text is grouped only when identical. */
  }
  return JSON.stringify([
    item.refType,
    item.refId,
    reason ?? item.title,
    reason ? null : item.detail,
  ]);
}
