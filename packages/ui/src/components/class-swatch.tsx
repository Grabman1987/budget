import type { ReactNode } from 'react';

/** Budget classes and their fills: Bedarf solid, Wunsch 135° hatch, Zukunft cross hatch. */
export type SwatchKind = 'need' | 'want' | 'future' | 'bound' | 'debt' | 'open';

export const CLASS_LABEL = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' } as const;
const CLASS_ABBREVIATION = { need: 'B', want: 'W', future: 'Z' } as const;

/**
 * Class mark. Bedarf is a square, Wunsch a circle, and Zukunft a triangle. Hatching is
 * reserved for the three classes and committed money (bound); debt is an unfilled dashed
 * outline, and `open` is the empty square of "Zu verteilen". Always pair it with text.
 */
export function ClassSwatch({ kind }: { kind: SwatchKind }) {
  if (kind === 'need' || kind === 'want' || kind === 'future') {
    return (
      <span className={`sw-class-mark sw-class-mark-${kind}`} aria-hidden="true">
        <i className={`sw sw-${kind}`} />
        <span className="sw-class-abbreviation">{CLASS_ABBREVIATION[kind]}</span>
      </span>
    );
  }

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
