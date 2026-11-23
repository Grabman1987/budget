import {
  cents,
  compareRepaymentAndInvestment,
  formatDecimal,
  parseAmount,
  type AccountLiquidityResult,
  type LiquidityHorizon,
  type LiquidityLeverId,
} from '@budget/domain';
import { AmountInput, Field, Select, TextInput, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { eur, longDay } from '../ledger/format';
import { liquidityQuery, type LiquidityReportView } from './liquidity-api';

type ComparisonData = NonNullable<LiquidityReportView['repaymentComparison']>;
type Comparison = NonNullable<ReturnType<typeof compareRepaymentAndInvestment>>;

export function RepayInvest({
  horizon,
  levers,
}: {
  horizon: LiquidityHorizon;
  levers: readonly LiquidityLeverId[];
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ ...liquidityQuery(horizon, levers, true), enabled: open });
  const data = query.data?.repaymentComparison;
  const paths = query.data?.accountLiquidity?.withoutExpectedInflows;
  return (
    <details
      className="card repay-invest rf-wide"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Tilgen oder investieren</summary>
      {open && (
        <div className="rf-tools-content">
          <div className="rf-card">
            {query.isPending ? (
              <p role="status">Vergleich wird geladen …</p>
            ) : query.isError || !data || !paths ? (
              <p>Vergleich derzeit nicht verfügbar. Die Kontoliquidität muss vollständig sein.</p>
            ) : (
              <ComparisonForm data={data} paths={paths} />
            )}
          </div>
        </div>
      )}
    </details>
  );
}

function ComparisonForm({
  data: { funding, debts },
  paths,
}: {
  data: ComparisonData;
  paths: AccountLiquidityResult['withoutExpectedInflows'];
}) {
  useAmountPrivacy();
  const [sourceId, setSourceId] = useState('');
  const [debtId, setDebtId] = useState('');
  const [amountText, setAmountText] = useState<string | null>(null);
  const [minText, setMinText] = useState('−2,00');
  const [maxText, setMaxText] = useState('3,00');
  const sources = paths.accounts.filter(
    (account) => account.paymentAccount && debts.some((debt) => debt.id !== account.accountId),
  );
  if ('unavailable' in funding) return <p>{funding.unavailable.message}</p>;
  const source =
    sources.find((account) => account.accountId === sourceId) ??
    sources.find((account) => account.balanceTodayCents > 0) ??
    sources[0];
  const targets = debts.filter((debt) => debt.id !== source?.accountId);
  const debt = targets.find((target) => target.id === debtId) ?? targets[0];
  if (!source || !debt)
    return (
      <p>
        Für den Vergleich brauchst du ein EUR-Zahlungskonto und einen offenen EUR-Kredit oder Dispo
        auf einem anderen Konto.
      </p>
    );

  const amount = amountText ?? formatDecimal(cents(funding.investableCents));
  const parsedAmount = parseAmount(amount);
  const min = parseAmount(minText);
  const max = parseAmount(maxText);
  const amountValid = parsedAmount.ok && parsedAmount.cents > 0;
  const rangeValid = min.ok && max.ok && min.cents <= max.cents;
  const result =
    amountValid && rangeValid
      ? compareRepaymentAndInvestment({
          paths,
          sourceId: source.accountId,
          amountCents: parsedAmount.cents,
          debt,
          reserveCashCents: funding.cashCents - funding.obligationsCents,
          committedReservesCents: funding.committedReservesCents,
          returnRangeBp: [min.cents, max.cents],
        })
      : null;

  return (
    <>
      <p>
        Kontoliquidität bis {longDay(funding.through)} wie oben: gleiche Zahlungen, ohne erwartete
        Eingänge und ohne Stellschrauben. Beide Optionen belasten das gewählte Konto heute.
        Bestehende Raten bleiben in der Vorschau. Es wird nichts gebucht.
      </p>
      <p className="vnote">
        Investierbarer Betrag laut Planungsbasis: {eur(funding.investableCents)}.
      </p>
      <Field label="Zahlungskonto">
        {({ id }) => (
          <Select
            id={id}
            value={source.accountId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            {sources.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {maskMoneyText(account.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Kredit oder Dispo">
        {({ id }) => (
          <Select id={id} value={debt.id} onChange={(event) => setDebtId(event.target.value)}>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {maskMoneyText(target.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <AmountInput
        label="Vergleichsbetrag"
        value={amount}
        onChange={setAmountText}
        showOperators={false}
      />
      <Field label="Rendite von (%)">
        {({ id }) => (
          <TextInput
            id={id}
            money
            inputMode="decimal"
            value={minText}
            onChange={(event) => setMinText(event.target.value)}
          />
        )}
      </Field>
      <Field label="Rendite bis (%)">
        {({ id }) => (
          <TextInput
            id={id}
            money
            inputMode="decimal"
            value={maxText}
            onChange={(event) => setMaxText(event.target.value)}
          />
        )}
      </Field>
      <p className="vnote">
        Ertrag im ersten Jahr vor Steuern und Kosten. Die Rendite ist eine Annahme. Verluste sind
        möglich. Die Zinsersparnis basiert auf dem Kreditmodell bzw. bei Dispo auf einem Jahr mit
        gleichbleibender Nutzung und Verzinsung. Allfällige Sondertilgungsgebühren fehlen.
      </p>
      <div aria-live="polite">
        {!amountValid && <p>Gib einen Vergleichsbetrag über null ein.</p>}
        {!rangeValid && (
          <p>
            Gib eine gültige Renditespanne ein. Die Untergrenze darf höchstens der Obergrenze
            entsprechen.
          </p>
        )}
        {amountValid && rangeValid && !result && (
          <p>Die Eingaben liegen außerhalb des Rechenbereichs.</p>
        )}
        {result && (
          <>
            <section aria-label="Tilgen">
              <h3>Tilgen</h3>
              {result.repay ? (
                <>
                  <OptionLiquidity option={result.repay} />
                  <p>
                    Zinsersparnis:{' '}
                    {result.repay.interestSavedCents === null
                      ? 'mit den vorhandenen Konditionen nicht berechenbar'
                      : eur(result.repay.interestSavedCents)}
                  </p>
                </>
              ) : (
                <p>
                  Nicht ratsam: Der Vergleichsbetrag übersteigt die Restschuld von{' '}
                  {eur(debt.owedCents)}.
                </p>
              )}
            </section>
            <section aria-label="Investieren">
              <h3>Investieren</h3>
              <OptionLiquidity option={result.invest} />
              <p>
                Angenommener Ertrag:{' '}
                {result.invest.returnRangeCents.map((value) => eur(value)).join(' bis ')}
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function OptionLiquidity({ option }: { option: Omit<Comparison['invest'], 'returnRangeCents'> }) {
  const { low, reservesIntact, sourceCovered, householdCovered } = option;
  return (
    <>
      <p>
        Tiefpunkt: {eur(low.cents)} am {longDay(low.day)} · {maskMoneyText(low.name)}
      </p>
      <p>
        {reservesIntact ? 'Rücklagen bleiben gedeckt.' : 'Rücklagen reichen im Szenario nicht aus.'}
      </p>
      {(low.cents < 0 || !reservesIntact || !sourceCovered || !householdCovered) && (
        <p>
          <strong>Nicht ratsam.</strong>
          {!sourceCovered && ' Das Zahlungskonto deckt die heutige Zahlung nicht.'}
          {!householdCovered && ' Im Budget fehlt Geld für geplante Zahlungen.'}
        </p>
      )}
    </>
  );
}
