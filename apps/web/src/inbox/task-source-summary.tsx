import { Button } from '@budget/ui';
import type { InboxTaskSource } from '@budget/domain';

export function TaskSourceSummary({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<InboxTaskSource, number>;
  selected: InboxTaskSource | undefined;
  onSelect: (source: InboxTaskSource | undefined) => void;
}) {
  return (
    <table className="rev-table inbox-task-sources">
      <caption className="sr-only">Alle offenen Aufgaben nach Quelle</caption>
      <thead>
        <tr>
          <th scope="col">Quelle</th>
          <th scope="col">Offen</th>
          <th scope="col">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {(
          [
            ['accounts', 'Konten prüfen'],
            ['plan', 'Plan'],
            ['receipts', 'Belege ohne Buchung'],
            ['payslips', 'Gehaltszettel'],
            ['other', 'Weitere Aufgaben'],
          ] as const
        ).map(([source, label]) => (
          <tr key={source}>
            <th scope="row">{label}</th>
            <td>{counts[source]}</td>
            <td>
              <Button
                variant="ghost"
                disabled={source !== 'receipts' && counts[source] === 0 && selected !== source}
                aria-expanded={selected === source}
                aria-label={`${label} ${selected === source ? 'schließen' : 'öffnen'}`}
                onClick={() => onSelect(selected === source ? undefined : source)}
              >
                {selected === source ? 'Schließen' : 'Öffnen'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
