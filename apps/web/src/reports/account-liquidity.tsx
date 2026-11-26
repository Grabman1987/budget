import { cents, formatDecimal, type AccountLiquidityResult } from '@budget/domain';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { Fragment, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { ReportTable } from './report-table';
import type { BookingPanelState } from '../ledger/booking-panel';
import { LazyBookingPanel } from '../ledger/booking-panel-lazy';
import { eur, shortDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import './account-liquidity.css';

/** Conservative cash paths drive actions; expected receipts remain a labelled forecast. */
export function AccountLiquidityAlerts({
  result,
  today,
}: {
  result: AccountLiquidityResult | null | undefined;
  today: string;
}) {
  useAmountPrivacy();
  const [draft, setDraft] = useState<BookingPanelState>(null);
  if (result?.incomplete)
    return (
      <p className="account-liquidity-alerts" role="alert">
        Kontoliquidität unvollständig: Wechselkurs fehlt.
      </p>
    );
  const accounts = result?.withoutExpectedInflows.accounts.filter((a) => a.paymentAccount) ?? [];
  const short = accounts
    .filter(
      (account) =>
        account.firstBelowZero &&
        (!account.nextSafeInflowDay || account.firstBelowZero.day < account.nextSafeInflowDay),
    )
    .sort(
      (a, b) =>
        a.firstBelowZero!.day.localeCompare(b.firstBelowZero!.day) ||
        a.accountId.localeCompare(b.accountId),
    );
  if (short.length === 0) return null;
  return (
    <section className="account-liquidity-alerts" aria-label="Konten mit Engpass">
      {short.slice(0, 1).map((account) => {
        const source = accounts
          .filter((other) => other.accountId !== account.accountId)
          .map((other) => ({
            ...other,
            free: Math.max(0, other.low.cents - (other.bufferCents ?? 0)),
          }))
          .sort((a, b) => b.free - a.free || a.accountId.localeCompare(b.accountId))[0];
        const low = account.lowBeforeSafeInflow!;
        return (
          <div className="account-liquidity-alert" key={account.accountId}>
            <p>
              <TriangleAlert size={16} aria-hidden="true" />
              Konto {maskMoneyText(account.name)} rutscht am {shortDay(account.firstBelowZero!.day)}{' '}
              auf {eur(account.firstBelowZero!.cents)}
              {account.nextSafeInflowDay
                ? ` · bis zum nächsten sicheren Eingang am ${shortDay(account.nextSafeInflowDay)}`
                : ` · ohne sicheren Eingang bis ${shortDay(account.days.at(-1)!.day)}`}
            </p>
            <Button
              variant="ghost"
              disabled={!source || source.free <= 0}
              onClick={() =>
                source &&
                setDraft({
                  mode: 'create',
                  prefill: {
                    kind: 'transfer',
                    accountId: source.accountId,
                    toAccountId: account.accountId,
                    amount: formatDecimal(cents(Math.min(source.free, -low.cents))),
                    date: today,
                  },
                })
              }
            >
              Umbuchung vorbereiten
            </Button>
          </div>
        );
      })}
      <LazyBookingPanel state={draft} onClose={() => setDraft(null)} />
    </section>
  );
}

export function AccountLiquidityTable({
  result,
}: {
  result: AccountLiquidityResult | null | undefined;
}) {
  useAmountPrivacy();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!result) return null;
  if (result.incomplete)
    return (
      <section className="account-liquidity card rf-wide" aria-labelledby="account-liquidity-title">
        <h2 id="account-liquidity-title">Liquidität je Konto</h2>
        <p role="alert">Kontoliquidität unvollständig: Wechselkurs fehlt.</p>
      </section>
    );
  const accounts = result.withoutExpectedInflows.accounts;
  return (
    <section className="account-liquidity card rf-wide" aria-labelledby="account-liquidity-title">
      <h2 id="account-liquidity-title">Liquidität je Konto</h2>
      <p>
        Bis Gehalt + 30 Tage · ohne erwartete Eingänge · ohne Stellschrauben. Dispo ist kein
        Guthaben.
      </p>
      <ReportTable
        caption="Tagesendstände je Zahlungskonto ohne erwartete Eingänge"
        regionLabel="Kontoliquidität im Detail"
      >
        <thead>
          <tr>
            <th>Konto</th>
            <th>Stand heute</th>
            <th>Tiefster Stand</th>
            <th>Tiefpunkt am</th>
            <th>Engpass ab</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const forecast = result.withExpectedInflows.accounts.find(
              (row) => row.accountId === account.accountId,
            );
            const open = expanded === account.accountId;
            return (
              <Fragment key={account.accountId}>
                <tr>
                  <td data-label="Konto">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`account-low-${account.accountId}`}
                      onClick={() => setExpanded(open ? null : account.accountId)}
                    >
                      {maskMoneyText(account.name)}
                      {!account.paymentAccount && ' (kein Zahlungskonto)'}
                    </button>
                  </td>
                  <td data-label="Stand heute">{eur(account.balanceTodayCents)}</td>
                  <td data-label="Tiefster Stand">{eur(account.low.cents)}</td>
                  <td data-label="Tiefpunkt am">{shortDay(account.low.day)}</td>
                  {account.paymentAccount ? (
                    <td data-label="Engpass ab">
                      {account.firstBelowZero ? shortDay(account.firstBelowZero.day) : '–'}
                    </td>
                  ) : (
                    // A credit card is no payment account: no shortfall is reported for it.
                    <td className="account-liquidity-na">–</td>
                  )}
                </tr>
                <tr
                  id={`account-low-${account.accountId}`}
                  hidden={!open}
                  className="account-liquidity-detail"
                >
                  <td colSpan={5}>
                    <p>
                      Prognose mit erwarteten Eingängen: Tiefpunkt{' '}
                      {forecast
                        ? `${eur(forecast.low.cents)} am ${shortDay(forecast.low.day)}`
                        : 'nicht verfügbar'}
                      . Erwartete Einnahmen zählen nicht als verfügbar.
                    </p>
                    <h3>Zahlungen bis zum Tiefpunkt</h3>
                    {account.payments.length ? (
                      <ul>
                        {account.payments.map((payment, index) => (
                          <li key={`${payment.day}-${index}`}>
                            {shortDay(payment.day)} · {maskMoneyText(payment.label ?? 'Zahlung')} ·{' '}
                            {eur(payment.cents)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Keine zugeordneten Zahlungen bis zum Tiefpunkt.</p>
                    )}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </ReportTable>
      <h3>Zahlungen ohne Konto</h3>
      <p>Im Haushalt enthalten, keinem Konto belastet.</p>
      {result.unassignedPayments.length ? (
        <ul className="account-liquidity-unassigned">
          {result.unassignedPayments.map((payment, index) => (
            <li key={`${payment.day}-${index}`}>
              <span>
                {shortDay(payment.day)} · {maskMoneyText(payment.label ?? 'Zahlung')} ·{' '}
                {eur(payment.cents)}
              </span>
              {payment.ref && (
                <AppLink to={`/plan/erwartet/${encodeURIComponent(payment.ref.paymentId)}`}>
                  Zahlung bearbeiten
                </AppLink>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Keine Zahlungen ohne Konto.</p>
      )}
      {result.variableSpendingUnassigned && (
        <p>Die variable Monatsplanung ist keinem Konto zugeordnet und nur im Haushalt enthalten.</p>
      )}
    </section>
  );
}
