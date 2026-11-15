import { Button } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { useState } from 'react';

type Notice = {
  id: string;
  receiptId: string;
  filename: string | null;
  classification: 'bonus' | 'pension';
  status: string;
  token: string;
};
const label = (item: Notice) =>
  item.classification === 'bonus' ? 'Bonus-Mitteilung' : 'Pensionskassen-Mitteilung';

/** Retained originals and a frozen, individually classified batch preview of legacy proposals. */
export function NoticeArchive({ enabled }: { enabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<Notice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const archive = useQuery({
    queryKey: ['payslip-intake', 'notices'],
    enabled: enabled && expanded,
    queryFn: () => request<{ items: Notice[] }>('GET', '/api/document-intake/notices'),
  });
  const write = useBudgetWrite();
  const pending = archive.data?.items.filter((item) => item.status === 'pending') ?? [];
  const apply = async () => {
    if (!preview || busy) return;
    setBusy(true);
    const result = await write(
      () =>
        request<{ groupId: string }>('POST', '/api/document-intake/notices/archive', {
          items: preview.map(({ id, token }) => ({ id, token })),
        }),
      () => 'Mitteilungen archiviert. Originale bleiben erhalten.',
    );
    if (result) setPreview(null);
    await archive.refetch();
    setBusy(false);
  };
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Mitteilungsarchiv und offene Importvorschläge</summary>
      {expanded && (
        <>
          {archive.isError && <p role="alert">Mitteilungsarchiv konnte nicht geladen werden.</p>}
          {archive.isPending && <p role="status">Mitteilungen werden geladen …</p>}
          {archive.data?.items.length === 0 && <p>Noch keine Mitteilungen gespeichert.</p>}
          <ul>
            {archive.data?.items.map((item) => (
              <li key={item.id}>
                Original:{' '}
                <a href={`/api/receipts/${item.receiptId}/download`}>
                  {item.filename ?? 'PDF herunterladen'}
                </a>
                <p>
                  Klassifikation: {label(item)}. Gehaltsimport-Vorschlag:{' '}
                  {item.status === 'pending' ? 'offen' : 'verworfen'}. Original bleibt erhalten.
                </p>
              </li>
            ))}
          </ul>
          {pending.length > 0 && !preview && (
            <Button onClick={() => setPreview(pending.slice(0, 100))}>
              Archivierung prüfen ({Math.min(pending.length, 100)})
            </Button>
          )}
          {preview && (
            <section aria-label="Archivierungsvorschau">
              <p>
                {preview.length} einzeln erkannte Mitteilungen archivieren. Nur die
                Gehaltsimport-Vorschläge werden verworfen; Originale und Klassifikation bleiben
                erhalten. Es wird nichts gebucht.
              </p>
              <ul>
                {preview.map((item) => (
                  <li key={item.id}>
                    {item.filename} · {label(item)}
                  </li>
                ))}
              </ul>
              <Button disabled={busy} onClick={() => void apply()}>
                Mitteilungen gemeinsam archivieren
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
                Abbrechen
              </Button>
            </section>
          )}
        </>
      )}
    </details>
  );
}
