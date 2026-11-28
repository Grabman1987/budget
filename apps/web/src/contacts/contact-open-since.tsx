import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { summarizeOpenSinceSettlement } from '@budget/domain';
import { Button } from '@budget/ui';
import type { listContactChecklist } from '@budget/db';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

type Checklist = ReturnType<typeof listContactChecklist>;

/** Toolbar button that copies the open items since the last settlement as plain text. */
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
    <>
      <Button variant="ghost" onClick={copy}>
        Offene Posten kopieren
      </Button>
      <span role="status" aria-live="polite" className="contacts-copy-status">
        {copied === 'done' && 'Text kopiert.'}
        {copied === 'failed' && 'Kopieren nicht möglich.'}
      </span>
    </>
  );
}
