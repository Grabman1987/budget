import type { RebalanceProposal } from '@budget/domain';
import { Button } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';
import { LoadingNote, ErrorNote } from '../ledger/states';
import { eurWhole } from '../ledger/format';
import { allocationQuery, type PortfolioAllocationView } from './allocation-api';
import { percentText } from './portfolio-format';
import { TargetPanel } from './target-panel';
import { TargetSetNote } from './target-set';
import './allocation.css';

export function PortfolioAllocation() {
  const query = useQuery(allocationQuery());
  const search = useSearch({ strict: false }) as {
    allokation?: string;
    produkt?: string;
    handel?: string;
    sparplan?: string;
  };
  const navigate = useNavigate();
  const open =
    search.allokation === 'ziele' && !search.produkt && !search.handel && !search.sparplan;
  const select = (allokation?: string) =>
    void navigate({
      to: '/vermoegen/portfolio',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        allokation,
        produkt: undefined,
        handel: undefined,
        sparplan: undefined,
      })) as never,
    });
  const view = query.isError ? undefined : query.data;
  const risk = view?.risk;
  const known = !!risk && risk.allocation.totalCents > 0;
  const rows =
    view?.classes.map((cls) => ({
      key: cls.id,
      name: cls.name,
      targetBp: cls.targetBp,
      bandBp: cls.bandBp,
      actual: risk?.allocation.rows.find((row) => row.assetClass === cls.id),
    })) ?? [];
  for (const row of risk?.allocation.rows ?? []) {
    if (!rows.some((cls) => cls.key === row.assetClass))
      rows.push({
        key: row.assetClass,
        name: 'Ohne Anlageklasse',
        targetBp: row.targetBp,
        bandBp: row.bandBp,
        actual: row,
      });
  }
  return (
    <>
      <section className="valloc" aria-labelledby="allocation-title">
        <div className="head">
          <h2 id="allocation-title">Aufteilung Soll/Ist</h2>
          <span className="aside">
            Band: höchstens ±5 Prozentpunkte oder ±25 % relativ; gespeicherte Bänder gelten
          </span>
        </div>
        {query.isPending && <LoadingNote what="Aufteilung" />}
        {query.isError && (
          <ErrorNote what="Aufteilung" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {view && (
          <>
            <TargetSetNote set={view.targetSet} />
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
                  const breach = actual?.breach ?? false;
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
                            ? `${actual.breach ? 'Außerhalb des Bands · ' : ''}${actual.targetBp === null ? 'Kein Soll festgelegt' : `${actual.side === 'under' ? 'Unter Soll' : actual.side === 'over' ? 'Über Soll' : 'Im Soll'} · Abstand ${eurWhole(Math.abs(actual.gapCents))}`}`
                            : row.targetBp === null
                              ? 'Kein Soll festgelegt'
                              : `Band ±${percentText(row.bandBp)}`}
                        </small>
                      </span>
                      <span className="va-track" aria-hidden="true">
                        {row.targetBp !== null && (
                          <>
                            <i
                              className="va-band"
                              style={{ left: `${left / 100}%`, width: `${(right - left) / 100}%` }}
                            />
                            <i className="va-soll" style={{ left: `${row.targetBp / 100}%` }} />
                          </>
                        )}
                        {actual && (
                          <i className="va-ist" style={{ width: `${actual.shareBp / 100}%` }} />
                        )}
                      </span>
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
              <Button variant="ghost" onClick={() => select('ziele')}>
                {view.targetSet.source === 'tiers'
                  ? 'Datierte Sollquoten bearbeiten'
                  : 'Sollquoten bearbeiten'}
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
                      className={`rev-row${proposal.direction === 'add' ? ' is-urgent' : ''}`}
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
                        <strong>{text.title}</strong>
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
              ? 'Alle Anlageklassen liegen im Band; keine weiteren Risikohinweise.'
              : 'Keine Sollquoten erfasst; keine weiteren Risikohinweise.'}
          </p>
        )}
      </section>
      <TargetPanel
        open={open}
        onClose={() => select()}
        view={view}
        onRetry={() => void query.refetch()}
        error={query.error}
        pending={query.isPending}
      />
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
  if (proposal.rule === 'R13')
    return {
      title: `${name} ${proposal.direction === 'add' ? 'unter' : 'über'} Soll`,
      body: `${percentText(proposal.shareBp)} statt ${percentText(proposal.referenceBp)} · ${amount} ${proposal.direction === 'add' ? 'fehlen. Neues Geld bevorzugt dorthin lenken.' : 'über Soll. Weitere Zukäufe prüfen.'}`,
    };
  if (proposal.rule === 'R15')
    return {
      title: `Spekulativer Anteil ${percentText(proposal.shareBp)} über ${percentText(proposal.referenceBp)} (R15)`,
      body: `${amount} über der Grenze. Zukäufe bei Krypto, P2P und Einzelaktien aussetzen, bis der Anteil innerhalb der Grenze liegt.`,
    };
  return {
    title: `${name} über ${percentText(proposal.referenceBp)} (R14)`,
    body: `${percentText(proposal.shareBp)} Anteil · ${amount} über der Grenze. Konzentration bei weiteren Zukäufen berücksichtigen.`,
  };
}
