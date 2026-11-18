import { useAmountPrivacy } from '@budget/ui';
import type { InvestableAmount } from '@budget/domain';
import { eur, longDay, MINUS } from '../ledger/format';

export type InvestableAmountRead = InvestableAmount | { unavailable: { message: string } };

export function InvestableAmountChain({ amount }: { amount: InvestableAmountRead }) {
  useAmountPrivacy();
  return (
    <section aria-label="Investierbarer Betrag" className="funding-investable">
      <h3>Investierbarer Betrag</h3>
      {'unavailable' in amount ? (
        <p>{amount.unavailable.message}</p>
      ) : (
        <dl>
          <dt>Geld auf Budgetkonten</dt>
          <dd>{eur(amount.cashCents)}</dd>
          <dt>Verpflichtungen bis Gehalt + 30 Tage (bis {longDay(amount.through)})</dt>
          <dd>
            {MINUS} {eur(amount.obligationsCents)}
          </dd>
          <dt>Gebundene Rücklagen</dt>
          <dd>
            {MINUS} {eur(amount.committedReservesCents)}
          </dd>
          <dt>Verfügbar in Bedarf/Wunsch</dt>
          <dd>
            {MINUS} {eur(amount.needWantAvailableCents)}
          </dd>
          {amount.rawCents < 0 && (
            <>
              <dt>Rechnerischer Betrag</dt>
              <dd>= {eur(amount.rawCents)}</dd>
            </>
          )}
          <dt>
            <strong>Investierbar</strong>
          </dt>
          <dd>
            <strong>
              {amount.rawCents >= 0 && '= '}
              {eur(amount.investableCents)}
            </strong>
          </dd>
        </dl>
      )}
    </section>
  );
}
