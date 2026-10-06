import type { InflationReport } from '@budget/db';
import { useState } from 'react';
import { LineLegend } from '@budget/ui';
import { IndexChart } from './personal-inflation-report';
import { bpText, monthShort, ScrollRegion } from './spending-shared';
import './inflation-explorer.css';

const number = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const index = (value: number | null | undefined) => (value == null ? '–' : number.format(value));
const pp = (value: number | null) =>
  value === null ? '–' : `${value < 0 ? '−' : '+'}${number.format(Math.abs(value) / 100)} Pp`;

export function InflationExplorer({
  categories,
  rows,
}: {
  categories: Array<
    Pick<InflationReport['basketSettings'][number], 'id' | 'name' | 'inclusion' | 'included'>
  >;
  rows: InflationReport['explorer'];
}) {
  const [selected, setSelected] = useState(() =>
    categories.filter((c) => c.inclusion === 'always' || c.included).map((c) => c.id),
  );
  const chosen = rows.filter((r) => selected.includes(r.id));
  return (
    <section
      className="sr-card sr-wide"
      aria-labelledby="pi-explorer"
      data-testid="inflation-explorer"
    >
      <div className="sr-head">
        <h2 id="pi-explorer">Kategorie-Explorer</h2>
        <span className="sr-state">Oktober 2023 = 100</span>
      </div>
      <fieldset className="pi-explorer-selection">
        <legend>Kategorien auswählen</legend>
        {categories.map((c) => (
          <label key={c.id}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id),
                )
              }
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <p className="sr-note">
        Die Auswahl gilt nur für diesen Explorer. Die VPI-Zuordnung lässt sich unter Einstellungen ›
        Warenkorb ändern.
      </p>
      {!selected.length && (
        <p className="sr-empty" role="status">
          Bitte mindestens eine Kategorie auswählen.
        </p>
      )}
      {chosen.map((row) => {
        const last = row.points.at(-1);
        const ownLabel =
          row.source === 'booking-average'
            ? 'Ausgaben je Buchung'
            : row.source === 'unit-price'
              ? 'Preis je Einheit'
              : 'Eigener Preisindex';
        return (
          <section
            key={row.id}
            className="pi-explorer-category"
            aria-label={row.name}
            data-testid={'explorer-category-' + row.id}
          >
            <div className="sr-head">
              <h3>{row.name}</h3>
              <span className="sr-state">
                {last ? `bis ${monthShort(last.month)}` : 'Basis fehlt'}
              </span>
            </div>
            <p className="sr-note">{row.referenceLabel}</p>
            {last ? (
              <>
                <IndexChart
                  data={{
                    points: row.points,
                    referenceAvailable: row.points.some((p) => p.reference !== null),
                  }}
                  label={`${row.name} · ${ownLabel}`}
                  referenceLabel={row.referenceLabel}
                />
                <LineLegend
                  items={[
                    { kind: 'actual', label: ownLabel },
                    { kind: 'previous', label: row.referenceLabel },
                  ]}
                />
              </>
            ) : (
              <p className="sr-empty" role="status">
                Kein eigener Index ab Oktober 2023: Basispreis oder ausreichende Historie fehlt.
              </p>
            )}
            <ScrollRegion label={`${row.name}: Index und Differenzen seit Oktober 2023`}>
              <table className="sr-table">
                <thead>
                  <tr>
                    <th scope="col">Eigener Index</th>
                    <th scope="col">VPI-Index</th>
                    <th scope="col">Differenz seit Basis</th>
                    <th scope="col">Mengeneffekt</th>
                    <th scope="col">Anteil an Ausgabendifferenz zum VPI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{index(last?.index)}</td>
                    <td>{index(last?.reference)}</td>
                    <td>{pp(row.differenceBp)}</td>
                    <td>{pp(row.volumeBp)}</td>
                    <td>{bpText(row.volumeShareBp)}</td>
                  </tr>
                </tbody>
              </table>
            </ScrollRegion>
            <p className="sr-note">
              {row.source === 'booking-average'
                ? 'Ausgaben je Buchung enthalten Preis und Einkaufsmix. Der Mengeneffekt zeigt die geänderte Buchungsanzahl, keine gemessenen Liter oder Stück. Sein Anteil bezieht sich auf die Ausgabenänderung minus VPI, einschließlich Preis-Mengen-Wechselwirkung; er kann negativ oder größer als 100 % sein.'
                : row.source === 'unit-price'
                  ? 'Mengeneffekt aus erfassten Einheiten; Anteil an der Ausgabenänderung minus VPI, einschließlich Preis-Mengen-Wechselwirkung.'
                  : 'Vertragspreise verwenden dieselbe Verkettung wie der Warenkorb. Ein Mengeneffekt ist aus diesen Preisen nicht belegbar; das 12-Monats-Mittel enthält auch Verbrauch und Nachzahlungen.'}{' '}
              Ein Strich heißt: Daten oder Vergleich fehlen.
            </p>
          </section>
        );
      })}
      <p className="sr-note" data-testid="explorer-interpretation">
        Mehr Fahrten erhöhen die Treibstoffkosten, nicht den Preis – Mengeneffekte selbst einordnen.
      </p>
    </section>
  );
}
