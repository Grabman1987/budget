import { ChartValue } from '@budget/ui';
import type { RebalanceProposal } from '@budget/domain';
import { Button } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';
import { LoadingNote, ErrorNote } from '../ledger/states';
import { eurWhole } from '../ledger/format';
import { allocationQuery, type PortfolioAllocationView } from './allocation-api';
import { chartPercent } from '../charts/tooltip-data';
import { percentText } from './portfolio-format';
import { thresholdText } from '../rules/rules-model';
import { AppLink } from '../shell/app-link';
import './allocation.css';

export function PortfolioAllocation() {
  const query = useQuery(allocationQuery());
  const navigate = useNavigate();
  const select = () =>
    void navigate({
      to: '/einstellungen/anlageklassen',
      search: { panel: 'sollquoten' },
      state: { panelOpenedInApp: true },
    });
  const view = query.isError ? undefined : query.data;
  const risk = view?.risk;
  const provisional = view?.quality.confidence === 'provisional';
  const known = !!risk && risk.allocation.totalCents > 0;
  const rows =
    view?.classes.map((cls) => ({
      key: cls.id,
      name: cls.name,
      targetBp: cls.targetBp,
      bandBp: cls.bandBp,
      assignedSecurities: cls.assignedSecurities ?? [],
      actual: risk?.allocation.rows.find((row) => row.assetClass === cls.id),
    })) ?? [];
  for (const row of risk?.allocation.rows ?? []) {
    if (!rows.some((cls) => cls.key === row.assetClass))
      rows.push({
        key: row.assetClass,
        name: 'Ohne Anlageklasse',
        targetBp: row.targetBp,
        bandBp: row.bandBp,
        assignedSecurities: [],
        actual: row,
      });
  }
  return (
    <>
      <section className="valloc" aria-labelledby="allocation-title">
        <div className="head">
          <h2 id="allocation-title">Aufteilung Soll/Ist</h2>
          <span className="aside">
            {view ? thresholdText('R13', view.policy.R13) : 'Band laut Regelwerk'}
          </span>
        </div>
        {query.isPending && <LoadingNote what="Aufteilung" />}
        {query.isError && (
          <ErrorNote what="Aufteilung" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {view && (
          <>
            <p className="vnote" role="status">
              Netto-Allokationsuniversum:{' '}
              {view.valueCents === null ? 'Wert nicht verfügbar' : eurWhole(view.valueCents)}.
              Ist-Anteil = Klassenwert / Netto-Allokationsuniversum. Einbezogene Positionen plus
              Anlage-Kassa einschließlich negativer Salden bilden den Nenner. Negative Kassa mindert
              ihn; negative Klassenwerte ergeben negative Anteile, positive Klassen können über 100
              % liegen. Die Auswahl kann von der Bestandsliste abweichen. Bewertung{' '}
              {view.quality.valuationQuality === 'exact'
                ? 'vollständig'
                : view.quality.valuationQuality === 'estimated'
                  ? 'teilweise geschätzt / veraltet'
                  : 'unvollständig'}
              . Unklassifiziert:{' '}
              {view.quality.unclassifiedValueCents === null
                ? 'Wert nicht verfügbar'
                : eurWhole(view.quality.unclassifiedValueCents)}{' '}
              · {percentText(view.quality.unclassifiedShareBp)} ·{' '}
              {view.quality.unclassifiedProductCount} Produkte / Cash-Positionen.
              {view.quality.valuationQuality === 'estimated' &&
                ` Geschätzter / veralteter Anteil: ${percentText(view.quality.estimatedShareBp)}.`}
              {` Geschätzte Werte: ${view.quality.estimatedSecurityIds.length} Produkte. Veraltete Werte: ${view.quality.staleSecurityIds.length} Produkte.`}
              {provisional &&
                ' Hinweise sind vorläufig; zuerst Klassifikation und Bewertung prüfen. Sparplanoptimierung wird zurückgehalten.'}
            </p>
            {view.quality.unclassifiedSecurityIds.length > 0 && (
              <ul
                className="allocation-quality-links"
                aria-label="Unklassifizierte Positionen zuordnen"
              >
                {view.quality.unclassifiedSecurityIds.map((id) => (
                  <li key={id}>
                    <AppLink
                      className="allocation-security-link"
                      to={
                        id.startsWith('cash:')
                          ? '/einstellungen/konten'
                          : '/einstellungen/anlageklassen'
                      }
                      search={() =>
                        id.startsWith('cash:') ? {} : { panel: 'instrument', instrument: id }
                      }
                      state={{ panelOpenedInApp: true }}
                    >
                      {id.startsWith('cash:')
                        ? 'Anlage-Cash in Kontoeinstellungen zuordnen'
                        : `${view.names.securities[id] ?? 'Instrument'} · Anlageklasse zuordnen`}
                    </AppLink>
                  </li>
                ))}
              </ul>
            )}
            {risk && (
              <p className="vnote">
                Brutto-Exposure: {eurWhole(risk.cluster.totalGrossExposureCents)}. R14/R15 teilen
                das jeweilige Brutto-Exposure durch den Marktwert des Netto-Allokationsuniversums (
                {eurWhole(risk.cluster.totalCents)}), nicht durch die Brutto-Summe. Hebel erhöhen
                den Zähler; negative Kassa senkt den Nenner. Risikoanteile können deshalb über 100 %
                liegen.
              </p>
            )}
            {!known && (
              <p className="vnote" role="status">
                {view.status === 'unavailable'
                  ? `${view.missing.includes('missing_price') ? 'Kurs fehlt. ' : ''}${view.missing.includes('missing_fx') ? 'Wechselkurs fehlt. ' : ''}Ist-Anteile und Rebalancing sind nicht berechenbar.`
                  : view.status === 'empty'
                    ? 'Kein aktueller Bestand. Sollquoten können bereits festgelegt werden.'
                    : 'Keine positive Bewertungsbasis. Ist-Anteile und Rebalancing sind nicht bestimmbar.'}
              </p>
            )}
            {rows.length === 0 ? (
              <p className="vnote">Noch keine Anlageklassen erfasst.</p>
            ) : (
              <ul className="vallo">
                {rows.map((row) => {
                  const actual = known ? row.actual : undefined;
                  const breach = !provisional && (actual?.breach ?? false);
                  // Geometry only: target/band/actual arrive from the shared server projection.
                  const left =
                    row.targetBp === null || row.bandBp === null
                      ? 0
                      : Math.max(0, row.targetBp - row.bandBp);
                  const right =
                    row.targetBp === null || row.bandBp === null
                      ? 0
                      : Math.min(10_000, row.targetBp + row.bandBp);
                  return (
                    <li key={row.key} className={breach ? 'is-out' : ''}>
                      <span className="va-name">
                        {row.name}
                        <small>
                          {actual
                            ? `${provisional ? 'Vorläufig · ' : ''}${actual.breach ? 'Außerhalb des Bands · ' : ''}${actual.targetBp === null ? 'Kein Soll festgelegt' : `${actual.side === 'under' ? 'Unter Soll' : actual.side === 'over' ? 'Über Soll' : 'Im Soll'} · Umschichtungsabstand ${eurWhole(Math.abs(actual.gapCents))}`}`
                            : row.targetBp === null
                              ? 'Kein Soll festgelegt'
                              : `Band ±${percentText(row.bandBp)}`}
                        </small>
                        {row.assignedSecurities
                          .filter((s) => !s.held || s.kind === 'other')
                          .map((s) => (
                            <small key={s.securityId}>
                              <AppLink
                                className="allocation-security-link"
                                to="/vermoegen/portfolio"
                                search={(previous) => ({ ...previous, produkt: s.securityId })}
                              >
                                {s.name}
                              </AppLink>
                              {!s.held && (
                                <> · {s.isin ?? 'ISIN nicht hinterlegt'} · noch nicht gekauft</>
                              )}
                              {s.kind === 'other' && (
                                <> · Typ „Sonstiges“ prüfen · im Wertpapier bearbeiten</>
                              )}
                            </small>
                          ))}
                      </span>
                      <ChartValue
                        label="Allocation Soll/Ist"
                        date={view!.asOf}
                        series={[
                          {
                            name: 'Ist',
                            value: actual ? chartPercent(actual.shareBp) : '–',
                            color: 'var(--line)',
                          },
                          {
                            name: 'Soll',
                            value: row.targetBp === null ? '–' : chartPercent(row.targetBp),
                            color: 'var(--line-2)',
                          },
                        ]}
                      >
                        <span className="va-track" aria-hidden="true">
                          {row.targetBp !== null && (
                            <>
                              <i
                                className="va-band"
                                style={{
                                  left: `${left / 100}%`,
                                  width: `${(right - left) / 100}%`,
                                }}
                              />
                              <i className="va-soll" style={{ left: `${row.targetBp / 100}%` }} />
                            </>
                          )}
                          {actual && (
                            <i
                              className="va-ist"
                              style={{
                                width: `${Math.max(0, Math.min(100, actual.shareBp / 100))}%`,
                              }}
                            />
                          )}
                        </span>
                      </ChartValue>
                      <span className="va-val">
                        <strong>{percentText(actual?.shareBp ?? null)}</strong>
                        <small>Soll {percentText(row.targetBp)}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="allocation-actions">
              <Button variant="ghost" onClick={() => select()}>
                Sollquoten bearbeiten
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="vrebal" aria-labelledby="rebalance-title">
        <div className="head">
          <h2 id="rebalance-title">Rebalancing</h2>
          {known && (
            <span className="aside">
              {risk!.allocation.breaches.length} Klassen außerhalb des Bands
            </span>
          )}
        </div>
        {!known ? (
          <p className="vnote">
            {query.isPending
              ? 'Bewertung wird geladen.'
              : 'Hinweise stehen erst mit vollständiger aktueller Bewertung über 0 € zur Verfügung.'}
          </p>
        ) : risk!.proposals.length ? (
          <>
            <table className="rev-table">
              <caption className="sr-only">
                Hinweise zum Rebalancing ohne automatische Order
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="tech">
                    Rev.
                  </th>
                  <th scope="col" className="tech">
                    Änderung
                  </th>
                  <th scope="col" className="tech">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody>
                {risk!.proposals.map((proposal, i) => {
                  const text = proposalText(proposal, view!);
                  return (
                    <tr
                      className={`rev-row${proposal.confidence === 'exact' && proposal.direction === 'add' ? ' is-urgent' : ''}`}
                      key={`${proposal.code}:${proposal.assetClass}:${proposal.subjectId}`}
                    >
                      <td className="rev-mark">
                        <svg className="rev-tri" viewBox="0 0 28 26" aria-hidden="true">
                          <path d="M14 1 27 25H1Z" />
                          <text x="14" y="20" textAnchor="middle">
                            {String.fromCharCode(65 + i)}
                          </text>
                        </svg>
                      </td>
                      <td className="rev-what">
                        <strong>
                          {proposal.confidence === 'provisional' ? 'Vorläufig: ' : ''}
                          {text.title}
                        </strong>
                        <span>{text.body}</span>
                      </td>
                      <td className="rev-act">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            document
                              .getElementById('positions-title')
                              ?.scrollIntoView({ behavior: 'instant', block: 'start' })
                          }
                        >
                          Positionen ansehen
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="vnote">
              Entscheidungshinweise. Käufe, Verkäufe und Sparplanänderungen werden hier nicht
              ausgelöst.
            </p>
          </>
        ) : (
          <p className="rev-empty">
            <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden="true" />
            {view!.classes.some((cls) => cls.targetBp !== null)
              ? `${provisional ? 'Vorläufig: ' : ''}Alle Anlageklassen liegen im Band; keine weiteren Risikohinweise.`
              : 'Keine Sollquoten erfasst; keine weiteren Risikohinweise.'}
          </p>
        )}
      </section>
    </>
  );
}
function proposalText(proposal: RebalanceProposal, view: PortfolioAllocationView) {
  const name = proposal.assetClass
    ? (view.classes.find((cls) => cls.id === proposal.assetClass)?.name ?? 'Anlageklasse')
    : proposal.code === 'r14_single'
      ? (view.names.securities[proposal.subjectId ?? ''] ?? 'Instrument')
      : (view.names.institutions[proposal.subjectId ?? ''] ?? 'Plattform');
  const amount = eurWhole(proposal.gapCents);
  const unheldNames =
    proposal.direction === 'add'
      ? (view.classes
          .find((cls) => cls.id === proposal.assetClass)
          ?.assignedSecurities?.filter((s) => !s.held)
          .map((s) => s.name) ?? [])
      : [];
  if (proposal.rule === 'R13')
    return {
      title: `${name} ${proposal.direction === 'add' ? 'unter' : 'über'} Soll`,
      body: `${percentText(proposal.shareBp)} statt ${percentText(proposal.referenceBp)} · Umschichtungsabstand ${amount} bei unverändertem Gesamtwert.${proposal.newCapitalCents !== null ? ` Neues Kapital bis Soll: ${eurWhole(proposal.newCapitalCents)} bei Einzahlung nur in diese Klasse.` : ''}${unheldNames.length ? ` Zugeordnet, noch nicht gekauft: ${unheldNames.join(', ')}.` : ''}`,
    };
  if (proposal.rule === 'R15')
    return {
      title: `Spekulativer Anteil ${percentText(proposal.shareBp)} über ${percentText(proposal.referenceBp)} (R15)`,
      body: `${amount} Bruttoexposure über der Grenze. ${proposal.confidence === 'provisional' ? 'Bewertung und Klassifikation prüfen, bevor weitere Zukäufe beurteilt werden.' : 'Weitere Zukäufe spekulativer Produkte einschließlich gehebelter ETF prüfen.'}`,
    };
  return {
    title: `${name} über ${percentText(proposal.referenceBp)} (R14)`,
    body: `${percentText(proposal.shareBp)} Bruttoexposure / Marktwert · ${amount} Bruttoexposure über der Grenze. Konzentration bei weiteren Zukäufen berücksichtigen.`,
  };
}
