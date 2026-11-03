import { targetTierStarts } from '@budget/domain';
import { privateAmount, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { longDay, eur } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { allocationStageVersionsQuery, type PortfolioAllocationView } from './allocation-api';
import { percentText as rawPercentText } from './portfolio-format';

/** Read-only projection of saved tiers; activation and the month-end buffer stay in the resolver. */
export function AllocationStages({ view }: { view: PortfolioAllocationView }) {
  useAmountPrivacy();
  const query = useQuery(allocationStageVersionsQuery());
  const version = query.data?.versions.find(
    (item) => item.validFrom === view.policy.targetValidFrom,
  );
  const starts = targetTierStarts(version?.tiers ?? []);
  return (
    <section className="wealth-sheet" aria-label="Vermögensstufen">
      <div className="wealth-section-head">
        <h2>Vermögensstufen</h2>
        <AppLink
          to="/einstellungen/anlageklassen"
          search={{ panel: 'sollquoten' }}
          state={{ panelOpenedInApp: true }}
        >
          In Einstellungen bearbeiten
        </AppLink>
      </div>
      {query.isPending && <LoadingNote what="Vermögensstufen" />}
      {query.isError && (
        <ErrorNote
          what="Vermögensstufen"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {version && (
        <p className="vnote">
          Gespeicherte Zielversion ab {longDay(version.validFrom)}. Bedingungen sind Hinweise; ein
          Stufenwechsel folgt dem bestehenden Resolver mit 10 % Puffer am Monatsende.
        </p>
      )}
      {query.isSuccess && !version?.tiers.length && (
        <EmptyNote>Keine Vermögensstufen in der gültigen Zielversion hinterlegt.</EmptyNote>
      )}
      {version && version.tiers.length > 0 && (
        <div className="wealth-stage-scroll">
          <table className="wealth-table wealth-stage-table">
            <thead>
              <tr>
                <th>Stufe</th>
                <th className="num">ab Invest.</th>
                {view.classes.map((row) => (
                  <th key={row.id} className="num">
                    {row.name}
                  </th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {version.tiers.map((tier, index) => (
                <tr
                  key={starts[index]}
                  data-selected={
                    view.policy.wealthStage?.fromCents === starts[index] ? '1' : undefined
                  }
                >
                  <th scope="row">
                    {tier.label || `Stufe ${index + 1}`}
                    {tier.condition && <small>{tier.condition}</small>}
                  </th>
                  <td className="num">{eur(starts[index]!)}</td>
                  {view.classes.map((row) => (
                    <td key={row.id} className="num">
                      {percentText(
                        tier.targets.find((target) => target.assetClassId === row.id)
                          ?.targetShareBp ?? null,
                      )}
                    </td>
                  ))}
                  <td>
                    {view.policy.wealthStage?.fromCents === starts[index] ? (
                      <span className="wealth-pill">
                        {view.policy.wealthStage?.inBuffer ? 'aktiv im Puffer' : 'aktiv'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const percentText = (...args: Parameters<typeof rawPercentText>) =>
  privateAmount(rawPercentText(...args));
