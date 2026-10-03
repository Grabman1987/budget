import { Info } from 'lucide-react';

/** A security the valuation had to estimate (cost basis, a later quote) or leave out. */
export interface ValuationNote {
  securityId: string;
  quality: 'estimated' | 'missing';
  /** First and last day affected (`YYYY-MM-DD`). */
  from: string;
  to: string;
  name?: string;
}

/** Answers that may carry `incomplete`: the API adds it to every answer that estimated a value. */
export interface WithValuationNotes {
  incomplete?: ValuationNote[];
}

/** The notes of several answers of one page, one per security. */
export function mergeValuationNotes(
  ...lists: Array<ReadonlyArray<ValuationNote> | undefined>
): ValuationNote[] {
  const bySecurity = new Map<string, ValuationNote>();
  for (const note of lists.flatMap((list) => list ?? [])) {
    const known = bySecurity.get(note.securityId);
    bySecurity.set(
      note.securityId,
      known
        ? {
            ...known,
            quality:
              known.quality === 'missing' || note.quality === 'missing' ? 'missing' : 'estimated',
            from: known.from < note.from ? known.from : note.from,
            to: known.to > note.to ? known.to : note.to,
          }
        : note,
    );
  }
  return [...bySecurity.values()];
}

/** Text of the hint: how many securities are valued without a quote. */
export function valuationHintText(count: number): string {
  return `Bewertung teilweise geschätzt: ${count} ${count === 1 ? 'Wertpapier' : 'Wertpapiere'} ohne Kurs`;
}

/**
 * "Bewertung teilweise geschätzt": shown wherever values rest on an estimate. A security without a
 * quote counts at its Einstand (moving average); one without even that adds nothing.
 */
export function ValuationHint({ incomplete }: { incomplete?: ValuationNote[] | undefined }) {
  if (!incomplete || incomplete.length === 0) return null;
  const missing = incomplete.filter((n) => n.quality === 'missing').length;
  const names = incomplete.map((n) => n.name).filter((n): n is string => !!n);
  return (
    <p className="vnote valuation-hint" role="status" data-testid="valuation-hint">
      <Info className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>
        <strong>{valuationHintText(incomplete.length)}.</strong> Sie zählen mit ihrem Einstandswert
        {missing > 0 ? '; ohne bekannten Einstand fehlen sie in der Summe' : ''}.
        {names.length > 0 && <> Betroffen: {names.join(', ')}.</>}
      </span>
    </p>
  );
}
