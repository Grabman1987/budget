import type { PortfolioAllocationView } from '@budget/db';
import { useAmountPrivacy } from '@budget/ui';
import { eur, longDay } from '../ledger/format';

/** Read-only cash bridge; account cash and all existing decision figures remain unchanged. */
export function TransitReconciliation({
  data,
}: {
  data: PortfolioAllocationView['cashReconciliation'];
}) {
  useAmountPrivacy();
  if (!data || data.transitCents === 0) return null;
  const money = (value: number | null) => (value === null ? 'nicht ermittelbar' : eur(value));
  return (
    <p className="vnote" data-testid="transit-reconciliation">
      Geld unterwegs: <strong>{money(data.transitCents)}</strong> · Kontogeld:{' '}
      {money(data.rawCashCents)} · Kontogeld inkl. Geld unterwegs:{' '}
      {money(data.cashIncludingTransitCents)}. Stand {longDay(data.asOf)} · Umfang:{' '}
      {data.accountIds.length} ausgewählte Konten. Kontostände bleiben unverändert.
      {data.missingFxAccountIds.length > 0 && ' Wechselkurs fehlt.'}
    </p>
  );
}
