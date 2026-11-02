import { targetTierStarts } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { longDay, eur } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { targetVersionsQuery, type PortfolioAllocationView } from './allocation-api';
import { percentText } from './portfolio-format';

/** Read-only projection of saved tiers; activation and the month-end buffer stay in the resolver. */
export function AllocationStages({ view }: { view: PortfolioAllocationView }) {
  useAmountPrivacy();
  const query = useQuery(targetVersionsQuery());
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
      <ul className="wealth-action-list">
        {version?.tiers.map((tier, index) => (
          <li key={starts[index]}>
            <span>
              <strong>
                {tier.label || `Stufe ${index + 1}`} · ab {eur(starts[index]!)}
              </strong>
              {view.policy.wealthStage?.fromCents === starts[index] && (
                <span> · {view.policy.wealthStage?.inBuffer ? 'aktiv im Puffer' : 'aktiv'}</span>
              )}
              <br />
              {tier.targets
                .map(
                  (target) =>
                    `${view.classes.find((row) => row.id === target.assetClassId)?.name ?? 'Anlageklasse'} ${percentText(target.targetShareBp)}`,
                )
                .join(' · ')}
              {tier.condition && (
                <>
                  <br />
                  Hinweis: {tier.condition}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
