import { useRouter } from '@tanstack/react-router';
import type { PayslipAutomationOutcome, StatementAutomationOutcome } from '@budget/domain';

/** Where everything that still needs the owner waits. */
export const REVIEW_PATH = '/konten/pruefen';

/** Plain-language lines for a finished statement upload; no amounts, names or file content. */
export function statementOutcomeLines(
  outcome: StatementAutomationOutcome | null | undefined,
  duplicate = false,
): string[] {
  if (duplicate) return ['Diese Datei war schon vorhanden. Es wurde nichts wiederholt.'];
  if (!outcome || outcome.status === 'review' || outcome.status === 'undone') {
    const open = outcome ? outcome.pending.length : 0;
    return [
      'PDF gespeichert, ausgewertet und noch nichts gebucht.',
      open > 0
        ? `${open} ${open === 1 ? 'Zeile wartet' : 'Zeilen warten'} unter Prüfen.`
        : 'Die erkannten Angaben bestätigst du in der Vorschau.',
    ];
  }
  if (outcome.status === 'unchanged')
    return ['Bereits vorhandener Stand. Es wurde nichts wiederholt.'];
  const lines = [
    `Neue Buchungen: ${outcome.created}. Bestehende zugeordnet: ${outcome.matched}. Gutschriften: ${outcome.credits}.`,
  ];
  if (outcome.pending.length > 0)
    lines.push(
      `${outcome.pending.length} ${outcome.pending.length === 1 ? 'Zeile wartet' : 'Zeilen warten'} unter Prüfen.`,
    );
  return lines;
}

/** Plain-language lines for a finished payslip upload. */
export function payslipOutcomeLines(result: {
  duplicate: boolean;
  automation?: PayslipAutomationOutcome | undefined;
}): string[] {
  if (result.duplicate)
    return ['Dieser Gehaltszettel war schon vorhanden. Es wurde nichts wiederholt.'];
  switch (result.automation?.status) {
    case 'booked':
      return [
        'Gehaltszettel gespeichert und die Auszahlung gebucht. Das lässt sich rückgängig machen.',
      ];
    case 'linked':
      return ['Gehaltszettel gespeichert und mit der vorhandenen Auszahlung verknüpft.'];
    case 'unchanged':
      return ['Bereits vorhandener Stand. Es wurde nichts wiederholt.'];
    case 'pruefen':
      return ['Gehaltszettel gespeichert. Die Auszahlung wartet unter Prüfen auf dich.'];
    default:
      return ['Gehaltszettel gespeichert und ausgewertet. Es wurde nichts gebucht.'];
  }
}

/**
 * Closing block of the central upload: what was detected, what happened, and where the open rest
 * waits. Works with and without a router (component tests render it standalone).
 */
export function DocumentOutcome({
  typeLabel,
  lines,
  onNavigate,
}: {
  typeLabel: string;
  lines: string[];
  /** Called before in-app navigation so a hosting dialog can close. */
  onNavigate?: (() => void) | undefined;
}) {
  const router = useRouter({ warn: false }) as ReturnType<typeof useRouter> | undefined;
  return (
    <section className="document-outcome" aria-label="Ergebnis des Uploads">
      <p className="document-outcome-type">
        Erkannt: <strong>{typeLabel}</strong>
      </p>
      <ul className="document-outcome-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <a
        className="document-outcome-link"
        href={REVIEW_PATH}
        onClick={(event) => {
          if (!router || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
            return;
          event.preventDefault();
          onNavigate?.();
          void router.navigate({ to: REVIEW_PATH });
        }}
      >
        Zu Prüfen
      </a>
    </section>
  );
}
