import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@budget/ui';
import type { InflationReport } from '@budget/db';
import type { z } from 'zod';
import type { inflationBasketChanges } from '@budget/domain';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PageFrame } from './placeholder-page';
import '../reports/spending-reports.css';
import './inflation-basket-settings.css';

type Row = InflationReport['basketSettings'][number];
type Change = z.infer<typeof inflationBasketChanges>['changes'][number];
const PATH = '/api/inflation-basket';
const RHYTHMS = {
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  quarterly: 'Quartalsweise',
  semiannual: 'Halbjährlich',
  yearly: 'Jährlich',
};

export function InflationBasketSettingsPage() {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'inflation-basket-settings'],
    retry: false,
    queryFn: () => request<{ categories: Row[] }>('GET', PATH),
  });
  const write = useBudgetWrite();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async (changes: Change[]) => {
    setBusy(true);
    const result = await write(
      () => request<{ groupId: string }>('PUT', PATH, { changes }),
      () => 'Warenkorb gespeichert.',
    );
    if (result) setSelected([]);
    setBusy(false);
  };
  const rows = query.data?.categories ?? [];
  return (
    <PageFrame
      meta={PAGES.find((p) => p.path === '/einstellungen/warenkorb')!}
      title="Warenkorb (Teuerung)"
    >
      <section className="sr-card basket-settings" aria-labelledby="basket-settings-title">
        <div className="sr-head">
          <h2 id="basket-settings-title">Kategorien im Warenkorb</h2>
          <AppLink to="/reports/inflation">Zur persönlichen Inflation</AppLink>
        </div>
        <p className="sr-note">
          Automatisch zählen Bedarf-Fixkosten und regelmäßige periodische Kosten mit. Wunsch und
          Zukunft brauchen „Immer“. Verträge messen Preise; das 12-Monats-Mittel enthält auch
          Verbrauch und Nachzahlungen. Schuldzinsen über die Empfänger-Auswahl ausschließen; Namen
          werden nicht automatisch bewertet.
        </p>
        <div className="basket-actions">
          <span role="status">{selected.length} ausgewählt</span>
          <Button
            disabled={busy || !selected.length}
            onClick={() =>
              void save(selected.map((categoryId) => ({ categoryId, inclusion: 'always' })))
            }
          >
            In den Warenkorb
          </Button>
        </div>
        {query.isPending && <LoadingNote what="Warenkorb" />}
        {query.isError && (
          <ErrorNote what="Warenkorb" error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.isSuccess && !rows.length && (
          <p className="sr-note">Noch keine Ausgabenkategorien angelegt.</p>
        )}
        {[...new Set(rows.map((c) => c.groupId))].map((group) => (
          <fieldset className="basket-group" key={group} disabled={busy}>
            <legend>{rows.find((c) => c.groupId === group)!.groupName}</legend>
            {rows
              .filter((c) => c.groupId === group)
              .map((c) => (
                <div className="basket-category" key={c.id} data-testid={'basket-category-' + c.id}>
                  <div className="basket-category-top">
                    <label className="basket-selection">
                      <input
                        type="checkbox"
                        aria-label={'Auswählen: ' + c.name}
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, c.id]
                              : selected.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <strong>{c.name}</strong>
                    </label>
                    <label>
                      Im Warenkorb
                      <select
                        aria-label={'Im Warenkorb: ' + c.name}
                        value={c.inclusion ?? 'automatic'}
                        onChange={(e) =>
                          void save([
                            {
                              categoryId: c.id,
                              inclusion:
                                e.target.value === 'automatic'
                                  ? null
                                  : (e.target.value as 'always' | 'never'),
                            },
                          ])
                        }
                      >
                        <option value="automatic">Automatisch</option>
                        <option value="always">Immer</option>
                        <option value="never">Nie</option>
                      </select>
                    </label>
                    <label>
                      Methode
                      <select
                        aria-label={'Methode: ' + c.name}
                        value={
                          c.trailingMean === null
                            ? 'automatic'
                            : c.trailingMean
                              ? 'trailing'
                              : 'contracts'
                        }
                        onChange={(e) =>
                          void save([
                            {
                              categoryId: c.id,
                              trailingMean:
                                e.target.value === 'automatic'
                                  ? null
                                  : e.target.value === 'trailing',
                            },
                          ])
                        }
                      >
                        <option value="automatic">Automatisch</option>
                        <option value="contracts">Verträge</option>
                        <option value="trailing">12-Monats-Mittel</option>
                      </select>
                    </label>
                  </div>
                  <p className="sr-note">
                    {c.included ? 'Im Warenkorb' : 'Nicht im Warenkorb'} · {c.reason}
                  </p>
                  {c.inclusion !== null && (
                    <p className="sr-note">Automatisch: {c.automaticReason}</p>
                  )}
                  <details>
                    <summary>Empfänger und Verträge · {c.payees.length}</summary>
                    {c.payees.length === 0 ? (
                      <p className="sr-note">Noch keine passenden Buchungen oder Verträge.</p>
                    ) : (
                      c.payees.map((p) => (
                        <label className="basket-payee" key={p.id ?? 'none'}>
                          <input
                            type="checkbox"
                            checked={p.included}
                            aria-label={p.name + ' zählt mit'}
                            onChange={(e) =>
                              void save([
                                {
                                  categoryId: c.id,
                                  excludedPayeeIds: e.target.checked
                                    ? c.excludedPayeeIds.filter((id) => id !== p.id)
                                    : [...c.excludedPayeeIds, p.id],
                                },
                              ])
                            }
                          />
                          <span>
                            {p.name} · zählt mit
                            {p.contracts.length > 0 && <small>{p.contracts.join(', ')}</small>}
                            {p.rhythm && (
                              <small>
                                {RHYTHMS[p.rhythm]}
                                {!p.contracts.length ? ' · aus Buchungen abgeleitet' : ''}
                              </small>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </details>
                </div>
              ))}
          </fieldset>
        ))}
      </section>
    </PageFrame>
  );
}
