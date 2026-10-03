import { MINUS } from '../money';

const tenthsOf = (bp: number): number => Math.floor((Math.abs(bp) + 5) / 10);

/** `14,2 %` from basis points; real minus; optional `+`. */
export function formatPercent(bp: number, sign = false): string {
  const t = tenthsOf(bp);
  const body = `${Math.trunc(t / 10)},${t % 10}`;
  const prefix = t === 0 ? '' : bp < 0 ? MINUS : sign ? '+' : '';
  return `${prefix}${body} %`;
}
