import { cents, formatDecimal, type AccountLiquidityResult } from '@budget/domain';
import { Button, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { Fragment, useState } from 'react';
import { BookingPanel, type BookingPanelState } from '../ledger/booking-panel';
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
  const accounts = result?.withoutExpectedInflows.accounts ?? [];
  const short = accounts.filter(
    (account) =>
      account.paymentAccount &&
      account.firstBelowZero &&
      (!account.nextSafeInflowDay || account.firstBelowZero.day < account.nextSafeInflowDay),
  );
  if (short.length === 0) return null;
  return (
    <section className="account-liquidity-alerts" aria-label="Konten mit Engpass">
      {short.map((account) => {
        const source = accounts
          .filter((other) => other.paymentAccount && other.accountId !== account.accountId)
          .map((other) => ({
            ...other,
            free: Math.max(0, other.low.cents - (other.bufferCents ?? 0)),
          }))
          .sort((a, b) => b.free - a.free || a.accountId.localeCompare(b.accountId))[0];
        const low = account.lowBeforeSafeInflow;
        return (
          <div className="account-liquidity-alert" key={account.accountId} role="alert">
            <p>
              Konto {maskMoneyText(account.name)} rutscht am {shortDay(account.firstBelowZero!.day)}{' '}
              auf {eur(account.firstBelowZero!.cents)}
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
            {source && source.free > 0 && source.free < -low.cents && (
              <small>
                Auf {maskMoneyText(source.name)} sind nur {eur(source.free)} frei; für den Engpass
                fehlen {eur(-low.cents)}. Prüfe die Umbuchung vor dem Speichern.
              </small>
            )}
            {(!source || source.free <= 0) && (
              <small>Kein freier Betrag auf einem anderen Zahlungskonto.</small>
            )}
          </div>
        );
      })}
      <BookingPanel state={draft} onClose={() => setDraft(null)} />
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
        Bis Gehalt + 30 Tage · ohne erwartete Einnahmen · ohne Stellschrauben. Dispo ist kein
        Guthaben.
      </p>
      <table>
        <caption className="sr-only">
          Tagesendstände je Zahlungskonto ohne erwartete Einnahmen
        </caption>
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
                  <td data-label="Engpass ab">
                    {account.firstBelowZero ? shortDay(account.firstBelowZero.day) : '–'}
                  </td>
                </tr>
                <tr
                  id={`account-low-${account.accountId}`}
                  hidden={!open}
                  className="account-liquidity-detail"
                >
                  <td colSpan={5}>
                    <p>
                      Prognose mit erwarteten Einnahmen: Tiefpunkt{' '}
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
      </table>
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
