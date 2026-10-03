import { Button, Field, Select } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { lookupsQuery } from '../ledger/queries';
import '../pages/data-sources.css';

/** Explicit owner confirmation; the regular editor remains available after posting. */
export function BankCandidate({ id }: { id: string }) {
  const query = useQuery(lookupsQuery());
  const [categoryId, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  return (
    <div className="bank-candidate">
      <Field label="Kategorie">
        {({ id }) => (
          <Select
            id={id}
            value={categoryId}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Später zuordnen / Zu verteilen</option>
            {query.data?.categories
              .filter((c) => c.kind !== 'card_payment')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Button
        disabled={busy}
        size="sm"
        onClick={() => {
          setBusy(true);
          void write(
            () =>
              request<{ groupId: string }>(
                'POST',
                '/api/bank-sync/candidates/' + encodeURIComponent(id) + '/confirm',
                { categoryId: categoryId || null },
              ),
            () => 'Bankumsatz als Buchung bestätigt.',
          ).finally(() => setBusy(false));
        }}
      >
        Als Buchung bestätigen
      </Button>
    </div>
  );
}
