import { useAmountPrivacy } from '../amount-privacy';
import { formatPrivateEuro as formatEuro } from '../amount-privacy';
import { balanceChain, cents as toCents, type ChainTerm } from '@budget/domain';

export interface DimensionChainTerm extends ChainTerm {
  /** Makes the term a button that opens its line items (side panel, drill-down). */
  onSelect?: () => void;
}

export interface DimensionChainProps {
  terms: ReadonlyArray<DimensionChainTerm>;
  /** Accessible name, e.g. "Zu verteilen: Übertrag plus Einnahmen minus Zugewiesen". */
  label: string;
  /** `euro` (KPIs, default) balances rounded parts so the chain adds up as shown. */
  precision?: 'euro' | 'cent';
}

const OP_GLYPH = { '+': '+', '-': '−', '=': '=' } as const;

/**
 * Dimension chain, inline variant: terms on a dimension line with slash terminators
 * (Maßkette). Each term is a label plus a value; rounded euro parts are balanced so that the
 * chain adds up exactly as displayed.
 */
export function DimensionChain({ terms, label, precision = 'euro' }: DimensionChainProps) {
  useAmountPrivacy();
  const balanced = balanceChain(terms, precision);
  return (
    <div className="chain-inline" role="group" aria-label={label}>
      {balanced.map((term, index) => {
        const source = terms[index];
        const text = formatEuro(toCents(term.value), {
          cents: precision === 'cent',
          sign: term.signed === true,
        });
        const content = (
          <>
            <span className="ct-label tech">{term.label}</span>
            <span className="ct-val">{text}</span>
          </>
        );
        const className = term.result || term.op === '=' ? 'ct-term is-result' : 'ct-term';
        return (
          <span className="ct-pair" key={`${term.label}-${index}`}>
            {term.op && (
              <span className="ct-op" aria-hidden="true">
                {OP_GLYPH[term.op]}
              </span>
            )}
            {source?.onSelect ? (
              <button type="button" className={className} onClick={source.onSelect}>
                {content}
              </button>
            ) : (
              <span className={className}>{content}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
