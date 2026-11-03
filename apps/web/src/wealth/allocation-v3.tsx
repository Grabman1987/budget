import { privateAmount, useAmountPrivacy } from '@budget/ui';
import { AppLink } from '../shell/app-link';
import { eur } from '../ledger/format';
import type { PortfolioAllocationView } from './allocation-api';
import { AllocationStages } from './allocation-stages';
import { percentText as rawPercentText } from './portfolio-format';
import { matchesAsset, type AssetType } from './redesign-filters';

const COLORS = [
  'var(--primary)',
  'var(--ink-2)',
  'var(--line-2)',
  'var(--ink-3)',
  'var(--rule-strong)',
];
export function AllocationV3({ view, art }: { view: PortfolioAllocationView; art: AssetType }) {
  useAmountPrivacy();
  const known = !!view.risk && view.risk.allocation.totalCents > 0;
  const classified = view.classes.map((cls) => ({
    id: cls.id,
    name: cls.name,
    targetBp: cls.targetBp,
    assignedSecurities: cls.assignedSecurities,
    actual: known ? view.risk?.allocation.rows.find((row) => row.assetClass === cls.id) : undefined,
  }));
  const rows = [
    ...classified,
    ...(view.risk?.allocation.rows ?? [])
      .filter((row) => !classified.some((cls) => cls.id === row.assetClass))
      .map((row) => ({
        id: row.assetClass,
        name: 'Ohne Anlageklasse',
        targetBp: row.targetBp,
        assignedSecurities: [],
        actual: known ? row : undefined,
      })),
  ].filter(
    (row) =>
      art === 'alle' || row.assignedSecurities.some((security) => matchesAsset(security.kind, art)),
  );
  const geometry =
    known && view.risk!.allocation.rows.every((row) => row.shareBp >= 0 && row.shareBp <= 10000);
  const circumference = 2 * Math.PI * 70;
  const targetLink = (
    <AppLink
      to="/einstellungen/anlageklassen"
      search={{ panel: 'sollquoten' }}
      state={{ panelOpenedInApp: true }}
    >
      In Einstellungen bearbeiten
    </AppLink>
  );
  return (
    <div className="wealth-allocation-v3">
      <section className="wealth-sheet" aria-labelledby="allocation-v3-title">
        <div className="wealth-section-head">
          <h2 id="allocation-v3-title">Ist, Ziel und Abweichung</h2>
          {targetLink}
        </div>
        <div className="wealth-allocation-columns">
          <div className="wealth-donut">
            {geometry ? (
              <svg
                width="170"
                height="170"
                viewBox="0 0 190 190"
                role="img"
                aria-label="Ist-Aufteilung des gesamten Anlageuniversums"
              >
                <g transform="rotate(-90 95 95)">
                  {view.risk!.allocation.rows.map((row, i) => {
                    const length = (row.shareBp / 10000) * circumference;
                    const start = view
                      .risk!.allocation.rows.slice(0, i)
                      .reduce(
                        (sum, previous) => sum + (previous.shareBp / 10000) * circumference,
                        0,
                      );
                    return (
                      <circle
                        key={row.assetClass}
                        cx="95"
                        cy="95"
                        r="70"
                        fill="none"
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth="26"
                        strokeDasharray={`${length} ${circumference - length}`}
                        strokeDashoffset={-start}
                      />
                    );
                  })}
                </g>
                <text x="95" y="90" textAnchor="middle" fill="var(--ink-2)" fontSize="12">
                  Anlageuniversum
                </text>
                <text
                  x="95"
                  y="112"
                  textAnchor="middle"
                  fill="var(--ink)"
                  fontSize="15"
                  fontWeight="650"
                >
                  {view.valueCents === null ? '—' : eur(view.valueCents)}
                </text>
              </svg>
            ) : (
              <p className="vnote">
                {known ? 'Negative Anteile: Werte in der Tabelle.' : 'Aufteilung nicht verfügbar.'}
              </p>
            )}
          </div>
          <table className="wealth-table wealth-allocation-table">
            <thead>
              <tr>
                <th>Klasse</th>
                <th className="num">Ist %</th>
                <th className="num">Ziel %</th>
                <th className="num">Abw. Pp</th>
                <th className="num">Abw. €</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <i
                      style={{
                        background:
                          COLORS[
                            Math.max(
                              0,
                              view.risk?.allocation.rows.findIndex(
                                (actual) => actual.assetClass === row.id,
                              ) ?? 0,
                            ) % COLORS.length
                          ],
                      }}
                    />
                    {row.name}
                  </th>
                  <td className="num">{percentText(row.actual?.shareBp ?? null)}</td>
                  <td className="num">{percentText(row.targetBp)}</td>
                  <td className="num">
                    {row.actual && row.targetBp !== null
                      ? percentText(row.actual.deviationBp, true).replace('%', 'Pp')
                      : '—'}
                  </td>
                  <td className="num">
                    {row.actual && row.targetBp !== null ? eur(-row.actual.gapCents) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="vnote">
          Abweichung = Ist − Ziel, keine Orderempfehlung. Basis: ausgewählte Positionen plus
          Anlage-Kassa einschließlich negativer Salden.{' '}
          {art !== 'alle' && 'Der Filter ändert das Anlageuniversum und die Zielquoten nicht.'}
          {view.quality.confidence === 'provisional' &&
            ' Vorläufig: Klassifikation und Bewertung prüfen; Sparplanoptimierung wird zurückgehalten.'}
        </p>
      </section>
      <AllocationStages view={view} />
      <section className="wealth-sheet wealth-allocation-action">
        <span>
          Abweichung über die nächste Sparrate ausgleichen. Zielallokation und Stufen bleiben in den
          Einstellungen.
        </span>
        <AppLink
          className="wealth-action"
          to="/vermoegen/portfolio/sparplaene"
          hash="funding-plan-title"
        >
          Sparrate anpassen
        </AppLink>
      </section>
    </div>
  );
}

const percentText = (...args: Parameters<typeof rawPercentText>) =>
  privateAmount(rawPercentText(...args));
