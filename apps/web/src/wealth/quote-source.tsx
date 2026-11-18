import { parseArivaUrl } from '@budget/market';
import { Field, TextInput } from '@budget/ui';

export const ARIVA_LINK_ERROR =
  'Bitte den HTTPS-Link der Ariva-Seite „Historische Kurse“ eingeben.';
export const validArivaLink = (value: string): boolean => !!parseArivaUrl(value.trim());

/** A refresh can fail on one provider and succeed on its fallback at the same timestamp. */
export function latestQuoteFailure(
  attempts: ReadonlyArray<{ attemptedAt: string; outcome: string }> = [],
): string | null {
  if (!attempts.length) return null;
  const latestAt = attempts.reduce(
    (latest, attempt) => (attempt.attemptedAt > latest ? attempt.attemptedAt : latest),
    attempts[0]!.attemptedAt,
  );
  const latest = attempts.filter((attempt) => attempt.attemptedAt === latestAt);
  return latest.some((attempt) => attempt.outcome === 'ok') ? null : latest[0]!.outcome;
}

export function quoteFailureText(
  error: string,
  currency?: string,
  sourceCurrency?: string,
): string {
  switch (error) {
    case 'empty':
      return 'Die Quelle liefert für diesen Zeitraum keine Kurse';
    case 'http':
      return 'Die Quelle war nicht erreichbar';
    case 'currency_mismatch':
      if (!currency) return 'Die Quelle liefert eine andere Kurswährung';
      return sourceCurrency
        ? `Die Quelle liefert ${sourceCurrency}, das Wertpapier wird in ${currency} geführt`
        : `Die Quelle liefert eine andere Kurswährung; das Wertpapier wird in ${currency} geführt`;
    case 'not_configured':
      return 'Für diese Quelle fehlt eine passende Zuordnung';
    default:
      return `Kursabruf fehlgeschlagen (${error})`;
  }
}

export function ArivaLinkField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <Field
      label="Ariva-Link · Historische Kurse"
      error={error}
      hint="Auf ariva.de die Seite „Historische Kurse“ öffnen und den HTTPS-Link hier einfügen."
    >
      {({ id, describedBy, invalid }) => (
        <TextInput
          id={id}
          value={value}
          maxLength={500}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
