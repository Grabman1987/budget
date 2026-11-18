import { addDays } from '../date';
import { cents } from '../money/cents';
import { committedReserves, type CommittedReservesInput } from './committed-reserves';
import type { FreeAccount, OpenOutflow } from './free-until-payday';

export interface InvestableAmountInput {
  accounts: ReadonlyArray<Pick<FreeAccount, 'balanceCents'>>;
  openOutflows: ReadonlyArray<Pick<OpenOutflow, 'day' | 'cents'>>;
  payday: string;
  reserves: Omit<CommittedReservesInput, 'reserveAccounts'> & {
    reserveAccounts: ReadonlyArray<
      CommittedReservesInput['reserveAccounts'][number] & { inCash: boolean }
    >;
  };
  needWantEnvelopeAvailableCents: ReadonlyArray<number>;
}

export interface InvestableAmount {
  payday: string;
  through: string;
  cashCents: number;
  obligationsCents: number;
  committedReservesCents: number;
  needWantAvailableCents: number;
  rawCents: number;
  investableCents: number;
}

export function investableAmount(input: InvestableAmountInput): InvestableAmount {
  const through = addDays(input.payday, 30);
  const cashCents = sumCents(input.accounts.map((account) => account.balanceCents));
  const obligationsCents = sumCents(
    input.openOutflows.map((outflow) => {
      const amount = cents(outflow.cents);
      if (amount < 0) throw new RangeError('An open outflow must be a nonnegative amount');
      return outflow.day <= through ? amount : 0;
    }),
  );
  const reserves = committedReserves(input.reserves);
  const reservesOutsideCash = sumCents(
    input.reserves.reserveAccounts
      .filter((account) => !account.inCash)
      .map((account) => Math.max(0, account.balanceCents)),
  );
  const committedReservesCents = cents(reserves.committedCents - reservesOutsideCash);
  const needWantAvailableCents = sumCents(
    input.needWantEnvelopeAvailableCents.map((amount) => Math.max(0, cents(amount))),
  );
  const rawCents = sumCents([
    cashCents,
    -obligationsCents,
    -committedReservesCents,
    -needWantAvailableCents,
  ]);
  return {
    payday: input.payday,
    through,
    cashCents,
    obligationsCents,
    committedReservesCents,
    needWantAvailableCents,
    rawCents,
    investableCents: Math.max(0, rawCents),
  };
}

function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => cents(total + cents(value)), 0);
}
