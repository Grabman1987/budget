import { Button } from '@budget/ui';
import { useState } from 'react';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur } from '../ledger/format';

type BankPart = { id: string; amountCents: number; incomeTypeId: string | null };

/** Only income types change; the server checks the original parts and retains their cents. */
export function PayrollBankParts({ id, parts }: { id: string; parts: BankPart[] }) {
  const [types, setTypes] = useState(parts.map((p) => p.incomeTypeId ?? ''));
  const [busy, setBusy] = useState(false);
  const write = useBudgetWrite();
  const changed = types.some((type, index) => type !== parts[index]?.incomeTypeId);
  return (
    <details>
      <summary>Einnahmenarten der Bankanteile bearbeiten</summary>
      <form
        className="pp-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void write(
            () =>
              request<{ groupId: string }>(
                'PUT',
                `/api/payslips/${encodeURIComponent(id)}/bank-parts`,
                {
                  expectedParts: parts,
                  incomeTypeIds: types,
                },
              ),
            () => 'Einnahmenarten gespeichert.',
          ).finally(() => setBusy(false));
        }}
      >
        {parts.map((part, index) => (
          <label key={part.id}>
            Bankanteil {index + 1} · {eur(part.amountCents)}
            <select
              aria-label={`Einnahmenart Bankanteil ${index + 1}`}
              value={types[index]}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value;
                setTypes((previous) => previous.map((type, i) => (i === index ? value : type)));
              }}
            >
              <option value="income-salary">Laufendes Gehalt</option>
              <option value="income-special">Sonderzahlung</option>
              <option value="income-refund">Erstattung</option>
            </select>
          </label>
        ))}
        <Button type="submit" disabled={busy || !changed}>
          Einnahmenarten speichern
        </Button>
      </form>
    </details>
  );
}
