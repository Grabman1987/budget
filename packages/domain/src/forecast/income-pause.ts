/** A resolved scheduled occurrence before it enters a shared cash forecast. */
export interface IncomePauseOccurrence {
  expectedPaymentId: string;
  dueDate: string;
  kind: 'inflow' | 'outflow';
  /** Original scheduled currency, before any caller-side FX conversion. */
  currency: string;
  amountCents: number;
}

/** A caller-validated inclusive date interval for one active recurring income source. */
export interface IncomePause {
  expectedPaymentId: string;
  startDate: string;
  endDate: string;
}

/**
 * Returns the amount that enters a shared cash forecast for this resolved occurrence.
 * The caller validates the ISO dates, active recurring source and pause interval before calling.
 */
export function incomePauseAmount(occurrence: IncomePauseOccurrence, pause: IncomePause): number {
  if (
    occurrence.expectedPaymentId === pause.expectedPaymentId &&
    occurrence.kind === 'inflow' &&
    occurrence.currency === 'EUR' &&
    occurrence.dueDate >= pause.startDate &&
    occurrence.dueDate <= pause.endDate
  ) {
    return 0;
  }

  return occurrence.amountCents;
}
