import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { summarizeOpenSinceSettlement } from '@budget/domain';
import { Button, maskMoneyText } from '@budget/ui';
import type { listContactChecklist } from '@budget/db';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { eur } from '../ledger/format';

type Checklist = ReturnType<typeof listContactChecklist>;

/** Read-only overview "Offen seit letztem Ausgleich" with a copyable plain-text list. */
export function ContactOpenSince({ contactId, asOf }: { contactId: string; asOf: string }) {
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const list = useQuery({
    queryKey: [...LEDGER_KEY, 'contact-open-since', contactId, asOf],
    retry: false,
    queryFn: () =>
      request<Checklist>(
        'GET',
        `/api/contacts/${encodeURIComponent(contactId)}/checklist?asOf=${encodeURIComponent(asOf)}`,
      ),
  });
  const data = list.data;
  if (!data || !Array.isArray(data.outlays) || !Array.isArray(data.contributions)) return null;
  const contributions = data.contributions.filter((c) => c.selectable);
  if (data.outlays.length === 0 && contributions.length === 0) return null;
  const summary = summarizeOpenSinceSettlement({
    outlays: data.outlays,
    credits: data.credits ?? [],
    contributions,
  });
  const copy = () => {
    const write = navigator.clipboard?.writeText(summary.text);
    if (!write) return setCopied('failed');
    write.then(
      () => setCopied('done'),
      () => setCopied('failed'),
    );
  };
  return (
    <section aria-labelledby="contacts-open-since" className="contacts-open-since">
      <h3 id="contacts-open-since">Offen seit letztem Ausgleich</h3>
      <ul>
        {data.outlays.map((o) => (
          <li key={o.splitId}>
            {maskMoneyText(
              `${o.date.slice(8, 10)}.${o.date.slice(5, 7)}.${o.date.slice(0, 4)} · ${
                [o.payeeName, o.memo].filter(Boolean).join(' - ') || 'Auslage'
              }: ${eur(o.remainingCents)}`,
            )}
          </li>
        ))}
        {contributions.map((c) => (
          <li key={c.occurrenceId}>
            {maskMoneyText(
              `Fällig ${c.dueDate.slice(8, 10)}.${c.dueDate.slice(5, 7)}.${c.dueDate.slice(0, 4)} · ${c.name}: ${eur(c.amountCents)}`,
            )}
          </li>
        ))}
      </ul>
      <p data-testid="open-since-total">
        {maskMoneyText(
          `Auslagen ${eur(summary.outlayCents)}${
            summary.creditCents ? `, abzüglich Guthaben ${eur(summary.creditCents)}` : ''
          }${summary.contributionCents ? `, plus fällige Beiträge ${eur(summary.contributionCents)}` : ''}: insgesamt ${eur(summary.dueCents)}`,
        )}
      </p>
      <div className="contacts-actions">
        <Button onClick={copy}>Text kopieren</Button>
        <span role="status" aria-live="polite">
          {copied === 'done' && 'Text kopiert.'}
          {copied === 'failed' && 'Kopieren nicht möglich. Bitte den Text markieren.'}
        </span>
      </div>
    </section>
  );
}
