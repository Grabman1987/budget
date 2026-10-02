import { Button } from '@budget/ui';
import type { ReactNode } from 'react';
import { ApiError } from '../api/http';
import { MINUS, eur } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import './portfolio-report-shared.css';

const percentFormat = (digits: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const formats = new Map<number, Intl.NumberFormat>();
const format = (digits: number) => {
  let existing = formats.get(digits);
  if (!existing) {
    existing = percentFormat(digits);
    formats.set(digits, existing);
  }
  return existing;
};

/** A rate (0,1 = 10 %) at the edge: `12,3 %`, real minus, optional plus; `–` when not a number. */
export function percentText(
  value: number | null | undefined,
  options: { sign?: boolean; digits?: number } = {},
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const digits = options.digits ?? 1;
  const text = format(digits).format(Math.abs(value) * 100);
  const zero = Number(text.replace(/\./g, '').replace(',', '.')) === 0;
  const sign = value < 0 && !zero ? MINUS : options.sign && value > 0 ? '+' : '';
  return `${sign}${text} %`;
}

/** Difference of two returns in percentage points: `+1,2 Pp`; `–` without a comparison. */
export function ppText(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const text = format(1).format(Math.abs(value) * 100);
  const zero = Number(text.replace(',', '.')) === 0;
  return `${value < 0 && !zero ? MINUS : value > 0 && !zero ? '+' : ''}${text} Pp`;
}

/** Basis points as a share: `70,0 %`. */
export const bpText = (bp: number, options: { sign?: boolean; digits?: number } = {}) =>
  percentText(bp / 10_000, options);

/** Signed money in the signal ink: green for a gain, red-brown for a loss (a signed change). */
export function SignedMoney({ cents }: { cents: number }) {
  return (
    <span className={cents > 0 ? 'prep-good' : cents < 0 ? 'prep-bad' : undefined}>
      {eur(cents, { sign: true })}
    </span>
  );
}

/** A rate or gap in the signal ink. */
export function SignedText({ value, children }: { value: number | null; children: ReactNode }) {
  return (
    <span
      className={
        value === null ? undefined : value > 0 ? 'prep-good' : value < 0 ? 'prep-bad' : undefined
      }
    >
      {children}
    </span>
  );
}

/** Link to the product on the Portfolio page (Vermögen), where the decisions are made. */
export function ProductLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AppLink
      to="/vermoegen/portfolio"
      search={(previous: Record<string, unknown>) => ({ ...previous, produkt: id })}
      className="prep-product"
    >
      {children}
    </AppLink>
  );
}

/** Link back to the place of decision: reports only look back (PRODUCT.md, Reports). */
export function DecisionLink() {
  return (
    <AppLink
      to="/vermoegen/portfolio"
      search={(previous: Record<string, unknown>) => ({ ...previous, produkt: undefined })}
      className="prep-decision"
    >
      Entscheiden unter Vermögen › Portfolio
    </AppLink>
  );
}

/** The honest error of a report that needs a price or exchange rate it does not have. */
export function ReportUnavailable({
  what,
  error,
  onRetry,
}: {
  what: string;
  error: unknown;
  onRetry: () => void;
}) {
  const missing = error instanceof ApiError && error.code === 'valuation_unavailable';
  return (
    <div className="prep-unavailable" role="alert">
      <div>
        <strong>
          {what} {missing ? 'nicht verfügbar' : 'konnte nicht geladen werden'}.
        </strong>
        <p>
          {missing
            ? `Es fehlt ein benötigter Wertpapierkurs oder Wechselkurs. ${
                (error as ApiError).detail ??
                'Die Bewertung kann deshalb nicht vollständig erstellt werden.'
              }`
            : error instanceof ApiError && error.detail
              ? error.detail
              : 'Der Server hat die Auswertung nicht geliefert.'}
        </p>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Erneut versuchen
        </Button>
      </div>
    </div>
  );
}
