import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { overspentEnvelopes } from '@budget/domain';
import { Button, SectionHead } from '@budget/ui';
import { budgetQuery } from '../budget/budget-api';
import { planRows } from '../budget/plan-model';
import { EnvelopePanel } from '../budget/envelope-panel';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';

/** An additional action surface; these categories do not enter the Prüfen task count. */
export function OverspentCategories({ month }: { month: string }) {
  const query = useQuery(budgetQuery(month));
  const [selected, setSelected] = useState<string>();
  if (query.isPending) return <LoadingNote what="Überzogene Kategorien" />;
  if (query.isError)
    return (
      <ErrorNote
        what="Überzogene Kategorien"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const rows = planRows(data);
  const ids = new Set(overspentEnvelopes(data.summary).map((row) => row.categoryId));
  const overspent = rows.filter((row) => ids.has(row.id));
  if (!overspent.length) return null;
  return (
    <section className="inbox-overspent" aria-label="Überzogene Kategorien">
      <SectionHead title="Überzogene Kategorien" />
      <ul>
        {overspent.map((row) => (
          <li key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <span className="text-muted">
                {data.groups.find((group) => group.id === row.groupId)?.name}
              </span>
            </div>
            <span className="text-alert">{eur(-row.overspentCents)}</span>
            <Button variant="ghost" onClick={() => setSelected(row.id)}>
              Decken
            </Button>
          </li>
        ))}
      </ul>
      <EnvelopePanel
        month={month}
        row={rows.find((row) => row.id === selected)}
        rows={rows}
        toBeAssignedCents={data.summary.toBeAssignedCents}
        onClose={() => setSelected(undefined)}
      />
    </section>
  );
}
