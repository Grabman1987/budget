import { Segmented, StandValue } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { standQuery } from './api';
import { useZeitraum, ZEITRAUM_VALUES } from './zeitraum';

const OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));

/** Zeitraum segmented control of the Vermögen title block; the choice lives in `?zeitraum=`. */
export function ZeitraumSwitch() {
  const [zeitraum, set] = useZeitraum();
  return (
    <Segmented
      label="Zeitraum"
      options={OPTIONS}
      value={zeitraum}
      onChange={set}
      className="seg-period"
    />
  );
}

/**
 * Stand of the Vermögen title block: the day of the newest prices ("Do 17.09.2026 · Kurse 06:30");
 * the time appears when the price refresh recorded one.
 */
export function VermoegenStand() {
  const { data } = useQuery(standQuery());
  const at = data?.priceAt ? new Date(data.priceAt) : undefined;
  return (
    <StandValue
      at={at}
      day={data?.priceDate ?? undefined}
      label="Kurse"
      none={data ? 'noch keine Kurse' : '…'}
    />
  );
}
