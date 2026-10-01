import { ACC, ACCOUNT_OF_PRODUCT, securityId } from './master-data';
import type { SampleLedger } from './types';

/**
 * Savings plans (Sparpläne) that match the sample buys: the monthly buys at the end of each month
 * ("SPARPLAN now" of the prototype, 400 € in total). The first quarter ran at 75 % of the later
 * rate, so every plan has two rows, one ended on 31.12.2023 and one open from 01.01.2024 (the
 * history a rate change leaves).
 */
const RATES: ReadonlyArray<{ id: string; first: number; now: number }> = [
  { id: 'etfw', first: 23_760, now: 31_680 },
  { id: 'etfem', first: 4_500, now: 6_000 },
  { id: 'akta', first: 1_500, now: 2_000 },
  { id: 'btc', first: 150, now: 200 },
  { id: 'eth', first: 90, now: 120 },
];

export function buildSavingsPlans(): SampleLedger['savingsPlans'] {
  return RATES.flatMap((r) => {
    const common = {
      securityId: securityId(r.id),
      accountId: ACCOUNT_OF_PRODUCT[r.id] as string,
      sourceAccountId: ACC.giro,
      dayOfMonth: 31,
    };
    return [
      {
        ...common,
        id: `sp-${r.id}-1`,
        amountCents: r.first,
        validFrom: '2023-10-01',
        validTo: '2023-12-31',
      },
      { ...common, id: `sp-${r.id}-2`, amountCents: r.now, validFrom: '2024-01-01' },
    ];
  });
}
