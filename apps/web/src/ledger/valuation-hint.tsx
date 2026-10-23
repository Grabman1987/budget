import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../reports/term.css';
import { longDay } from './format';
import { Info } from 'lucide-react';

/** A held security valued at cost or left out, without a quote or execution price. */
export interface ValuationNote {
  securityId: string;
  quality: 'estimated' | 'missing';
  /** First and last day affected (`YYYY-MM-DD`). */
  from: string;
  to: string;
  name?: string;
  /** Positive units held at the response's as-of date. */
  unitsE8?: number;
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
  incomplete = incomplete?.filter((n) => n.unitsE8 === undefined || n.unitsE8 > 0);
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

/** Nonmonetary mirror of the endpoint-local current valuation sources. */
export interface ValuationSource {
  accountId: string;
  securityId: string | null;
  name: string | null;
  asOf: string;
  kind: 'quote' | 'execution' | 'cost' | 'missing' | 'cash';
  quality: 'exact' | 'stale' | 'estimated' | 'missing';
  date: string | null;
  currency: string;
  source: string | null;
  lookAhead: boolean;
  positiveHolding: boolean;
  quoteNeeded: boolean;
  missing: 'price' | 'fx' | null;
  fx: { kind: 'identity' | 'rate' | 'missing'; date: string | null; source: string | null };
}

/** No stale-age policy is recomputed in the UI; this only explains the selected source. */
export function valuationSourceText(source: ValuationSource): string {
  const parts: string[] = [];
  if (source.name) parts.push(source.name);
  if (source.kind === 'missing') parts.push('Bewertung fehlt');
  else if (source.kind === 'cost')
    parts.push('Einstandswert als Schätzung · kein verwendbarer Kurs');
  else if (source.kind === 'execution')
    parts.push(
      `Brutto-Ausführung vom ${longDay(source.date!)}${source.lookAhead ? ' · später als der Stichtag' : ''}`,
    );
  else if (source.kind === 'quote')
    parts.push(
      `Kurs vom ${longDay(source.date!)}${source.date! < source.asOf ? ' fortgeschrieben' : ''}${source.source ? ` · ${source.source === 'manual' ? 'manuell' : source.source}` : ''}`,
    );
  if (source.kind !== 'missing') parts.push(source.currency);
  if (source.fx.kind === 'missing') parts.push(`EUR-Umrechnung fehlt · ${source.currency}`);
  else if (source.fx.kind === 'rate')
    parts.push(
      `Wechselkurs ${source.currency}/EUR vom ${longDay(source.fx.date!)}${source.fx.date! < source.asOf ? ' fortgeschrieben' : ''} · ${source.fx.source === 'ecb' ? 'EZB' : source.fx.source}`,
    );
  return parts.join(' · ');
}

function needsSourceHint(source: ValuationSource): boolean {
  return (
    source.kind === 'missing' ||
    source.kind === 'cost' ||
    source.lookAhead ||
    (source.kind !== 'cash' && source.date !== null && source.date < source.asOf) ||
    source.fx.kind === 'missing' ||
    (source.fx.date !== null && source.fx.date < source.asOf)
  );
}

/** Adjacent to its figure; source details retain no private amount in any channel. */
export function ValuationSourceHint({
  sources,
  label,
}: {
  sources?: ReadonlyArray<ValuationSource> | undefined;
  label: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const affected = sources?.filter(needsSourceHint) ?? [];
  if (!affected.length) return null;
  const explain = () => popup.current?.showPopover?.();
  const hide = () => popup.current?.hidePopover?.();
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="term-trigger"
        aria-label={`Bewertungsgrundlage · ${label}`}
        aria-describedby={id}
        onFocus={explain}
        onBlur={hide}
        onMouseEnter={explain}
        onClick={explain}
      >
        ≈
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popup}
            id={id}
            popover="auto"
            role="tooltip"
            className="term-popover"

            onToggle={(event) => {
              const box = event.currentTarget;
              if (!box.matches(':popover-open') || !trigger.current) return;
              const anchor = trigger.current.getBoundingClientRect();
              const { width, height } = box.getBoundingClientRect();
              box.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
              box.style.top = `${Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - height - 8))}px`;
            }}
          >
            <strong>Bewertungsgrundlage · {label}</strong>
            <ul>
              {affected.map((source, index) => (
                <li key={`${source.accountId}/${source.securityId}/${index}`}>
                  {valuationSourceText(source)}
                </li>
              ))}
            </ul>
          </div>,
          document.querySelector('main') ?? document.body,
        )}
    </>
  );
}
