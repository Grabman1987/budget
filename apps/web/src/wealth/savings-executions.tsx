import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { longDay, nativeCurrency } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { savingsProposalsQuery, type SavingsExecutionProposal } from './savings-api';
import { TradePanel } from './trade-panel';

/** Reuses the same actual-execution form, duplicate guard and audited writer as Prüfen. */
export function SavingsExecutions() {
  useAmountPrivacy();
  const query = useQuery(savingsProposalsQuery());
  const [proposal, setProposal] = useState<SavingsExecutionProposal | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => {
    setProposal(null);
    requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus());
  };
  return (
    <section className="wealth-sheet" aria-label="Fällige Sparplanausführungen">
      <h2>Ausführungen prüfen</h2>
      {query.isPending && <LoadingNote what="Sparplanausführungen" />}
      {query.isError && (
        <ErrorNote
          what="Sparplanausführungen"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data?.proposals.length === 0 && (
        <EmptyNote>Keine offenen Sparplanausführungen.</EmptyNote>
      )}
      <ul className="wealth-action-list">
        {query.data?.proposals.map((row) => (
          <li key={row.id}>
            <span>
              {row.securityName} · {row.accountName}
              <br />
              Geplant {longDay(row.date)} · {nativeCurrency(row.amountCents, row.currency)}
            </span>
            <Button
              variant="ghost"
              onClick={(event) => {
                opener.current = event.currentTarget;
                setProposal(row);
              }}
            >
              Ausführung prüfen
            </Button>
          </li>
        ))}
      </ul>
      <p className="vnote">
        Datum, Stück und tatsächlich ausgeführten Bruttobetrag bestätigen. Die Vorschau erfasst
        keinen Handel und löst keinen Bankauftrag aus.
      </p>
      {proposal && <TradePanel id="neu" proposal={proposal} onClose={close} onSaved={close} />}
    </section>
  );
}
