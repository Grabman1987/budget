import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAmountPrivacy } from '@budget/ui';
import { contactOverviewQuery } from '../reports/contact-api';
import { AppLink } from '../shell/app-link';
import { eur } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';

export function PlanContactAdvances() {
  useAmountPrivacy();
  const [open, setOpen] = useState(false);
  const query = useQuery({ ...contactOverviewQuery(), enabled: open });
  const contacts = query.data?.contacts.filter((c) => c.receivableCents > 0 || c.creditCents > 0);
  return (
    <details
      className="plan-contact-advances"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Auslagen für Kontakte</summary>
      {open && (
        <>
          <p>Offene Auslagen und Guthaben · Stand heute</p>
          {query.isPending && <LoadingNote what="Auslagen" />}
          {query.isError && (
            <ErrorNote what="Auslagen" error={query.error} onRetry={() => void query.refetch()} />
          )}
          {!query.isPending &&
            !query.isError &&
            contacts &&
            (contacts.length ? (
              <ul>
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <AppLink to={`/konten/kontakte/${encodeURIComponent(contact.id)}`} search={{}}>
                      {contact.name}
                    </AppLink>
                    <span>
                      Offen {eur(contact.receivableCents)}
                      {contact.creditCents > 0 && <> · Guthaben {eur(contact.creditCents)}</>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Keine offenen Auslagen.</p>
            ))}
        </>
      )}
    </details>
  );
}
