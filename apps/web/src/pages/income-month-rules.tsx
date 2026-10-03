import type { IncomeMonthRule } from '@budget/domain';
import { Button, Field, SectionHead, Select } from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { lookupsQuery, payeesQuery } from '../ledger/queries';
import { PAGES } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import './data-sources.css';

/** Owner defaults for future captures; source categorization is still an explicit decision. */
export function IncomeMonthRulesPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['income-month-rules'],
    queryFn: () => request<{ rules: IncomeMonthRule[] }>('GET', '/api/income-month-rules'),
  });
  const lookups = useQuery(lookupsQuery());
  const payees = useQuery(payeesQuery());
  const write = useBudgetWrite();
  const [scope, setScope] = useState<IncomeMonthRule['scope']>('incomeType');
  const [targetId, setTarget] = useState('');
  const [nextMonth, setNext] = useState(true);
  const [busy, setBusy] = useState(false);
  const sources = {
    payee: payees.data?.payees ?? [],
    category: lookups.data?.categories.filter((c) => c.kind === 'income') ?? [],
    incomeType: lookups.data?.incomeTypes ?? [],
  };
  const ready = query.isSuccess && lookups.isSuccess && payees.isSuccess && !query.isFetching;
  const rules = query.data?.rules ?? [];
  async function save(rules: IncomeMonthRule[]) {
    setBusy(true);
    try {
      await write(
        () => request<{ groupId: string }>('PUT', '/api/income-month-rules', { rules }),
        () => 'Budgetmonat-Regeln gespeichert.',
      );
      await qc.invalidateQueries({ queryKey: ['income-month-rules'] });
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageFrame
      meta={PAGES.find((p) => p.path === '/einstellungen/zuordnung')!}
      revealCurrentRegister
    >
      <section className="data-sources" aria-labelledby="income-rules-title">
        <SectionHead id="income-rules-title" title="Budgetmonat für Einnahmen" />
        <p>
          Zum Beispiel: Gehalt immer für den Folgemonat. Die Regel gilt für neue Einnahmen; jede
          Buchung lässt sich einzeln ändern. Datum, Kategorie und Einnahmeart bleiben erhalten.
        </p>
        <p className="text-muted">
          Die Regel des Zahlers geht vor der Einnahmenkategorie, diese vor der Einnahmeart. Ohne
          Regel gilt der Buchungsmonat. Bankumsätze werden weiterhin von dir zugeordnet.
        </p>
        {(query.isPending || lookups.isPending || payees.isPending) && (
          <p role="status">Regeln werden geladen …</p>
        )}
        {(query.isError || lookups.isError || payees.isError) && (
          <p role="alert">
            Regeln konnten nicht geladen werden.{' '}
            <Button
              variant="ghost"
              onClick={() => {
                void query.refetch();
                void lookups.refetch();
                void payees.refetch();
              }}
            >
              Erneut laden
            </Button>
          </p>
        )}
        <form
          className="source-account"
          onSubmit={(e) => {
            e.preventDefault();
            const next = rules.filter((r) => r.scope !== scope || r.targetId !== targetId);
            void save([...next, { scope, targetId, nextMonth }]);
          }}
        >
          <Field label="Regel für">
            {({ id }) => (
              <Select
                id={id}
                value={scope}
                disabled={busy || !ready}
                onChange={(e) => {
                  setScope(e.target.value as IncomeMonthRule['scope']);
                  setTarget('');
                }}
              >
                <option value="incomeType">Einnahmeart</option>
                <option value="category">Einnahmenkategorie</option>
                <option value="payee">Zahler</option>
              </Select>
            )}
          </Field>
          <Field label="Quelle">
            {({ id }) => (
              <Select
                id={id}
                value={targetId}
                required
                disabled={busy || !ready}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Bitte wählen</option>
                {sources[scope].map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Standard-Budgetmonat">
            {({ id }) => (
              <Select
                id={id}
                value={String(nextMonth)}
                disabled={busy || !ready}
                onChange={(e) => setNext(e.target.value === 'true')}
              >
                <option value="true">Für nächsten Monat</option>
                <option value="false">Für den Buchungsmonat</option>
              </Select>
            )}
          </Field>
          <Button type="submit" disabled={busy || !ready || !targetId}>
            Regel speichern
          </Button>
        </form>
        {ready && rules.length === 0 && <p>Noch keine Budgetmonat-Regel.</p>}
        {rules.map((r) => (
          <div className="source-account" key={r.scope + r.targetId}>
            <p>
              {sources[r.scope].find((s) => s.id === r.targetId)?.name ??
                'Quelle nicht mehr verfügbar'}{' '}
              · {r.nextMonth ? 'Für nächsten Monat' : 'Für den Buchungsmonat'}
            </p>
            <Button
              variant="ghost"
              disabled={busy || !ready}
              aria-label={`Regel entfernen: ${sources[r.scope].find((s) => s.id === r.targetId)?.name ?? 'Quelle nicht mehr verfügbar'}`}
              onClick={() => void save(rules.filter((x) => x !== r))}
            >
              Regel entfernen
            </Button>
          </div>
        ))}
      </section>
    </PageFrame>
  );
}
