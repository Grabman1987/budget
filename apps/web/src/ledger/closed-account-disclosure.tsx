import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { Link } from '@tanstack/react-router';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { eur, longDay } from './format';
import { accountValueEur, valuationMissingText } from './labels';
import { overviewModel } from './overview-model';
import type { AccountRow } from './types';
import './closed-account-disclosure.css';

function RetainedValue({ account }: { account: AccountRow }) {
  const value = accountValueEur(account);
  return (
    <span>
      {value === null
        ? `Nicht verfügbar · ${valuationMissingText(account)}`
        : value === 0
          ? `Kein Restwert · ${eur(0)}`
          : `Restwert · ${eur(value)}`}
    </span>
  );
}

/** Presentation only: uses the retained account read, including unavailable valuations. */
export function ClosedAccountNotice({ account }: { account: AccountRow }) {
  useAmountPrivacy();
  if (!REDESIGN_ENABLED || !account.closedAt) return null;
  return (
    <aside className="closed-account-disclosure" aria-label="Geschlossenes Konto">
      <p>
        Geschlossen am {longDay(account.closedAt)} · <RetainedValue account={account} />
      </p>
      <p>
        Der vorhandene Wert bleibt im Nettovermögen enthalten. Buchungen und Verlauf bleiben
        erhalten.
      </p>
    </aside>
  );
}

/** Also mountable by Heute's owner with the accounts from its same-date canonical read. */
export function ClosedAccountDisclosure({
  accounts,
  asOf,
}: {
  accounts: ReadonlyArray<AccountRow>;
  asOf: string;
}) {
  useAmountPrivacy();
  if (!REDESIGN_ENABLED) return null;
  const model = overviewModel(accounts);
  if (model.closed.length === 0) return null;
  return (
    <details className="closed-account-disclosure">
      <summary>Geschlossene Konten · Restwerte im Nettovermögen</summary>
      <p>
        Stand {longDay(asOf)}. Geschlossene Konten bleiben mit ihrem vorhandenen Wert im
        unveränderten Nettovermögen enthalten.
      </p>
      <dl>
        <div>
          <dt>Nettovermögen einschließlich geschlossener Konten</dt>
          <dd>{model.netWorthCents === null ? 'Nicht verfügbar' : eur(model.netWorthCents)}</dd>
        </div>
        <div>
          <dt>Davon geschlossene Konten</dt>
          <dd>
            {model.closedValueCents === null ? 'Nicht verfügbar' : eur(model.closedValueCents)}
          </dd>
        </div>
      </dl>
      <ul>
        {model.closed.map((account) => (
          <li key={account.id}>
            <Link to="/konten/$id" params={{ id: account.id }}>
              {maskMoneyText(account.name)}
            </Link>
            <RetainedValue account={account} />
          </li>
        ))}
      </ul>
    </details>
  );
}
