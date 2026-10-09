import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './term.css';

const GLOSSARY = new Map<string, string>([
  [
    'TWR',
    'Die zeitgewichtete Rendite misst die Anlageentwicklung und blendet den Einfluss von Ein- und Auszahlungen aus.',
  ],
  [
    'MWR/IZF',
    'Die geldgewichtete Rendite berücksichtigt Höhe und Zeitpunkte deiner Ein- und Auszahlungen.',
  ],
  [
    'Modified Dietz',
    'Modified Dietz nähert die geldgewichtete Rendite an, indem Ein- und Auszahlungen nach ihrer Anlagedauer gewichtet werden.',
  ],
  [
    'Exposure',
    'Exposure beschreibt die wirtschaftliche Beteiligung an Anlagen oder Risiken, einschließlich einer möglichen Hebelwirkung.',
  ],
  [
    'Allokation',
    'Allokation bezeichnet die Verteilung des angelegten Geldes auf die Anlageklassen.',
  ],
  [
    'Sparquote',
    'Die Sparquote zeigt, welcher Anteil der Haushaltseinnahmen nach dem Konsum übrig bleibt; Kapitalerträge und Erstattungen zählen nicht zu dieser Einnahmenbasis.',
  ],
  ['Bedarf', 'Bedarf umfasst notwendige Ausgaben für Grundversorgung und Verpflichtungen.'],
  ['Wunsch', 'Wunsch umfasst freiwillige Ausgaben für Freizeit und persönliche Wünsche.'],
  ['Zukunft', 'Zukunft umfasst Geld für Sparen, Investieren und Schuldentilgung.'],
  [
    'Markteffekt',
    'Der Markteffekt ist die Änderung des Investmentwerts nach Abzug der externen Nettozuflüsse im selben Zeitraum.',
  ],
  [
    'Einstandswert',
    'Der Einstandswert entspricht den verbleibenden Anschaffungskosten der gehaltenen Anteile nach der eingestellten Kostenmethode.',
  ],
  [
    '≈ geschätzt',
    '≈ kennzeichnet einen Wert, der auf geschätzten oder nicht tagesaktuellen Bewertungsdaten beruht.',
  ],
  [
    'Zwölftel',
    'Ein Zwölftel verteilt einen Jahresbetrag rechnerisch auf zwölf Monate, unabhängig vom tatsächlichen Zahlungsmonat.',
  ],
  [
    'Liquiditätsreserve',
    'Die Liquiditätsreserve ist kurzfristig verfügbares Geld für kommende Ausgaben und unerwartete Zahlungen.',
  ],
  [
    'Benchmark',
    'Eine Benchmark ist ein Vergleichswert, an dem du die Entwicklung deiner Anlagen messen kannst.',
  ],
  [
    'Volatilität',
    'Die Volatilität beschreibt, wie stark die Renditen im betrachteten Zeitraum schwanken.',
  ],
  [
    'Max. Rückgang',
    'Der maximale Rückgang ist der größte zwischenzeitliche Verlust gegenüber einem zuvor erreichten Höchststand.',
  ],
  [
    'Sharpe',
    'Die Sharpe-Quote setzt die Rendite über dem angenommenen sicheren Zins ins Verhältnis zu ihren Schwankungen.',
  ],
  [
    'Beta',
    'Beta beschreibt, wie stark die Rendite deiner Anlagen im Vergleich zur gewählten Benchmark schwankt.',
  ],
]);
const ALIASES = new Map<string, string>([
  ['TTWROR', 'TWR'],
  ['MWR', 'MWR/IZF'],
  ['IZF', 'MWR/IZF'],
  ['IRR', 'MWR/IZF'],
  ['XIRR', 'MWR/IZF'],
  ['Geldgewichtet', 'MWR/IZF'],
  ['Allocation', 'Allokation'],
  ['Einstand', 'Einstandswert'],
  ['≈', '≈ geschätzt'],
  ['Volatilität p. a.', 'Volatilität'],
  ['Sharpe-Quote', 'Sharpe'],
]);

/** Report vocabulary only; unknown dynamic headings remain ordinary text. */
export function Term({ children }: { children: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const explanation = GLOSSARY.get(ALIASES.get(children) ?? children);
  if (!explanation) return <>{children}</>;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="term-trigger"
        popoverTarget={id}
        aria-describedby={id}
      >
        {children}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            id={id}
            popover="auto"
            role="tooltip"
            className="term-popover"
            onToggle={(event) => {
              const popup = event.currentTarget;
              if (!popup.matches(':popover-open') || !trigger.current) return;
              const anchor = trigger.current.getBoundingClientRect();
              const { width, height } = popup.getBoundingClientRect();
              popup.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
              const top =
                anchor.bottom + height + 8 <= window.innerHeight
                  ? anchor.bottom + 8
                  : anchor.top - height - 8;
              popup.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
            }}
          >
            {explanation}
          </div>,
          document.querySelector('main') ?? document.body,
        )}
    </>
  );
}
