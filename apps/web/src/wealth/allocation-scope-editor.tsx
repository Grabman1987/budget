import { defaultAllocationIncluded } from '@budget/domain';
import type { AllocationAccountChange } from '@budget/db';
import { Field, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PortfolioAllocationView } from './allocation-api';

export function AllocationScopeEditor({
  view,
  changes,
  onChange,
}: {
  view: PortfolioAllocationView;
  changes: AllocationAccountChange[];
  onChange: (value: AllocationAccountChange[]) => void;
}) {
  const query = useQuery(accountsQuery());
  return (
    <section aria-labelledby="allocation-scope-title" className="allocation-scope-editor">
      <h3 id="allocation-scope-title">1. Konten und Depots auswählen</h3>
      <p className="vnote">
        Nur diese Konten zählen für Vermögensstufen und Cashanteil. Depot und separates
        Verrechnungskonto einzeln auswählen. Geldbörse, Gehaltskonto und Haushaltsreserve können
        ausgeschlossen bleiben. Negative Salden zählen mit.
      </p>
      <p className="vnote">
        Die Auswahl gilt sofort für Aufteilung, Risikoprüfung, Reports und Sparplanvorschläge, auch
        bei einer zukünftigen Sollversion. Historische Auswertungen verwenden ebenfalls die aktuelle
        Kontenauswahl.
      </p>
      {query.isPending && <LoadingNote what="Konten" />}
      {query.isError && (
        <ErrorNote what="Konten" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data?.accounts
        .filter((a) => !['credit_card', 'loan', 'other_liability', 'receivable'].includes(a.type))
        .map((a) => {
          const draft = changes.find((c) => c.id === a.id) ?? {
            id: a.id,
            included:
              a.allocationScope === 'included' ||
              ((a.allocationScope ?? 'default') === 'default' && defaultAllocationIncluded(a.type)),
            cashClassId: a.allocationAssetClassId ?? null,
            expectedScope: a.allocationScope ?? 'default',
            expectedCashClassId: a.allocationAssetClassId ?? null,
          };
          const change = (patch: Partial<AllocationAccountChange>) =>
            onChange([...changes.filter((c) => c.id !== a.id), { ...draft, ...patch }]);
          return (
            <div key={a.id} className="allocation-scope-row">
              <label className="asset-check">
                <input
                  type="checkbox"
                  checked={draft.included}
                  onChange={(e) => change({ included: e.target.checked })}
                />
                {a.name}
                {a.closedAt ? ' · geschlossen' : ''}
              </label>
              {draft.included && (
                <Field label={`${a.name} · Klasse für Cash / Kontowert`}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={draft.cashClassId ?? ''}
                      onChange={(e) => change({ cashClassId: e.target.value || null })}
                    >
                      <option value="">Ohne Anlageklasse</option>
                      {view.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          );
        })}
      <p className="vnote">
        Wertpapiere behalten ihre eigene, datierte Klassenzuordnung. Die Cash-Klasse gilt nur für
        Geld am Konto beziehungsweise den reinen Kontowert ohne Wertpapierbestand.
      </p>
    </section>
  );
}
