/**
 * Value decoding without floats (`docs/migration/pp-export.md` §Scales). PP stores amounts as
 * integer cents (x100), shares as integer x1e8, quotes as integer x1e8 (client versions from 40;
 * older files used fewer decimals and need an explicit `quoteScale`). Everything here is integer
 * or BigInt arithmetic, rounded half up.
 */

export const SHARES_SCALE = 100_000_000n;
export const DEFAULT_QUOTE_SCALE = 100_000_000n;
/** Oldest client version whose quote scale is known to be 1e8 (assumption, see the format doc). */
export const MIN_QUOTE_SCALE_VERSION = 40;

export class ValueError extends Error {
  constructor(
    readonly code: 'integer' | 'day' | 'decimal' | 'range',
    message: string,
  ) {
    super(message);
    this.name = 'ValueError';
  }
}

/** Strict signed integer text to a safe JS integer. */
export function parseSafeInt(text: string | undefined): number {
  const t = text?.trim() ?? '';
  if (!/^-?\d+$/.test(t)) throw new ValueError('integer', 'Not an integer');
  const v = BigInt(t);
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER))
    throw new ValueError('range', 'Integer out of range');
  return Number(v);
}

/** Divides `a / b` (b > 0) rounding half away from zero. */
export function divRound(a: bigint, b: bigint): bigint {
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const q = (abs * 2n + b) / (b * 2n);
  return neg ? -q : q;
}

/** PP quote text (`v` attribute) to price micro-units (1e-6): `round(v * 1e6 / scale)`. */
export function quoteToMicro(v: string | undefined, scale: bigint = DEFAULT_QUOTE_SCALE): number {
  const t = v?.trim() ?? '';
  if (!/^\d+$/.test(t)) throw new ValueError('integer', 'Not a quote');
  const micro = divRound(BigInt(t) * 1_000_000n, scale);
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValueError('range', 'Quote out of range');
  return Number(micro);
}

/** Decimal text such as `0.9123456789` to micro-units, rounded half up; no floats involved. */
export function decimalToMicro(text: string | undefined): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text?.trim() ?? '');
  if (!m) throw new ValueError('decimal', 'Not a decimal number');
  const whole = BigInt(m[1] as string);
  const frac = m[2] ?? '';
  const padded = (frac + '000000').slice(0, 6);
  let micro = whole * 1_000_000n + BigInt(padded);
  if (frac.length > 6 && (frac.charCodeAt(6) ?? 48) >= 53) micro += 1n;
  if (micro > BigInt(Number.MAX_SAFE_INTEGER)) throw new ValueError('range', 'Number out of range');
  return Number(micro);
}

/** First 10 characters of a PP date/time (`2024-05-17T00:00[:00[.fff]]`) as a real calendar day. */
export function ppDay(text: string | undefined): string {
  const t = text?.trim() ?? '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(t);
  if (!m) throw new ValueError('day', 'Not a date');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    throw new ValueError('day', 'Not a calendar day');
  return `${m[1]}-${m[2]}-${m[3]}`;
}
