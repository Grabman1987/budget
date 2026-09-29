import type { ReactNode } from 'react';

/** Budget classes and their fills: Bedarf solid, Wunsch 135° hatch, Zukunft cross hatch. */
export type SwatchKind = 'need' | 'want' | 'future' | 'bound' | 'debt' | 'open';

export const CLASS_LABEL = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' } as const;

/**
 * Colour-coded square. Hatching is reserved for the three classes and committed money (bound);
 * debts are a dashed outline without fill; `open` is the empty square of "Zu verteilen".
 * Always pair it with text: colour and pattern are never the only signal.
 */
export function ClassSwatch({ kind }: { kind: SwatchKind }) {
  return <i className={`sw sw-${kind}`} aria-hidden="true" />;
}

/** Swatch plus its label, e.g. for legends and category chips. */
export function ClassTag({ kind, children }: { kind: SwatchKind; children: ReactNode }) {
  return (
    <span className="class-tag">
      <ClassSwatch kind={kind} />
      {children}
    </span>
  );
}
