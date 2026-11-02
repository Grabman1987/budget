import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import type { Ref } from 'react';
import { eur, longDay } from '../ledger/format';
import { LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import type { Heute, HeutePeriod } from './api';

type Context = { monat: string; period: HeutePeriod };
type Basis = Heute['investmentBasis'];
const amount = (basis: Basis) =>
  basis && !('unavailable' in basis) && basis.investedCents !== null
    ? eur(basis.investedCents)
    : 'Nicht verfügbar';

export function InvestmentBasisSummary({ basis, search }: { basis: Basis; search: Context }) {
  useAmountPrivacy();
  return (
    <section aria-label="Investiert · Anlagebasis" className="heute-note">
      <p>
        Investiert <strong>{amount(basis)}</strong>
        {' · '}
        <AppLink
          to="/heute/details/invested"
          search={search}
          hash="anlagebasis"
          aria-label="Quelle der Anlagebasis"
        >
          Anlagebasis ansehen
        </AppLink>
      </p>
      <p>
        {basis
          ? `Ausgewählte Anlagebasis · Stand ${longDay(basis.asOf)}`
          : 'Anlagebasis ist in diesem Stand nicht verfügbar.'}
      </p>
    </section>
  );
}

export function InvestmentBasisDetails({
  basis,
  search,
  headingRef,
  pending,
}: {
  basis: Basis;
  search: Context;
  headingRef: Ref<HTMLHeadingElement>;
  pending: boolean;
}) {
  useAmountPrivacy();
  return (
    <section
      id="anlagebasis"
      className="card heute-dimension"
      aria-labelledby="anlagebasis-title"
      aria-busy={pending || undefined}
    >
      <h2 id="anlagebasis-title" ref={headingRef} tabIndex={-1}>
        Investiert · Anlagebasis
      </h2>
      {pending ? (
        <LoadingNote what="Anlagebasis" />
      ) : (
        <>
          <p>
            Investiert <strong>{amount(basis)}</strong>
          </p>
          {basis ? (
            <p>
              Stand {longDay(basis.asOf)} · aktuelle ausgewählte Anlagebasis, mit
              vorzeichenbehafteten Beiträgen.
            </p>
          ) : (
            <p>Anlagebasis ist in diesem Stand nicht verfügbar.</p>
          )}
          {basis && 'unavailable' in basis && <p>{maskMoneyText(basis.unavailable.message)}</p>}
          {basis && !('unavailable' in basis) && (
            <>
              <p>
                Beitrag zur Anlagebasis je ausgewähltem Konto; dies ist nicht zwingend der gesamte
                Kontowert. Die positive Anlagenposition der Vermögenskette hat einen anderen Umfang.
              </p>
              {basis.accounts.length ? (
                <ul>
                  {basis.accounts.map((account) => (
                    <li key={account.id}>
                      <AppLink to={`/konten/${encodeURIComponent(account.id)}`} search={search}>
                        {account.name}
                      </AppLink>
                      {' · '}
                      <span>Beitrag zur Anlagebasis: </span>
                      <strong>
                        {account.valueCents === null ? 'Nicht verfügbar' : eur(account.valueCents)}
                      </strong>
                      {account.missingPrice && <span> · Kurs fehlt.</span>}
                      {account.missingFxCurrencies.length > 0 && (
                        <span> · Wechselkurs fehlt: {account.missingFxCurrencies.join(', ')}.</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Keine Konten in der ausgewählten Anlagebasis.</p>
              )}
            </>
          )}
          <p>
            <AppLink to="/vermoegen/freiheit" search={search}>
              Freiheit vergleichen
            </AppLink>
            {' · '}
            <AppLink to="/vermoegen/portfolio/allokation" search={search}>
              Allokation vergleichen
            </AppLink>
          </p>
        </>
      )}
    </section>
  );
}
