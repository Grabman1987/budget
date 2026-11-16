import { ratioBp, yearWealthChange, type YearNetWorth } from '@budget/domain';
import { privateAmount, useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import { bpText } from './overview-format';

/** Presentation of the existing wealth series; this is not an investment return. */
export function YearWealthChangeValue({ netWorth }: { netWorth: YearNetWorth }) {
  useAmountPrivacy();
  const { deltaCents: change } = yearWealthChange(netWorth)!;
  const rate = ratioBp(change, netWorth.startCents);
  return (
    <span>
      {eur(change, { sign: true })} ·{' '}
      {rate === null
        ? 'Prozent nicht ermittelbar (Anfangsvermögen nicht positiv)'
        : privateAmount(bpText(rate, { sign: true }))}
    </span>
  );
}
