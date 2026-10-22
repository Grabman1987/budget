import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './term.css';

const GLOSSARY = new Map<string, string>([
  [
    'Kategorie',
    'Eine Kategorie ordnet Geld einem Zweck zu. Zugewiesen, Aktivität und Verfügbar beschreiben denselben Budgetbereich.',
  ],
  [
    'Zu verteilen',
    'Ein positiver Betrag ist im Budget noch keiner Kategorie zugewiesen. Ein negativer Betrag zeigt, dass aktuell weniger Geld zur Verteilung bereitsteht, als bereits gebunden ist. Ungedeckte Ausgaben können dazu beitragen. Verteilen betrifft mehrere Kategorien; zuweisen eine einzelne Kategorie.',
  ],
  [
    'Zugewiesen',
    'Der Betrag, den du einer Kategorie für den gewählten Monat zugewiesen hast. Das ist keine zusätzliche Einnahme oder Ausgabe.',
  ],
  [
    'Verplantes Geld',
    'Die Summe der verfügbaren Beträge in den Kategorien. Sie ist kein zusätzliches Kontoguthaben.',
  ],
  [
    'Ausgabentempo',
    'Die zeitbezogene Betrachtung zeigt, wie sich bisherige Ausgaben zum Verlauf des gewählten Monats verhalten.',
  ],
  ['Noch im Plan', 'Die geplanten Monatsausgaben abzüglich der bisherigen Ausgaben.'],
  [
    'Monatsziel',
    'Die Zuweisungsabsicht einer Kategorie für einen Monat. Der Zieltyp bestimmt, ob Übertrag den Bedarf mindert und wie ein Betrag bis zum Zieldatum verteilt wird. Ein Monatsziel ist vom Gesamtbetrag eines Sparziels zu unterscheiden.',
  ],
  [
    'Wochenziel',
    'Ein Wochenziel legt einen Betrag je ausgewähltem Wochentag zurück. Jeder Kalendermonat zählt seine vier oder fünf tatsächlichen Termine; Übertrag mindert diesen monatlichen Zielbetrag nicht.',
  ],
  [
    'Sparziel',
    'Ein Sparziel beschreibt einen gewünschten Gesamtbetrag für eine Kategorie oder ein Konto. Mit einem Zieldatum zeigt es die nötige Monatsrate. Der bereits gesparte Betrag und der Bedarf des gewählten Monats bleiben getrennte Angaben.',
  ],
  [
    'Berücksichtigter Portfoliowert',
    'Der Wert der ausgewählten Positionen einschließlich Anlage-Kassa mit ihrem Vorzeichen. Die ausgewiesene Auswahl und Bewertungsgrenze bestimmen den Nenner.',
  ],
  [
    'Abweichung vom Ziel',
    'Der Abstand zwischen aktuellem Wert und Zielwert bei unverändertem Gesamtwert. Diese Angabe ist keine automatische Orderempfehlung.',
  ],
  [
    'TWR',
    'Die zeitgewichtete Rendite neutralisiert Ein- und Auszahlungen nach Portfolio Performance: Zuflüsse zählen am Tagesanfang, Abflüsse am Tagesende. Die Tagesrenditen werden miteinander verkettet.',
  ],
  [
    'MWR/IZF',
    'Die geldgewichtete Rendite berücksichtigt Höhe und Zeitpunkte deiner Ein- und Auszahlungen.',
  ],
  [
    'XIRR',
    'XIRR berücksichtigt Höhe und Zeitpunkte deiner Ein- und Auszahlungen mit der Tageszählung actual/365. Das Ergebnis kann unter anderem bei unzureichenden Zahlungsdaten oder einer nicht eindeutig bestimmbaren Rendite nicht verfügbar sein.',
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
  ['Geldgewichtet', 'MWR/IZF'],
  ['Allocation', 'Allokation'],
  ['Einstand', 'Einstandswert'],
  ['≈', '≈ geschätzt'],
  ['Volatilität p. a.', 'Volatilität'],
  ['Sharpe-Quote', 'Sharpe'],
]);

/** Shared app vocabulary; unknown dynamic headings remain ordinary text. */
export function Term({ children, info = false }: { children: string; info?: boolean }) {
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
        aria-label={info ? `${children} erklären` : undefined}
      >
        {children}
        {info && <span aria-hidden="true"> ⓘ</span>}
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
